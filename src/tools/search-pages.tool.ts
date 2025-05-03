import axios, { AxiosError } from "axios";
import * as dotenv from "dotenv";
import { zNullToUndefined } from "./zodNullToUndefined";
// Import FastMCP types
import type { FastMCP, Tool, Content, Context, ContentResult } from "fastmcp"; // Added ContentResult
import { UserError } from "fastmcp"; // Removed FastMCPLog
import { z } from "zod";

dotenv.config();

// --- Environment Variables ---
const WAGTAIL_BASE_URL = process.env.WAGTAIL_BASE_URL;
const WAGTAIL_API_PATH = process.env.WAGTAIL_API_PATH || "/api/v2";
const WAGTAIL_API_KEY = process.env.WAGTAIL_API_KEY;

// --- Tool Definition ---
const toolName = "search_pages";
const toolDescription = "Searches pages from the Wagtail CMS API based on a query.\nAllows filtering by type, locale, and controlling the search operator. Supports pagination.";

// --- Input Parameters Schema ---
const parameters = z.object({
	query: z.string().describe("Query term to search pages. This is required."),
	type: z.string().optional().describe("Filter by page type (e.g., blog.BlogPage)."),
	locale: z.string().default("en").describe("The locale code (e.g., en, es) to filter pages by. Defaults to en."),
	limit: z.number().int().positive().default(50).describe("Maximum number of pages to return."),
	offset: z.number().int().nonnegative().optional().describe("Offset for pagination."),
	search_operator: z.enum(["and", "or"]).optional().describe("Search operator for multiple terms (\"and\" or \"or\"). Defaults based on Wagtail search backend."),
}).refine(data => data.query !== undefined && data.query.trim() !== '', {
	message: "The 'query' parameter is required and cannot be empty.",
	path: ["query"], // Specify the path of the error
});

// Type alias for validated arguments
type SearchPagesArgs = z.infer<typeof parameters>;

// --- Helper Types ---
// Basic structure expected from Wagtail API (adjust as needed)
interface WagtailPageItem {
	id: number;
	meta: {
		type: string;
		detail_url: string;
		html_url: string | null;
		slug: string;
		first_published_at: string | null;
		locale?: string; // Add if locale is expected
	};
	title: string;
	// Add other potential fields returned by default or requested via 'fields'
	[key: string]: any; // Allow other fields
}

interface WagtailPagesApiResponse {
	meta: {
		total_count: number;
	};
	items: WagtailPageItem[];
}

// Expected output structure for each page item
const OutputPageSchema = z.object({
	id: z.number(),
	type: z.string(),
	locale: z.string().optional(), // Make optional if not always present
	title: z.string(),
	slug: z.string(),
	url: z.string().url().nullable(),
	detail_api_url: z.string().url(),
});
type OutputPage = z.infer<typeof OutputPageSchema>;

// Use a generic context type for simplicity if auth isn't used
type ToolContext = Context<any>;

