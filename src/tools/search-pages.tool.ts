import { z } from 'zod';
import axios, { AxiosError } from 'axios';
import * as dotenv from 'dotenv';
import { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';

dotenv.config();

// --- Configuration ---
const WAGTAIL_BASE_URL = process.env.WAGTAIL_BASE_URL;
const WAGTAIL_API_PATH = process.env.WAGTAIL_API_PATH || '/api/v2/';
const WAGTAIL_API_KEY = process.env.WAGTAIL_API_KEY;

// --- Tool Definition ---

export const name = 'search_pages'; 
export const description = 'Searches pages from the Wagtail CMS API based on a query.';

// Define parameters the tool accepts
export const paramsSchema = {
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
  query: z
    .string()
    .describe('Query term to search pages. This is required.'),
  locale: z
    .string()
    .optional()
    .default('en')
    .describe('The locale code (e.g., en, es) to filter pages by. Defaults to en.'),
  // Add other relevant Wagtail API parameters as needed (e.g., child_of, descendant_of)
};

// Define the expected structure of a single page item RETURNED BY THIS TOOL
const ReturnedPageSchema = z.object({
  id: z.number(),
  type: z.string(), 
  slug: z.string(), 
  title: z.string(),
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

// --- Tool Handler ---

export const toolCallback: ToolCallback<typeof paramsSchema> = async (
  args,
  extra
) => {
//  console.log(`Handling tool call: ${name} with args:`, args);

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

  // 4. Prepare Query Params from Tool Args
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
  // Map other args to query params here

  // 5. Make API Call
  try {
//    console.log(`Fetching pages from: ${apiUrl} with params:`, queryParams);
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

    const apiPages = validationResult.data.items;
    const totalCount = validationResult.data.meta.total_count;
//    console.log(`Successfully fetched ${apiPages.length} of ${totalCount} pages.`);

    // 7. Map API response to the desired simpler format
    const returnedPages = apiPages.map(page => ({
      id: page.id,
      // Assuming meta is returned even if not explicitly in fields
      type: page.meta?.type || 'unknown', // Add safe access
      slug: page.meta?.slug || 'unknown', // Add safe access
      title: page.title,
    }));

    // 8. Validate the final structure (optional but good practice)
    const finalValidation = z.array(ReturnedPageSchema).safeParse(returnedPages);
     if (!finalValidation.success) {
       console.error('Final response validation failed:', finalValidation.error);
       // Decide how to handle this - log, throw, or return potentially incorrect data?
       // For now, we'll log and proceed, but ideally, this shouldn't happen if mapping is correct.
     }

    // 9. Map to CallToolResult format
    return {
      content: [
        {
          type: 'text',
          // Return the simplified, mapped items
          text: JSON.stringify({
            count: returnedPages.length,
            total_count: totalCount,
            items: returnedPages // Use the mapped array
          }),
        },
      ],
    };
  } catch (error) {
    console.error(`Error in ${name} tool:`, error);

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const errorData = axiosError.response?.data;
      throw new Error(
        `Wagtail API request failed with status ${status}: ${JSON.stringify(errorData)}`
      );
    }

    throw new Error(`An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`);
  }
};
