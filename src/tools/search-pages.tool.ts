import { z } from 'zod';
import axios, { AxiosError } from 'axios';
import * as dotenv from 'dotenv';

// Attempt to import the result type, or define below if it fails
// import { CallToolResultContent } from '@modelcontextprotocol/sdk/types.js'; // Common types might be here

dotenv.config();

// --- Configuration ---
const WAGTAIL_BASE_URL = process.env.WAGTAIL_BASE_URL;
const WAGTAIL_API_PATH = process.env.WAGTAIL_API_PATH || '/api/v2/';
const WAGTAIL_API_KEY = process.env.WAGTAIL_API_KEY;

// --- Tool Definition ---

export const name = 'search_pages'; 
export const description = `Searches pages from the Wagtail CMS API based on a query.
Allows filtering by type, locale, and controlling the search operator. Supports pagination.`;

// Define the Zod *shape* for the tool's parameters (not the object instance)
export const paramsSchema = {
  query: z
    .string()
    .describe('Query term to search pages. This is required.'),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .default(50)
    .describe('Maximum number of pages to return.'),
  offset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Offset for pagination.'),
  type: z
    .string()
    .optional()
    .describe('Filter by page type (e.g., blog.BlogPage).'),
  locale: z
    .string()
    .optional()
    .default('en')
    .describe('The locale code (e.g., en, es) to filter pages by. Defaults to en.'),
  search_operator: z
    .preprocess((val) => (val === "" ? undefined : val),
      z.enum(['and', 'or'])
        .optional()
    )
    .describe('Search operator for multiple terms ("and" or "or"). Defaults based on Wagtail search backend.'),
};

// Define the actual Zod object from the shape for inference
const ParamsZodObject = z.object(paramsSchema);

// Minimal type for the 'extra' parameter based on error messages
// The MCP SDK likely expects this structure internally
interface RequestHandlerExtra {
  signal?: AbortSignal; // Make optional for flexibility if not always present
  // Add other properties if future errors indicate they are needed
}

// Define the expected structure of a single page item RETURNED BY THIS TOOL
const OutputPageSchema = z.object({
  id: z.number(),
  slug: z.string(), 
  title: z.string(),
  type: z.string(), 
});

// Define the expected structure of a single page item FROM THE WAGTAIL API
// (Adjust based on your actual Wagtail Page model and API fields)
const WagtailApiPageSchema = z.object({
  id: z.number(),
  meta: z.object({
    type: z.string(),
    slug: z.string(),
  }),
  title: z.string(),
  // Allow other fields from API, but we won't return them
}).passthrough();

// Define the expected structure of the Wagtail API response for listing pages
const WagtailApiResponseSchema = z.object({
  meta: z.object({
    total_count: z.number(),
  }),
  items: z.array(WagtailApiPageSchema), 
});

// Define the structure expected by the server based on SDK/error messages
// Corresponds to CallToolResult implicitly expected by server.tool()
interface CallToolResult {
	[x: string]: unknown;
	content: {
		type: "text";
		text: string;
	}[];
	_meta?: { [x: string]: unknown; };
	isError?: boolean; // Optional error flag
}

// --- Tool Handler ---

// Define the callback signature directly
export const toolCallback = async (
	// Explicitly type args using the Zod object derived from the shape
	args: z.infer<typeof ParamsZodObject>,
	// Use the minimal RequestHandlerExtra type
	extra: RequestHandlerExtra
	// Explicitly type the return Promise
): Promise<CallToolResult> => {
	// 1. Validate Environment Configuration
	if (!WAGTAIL_BASE_URL) {
		throw new Error('WAGTAIL_BASE_URL environment variable is not set.');
	}

	// 2. Construct API URL
	const baseUrl = WAGTAIL_BASE_URL.replace(/\/$/, ''); 
	const apiPath = WAGTAIL_API_PATH.startsWith('/')
		? WAGTAIL_API_PATH
		: `/${WAGTAIL_API_PATH}`;
	const pagesEndpoint = apiPath.endsWith('/') ? 'pages/' : '/pages/';
	const apiUrl = `${baseUrl}${apiPath}${pagesEndpoint}`;

	// 3. Prepare Headers
	const headers: Record<string, string> = {
		Accept: 'application/json',
	};
	if (WAGTAIL_API_KEY) {
		headers['Authorization'] = `Bearer ${WAGTAIL_API_KEY}`; 
	}

	// 4. Prepare Query Params from validated Tool Args
	const queryParams: Record<string, any> = {};
	if (args.limit !== undefined) queryParams.limit = args.limit;
	if (args.offset !== undefined) queryParams.offset = args.offset;
	if (args.type !== undefined) queryParams.type = args.type;
	// Request only top-level fields. Meta fields might be included by default.
	queryParams.fields = 'id,title';
	// Map the tool's 'query' param to Wagtail's 'search' API param
	if (args.query !== undefined) queryParams.search = args.query;
	// Map the tool's 'locale' param to Wagtail's 'locale' API param
	if (args.locale !== undefined) queryParams.locale = args.locale;
	// Map the tool's 'search_operator' param
	if (args.search_operator !== undefined) queryParams.search_operator = args.search_operator;
	// Map other args to query params here

	// 5. Make API Call
	try {
		const response = await axios.get(apiUrl, {
			headers: headers,
			params: queryParams,
		});

		// 6. Validate API Response
		const validationResult = WagtailApiResponseSchema.safeParse(response.data);
		if (!validationResult.success) {
			console.error('Wagtail API response validation failed:', validationResult.error);
			throw new Error(
				`Received invalid data structure from Wagtail API: ${validationResult.error.message}`
			);
		}

		const apiResponse = validationResult.data;
		const totalCount = apiResponse.meta.total_count;

		// 7. Map API response to the desired simpler format
		const outputItems = apiResponse.items.map((item) => ({
			id: item.id,
			slug: item.meta.slug,
			title: item.title,
			type: item.meta.type, 
		}));

		// 8. Validate the final structure (optional but good practice)
		const finalValidation = z.array(OutputPageSchema).safeParse(outputItems);
		if (!finalValidation.success) {
			console.error('Final response validation failed:', finalValidation.error);
			// Decide how to handle this - log, throw, or return potentially incorrect data?
			// For now, we'll log and proceed, but ideally, this shouldn't happen if mapping is correct.
		}

		// 9. Map to CallToolResult format
		const result: CallToolResult = {
			content: [
				// Ensure content item matches the defined structure
				{ type: "text", text: JSON.stringify({
					count: outputItems.length,
					total_count: totalCount,
					items: outputItems // Use the mapped array
				}, null, 2) },
			],
		};
		return result;
	} catch (error) {
		console.error(`Error in ${name} tool:`, error);

		if (axios.isAxiosError(error)) {
			const axiosError = error as AxiosError;
			const status = axiosError.response?.status;
			const errorData = axiosError.response?.data;
			const errorMessage = `Wagtail API request failed with status ${status}: ${JSON.stringify(errorData)}`;
			// Construct error response matching CallToolResult structure
			const errorResult: CallToolResult = {
				isError: true,
				content: [
					// Ensure content item matches the defined structure
					{ type: "text", text: errorMessage },
				],
			};
			return errorResult;
		}

		const errorMessage = `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`;
		// Construct error response matching CallToolResult structure
		const errorResult: CallToolResult = {
			isError: true,
			content: [
				// Ensure content item matches the defined structure
				{ type: "text", text: errorMessage },
			],
		};
		return errorResult;
	}
};