// --- Tool Handler ---
const execute = async (
	args: SearchPagesArgs, // Explicitly typed args
	context: ToolContext
): Promise<ContentResult> => { // Return ContentResult
	context.log.info(`Executing ${toolName} tool with args:`, args);

	if (!WAGTAIL_BASE_URL) {
		context.log.error("WAGTAIL_BASE_URL environment variable is not set.");
		throw new Error("Server configuration error: WAGTAIL_BASE_URL is not set.");
	}

	// Construct API URL and Query Params
	const apiBasePath = WAGTAIL_API_PATH.replace(/^\/|\/$/g, "");
	const apiEndpoint = `/${apiBasePath}/pages/`;
	const baseUrl = WAGTAIL_BASE_URL.replace(/\/$/, "");
	const apiUrl = `${baseUrl}${apiEndpoint}`;

	const queryParams: Record<string, string | number> = {
		search: args.query!, // Assert non-null as it's validated by refine
		limit: args.limit,
	};
	if (args.type !== undefined) queryParams.type = args.type;
	if (args.locale !== undefined) queryParams.locale = args.locale;
	if (args.offset !== undefined) queryParams.offset = args.offset;
	if (args.search_operator !== undefined) queryParams.search_operator = args.search_operator;

	const headers: Record<string, string> = { "Accept": "application/json" };
	if (WAGTAIL_API_KEY) {
		headers["Authorization"] = `Bearer ${WAGTAIL_API_KEY}`;
	}

	context.log.info(`Calling Wagtail API: ${apiUrl}`, { params: queryParams });

	try {
		const response = await axios.get<WagtailPagesApiResponse>(apiUrl, { params: queryParams, headers });
		context.log.info(`Received response from Wagtail API`, { status: response.status });

		const results = response.data;
		if (!results || !results.meta || results.items === undefined) {
			// Stringify potentially non-serializable results for logging
			let resultsString = "[Unable to stringify results]";
			try {
				resultsString = JSON.stringify(results);
			} catch (e) { /* Ignore stringify error */ }
			context.log.error("Received invalid or incomplete data structure from Wagtail API.", { dataString: resultsString });
			throw new Error("Received invalid data structure from Wagtail API.");
		}

		// Map API response to the desired simpler format
		let outputItems: OutputPage[];
		outputItems = results.items.map(item => ({
			id: item.id,
			type: item.meta.type,
			locale: item.meta.locale,
			title: item.title,
			slug: item.meta.slug,
			url: item.meta.html_url,
			detail_api_url: item.meta.detail_url,
			// Include other fields if they are part of the default response and needed
		}));

		// Prepare JSON output
		let outputJson: string;
		try {
			 // Validate final structure before stringifying (optional but recommended)
			const finalValidation = z.array(OutputPageSchema).safeParse(outputItems);
			if (!finalValidation.success) {
				context.log.warn("Final mapped output validation failed:", finalValidation.error.format());
				 // Decide how to handle: throw, return partial, return empty? Returning for now.
			}
			outputJson = JSON.stringify(
				 {
					 count: results.meta.total_count,
					 items: finalValidation.success ? finalValidation.data : outputItems // Use validated data if possible
				 }, null, 2);
		} catch (stringifyError) {
			context.log.error("Failed to stringify API response data", { error: String(stringifyError) });
			throw new Error("Failed to format API response.");
		}

		// Return ContentResult structure
		return {
			content: [{ type: "text", text: outputJson }], // No backticks
		};

	} catch (error: unknown) {
		// Log serializable details
		let errorDetails: Record<string, any> = { message: String(error) };
		if (axios.isAxiosError(error)) {
			errorDetails.status = error.response?.status;
			try {
				errorDetails.data = JSON.parse(JSON.stringify(error.response?.data ?? null));
			} catch (parseError) {
				errorDetails.data = "Error serializing response data";
			}
			errorDetails.code = error.code;
			errorDetails.requestUrl = error.config?.url;
			errorDetails.requestParams = error.config?.params;
		}
		context.log.error(`Error executing ${toolName}`, errorDetails);

		// Throw appropriate error type
		if (axios.isAxiosError(error)) {
			const status = error.response?.status;
			let message = `Wagtail API request failed`;
			if (status) message += ` with status ${status}`;
			message += `: ${error.message}`;

			if (status && status >= 400 && status < 500) {
				throw new UserError(`Client error calling Wagtail API (Status: ${status}). Check query or parameters.`, { detail: message, request: errorDetails });
			} else {
				throw new Error(`Server or network error calling Wagtail API: ${message}`);
			}
		} else if (error instanceof UserError) {
			throw error;
		} else {
			throw new Error(`An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
};

// --- Registration Function ---
export function registerTool(server: FastMCP) {
	// Pass object directly to addTool
	server.addTool({
		name: toolName,
		description: toolDescription,
		parameters: parameters,
		execute: execute,
	});
}
