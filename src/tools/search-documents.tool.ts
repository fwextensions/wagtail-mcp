import axios, { AxiosError } from "axios";
import { z } from "zod";
import * as dotenv from "dotenv";
import { zNullToUndefined } from "./zodNullToUndefined";
// Import FastMCP types
import type { FastMCP, Tool, Content, Context, ContentResult } from "fastmcp";
import { UserError } from "fastmcp";

dotenv.config();

// --- Environment Variables ---
const WAGTAIL_BASE_URL = process.env.WAGTAIL_BASE_URL;
const WAGTAIL_API_PATH = process.env.WAGTAIL_API_PATH || "/api/v2";
const WAGTAIL_API_KEY = process.env.WAGTAIL_API_KEY;

// --- Tool Definition ---
const toolName = "search_documents";
const toolDescription = "Searches for Wagtail documents based on a query string. Allows specifying the search operator (and/or). Returns a list of matching documents with their ID, title, and download URL.";

// --- Input Parameters Schema ---
// Define the Zod object directly
const parameters = z.object({
	query: zNullToUndefined(z.string().min(1)).describe(
		"The search term to use for finding documents."),
	search_operator: zNullToUndefined(z.enum(["and", "or"]).optional().default("and")).describe(
		`The logical operator to use if the query contains multiple terms ('and' or 'or'). Defaults to 'and'.`)
});

// Type alias for validated arguments
type SearchDocsArgs = z.infer<typeof parameters>;

// --- Helper Types ---
// Define the structure of an item in the API response
interface DocumentApiResponseItem {
	id: number;
	meta: {
		type: string;
		detail_url: string;
		download_url: string; // Expecting this
	};
	title: string;
}

// Define the structure of the API response
interface DocumentApiResponse {
	meta: {
		total_count: number;
	};
	items: DocumentApiResponseItem[];
}

// Use a generic context type
type ToolContext = Context<any>;

// --- Tool Handler (Execute Function) ---
const execute = async (
	args: SearchDocsArgs,
	context: ToolContext
): Promise<ContentResult> => {
	context.log.info(`Executing ${toolName} tool with args:`, args);

	if (!WAGTAIL_BASE_URL) {
		context.log.error("WAGTAIL_BASE_URL environment variable is not set.");
		throw new Error("Server configuration error: WAGTAIL_BASE_URL is not set.");
	}

	// Construct API URL and Parameters
	const baseUrl = WAGTAIL_BASE_URL.replace(/\/$/, "");
	const apiBasePath = WAGTAIL_API_PATH.replace(/^\/|\/$/g, "");
	const apiUrl = `${baseUrl}/${apiBasePath}/documents/`; // Target the documents endpoint

	const queryParams: Record<string, string> = {
		search: args.query, // query is guaranteed by min(1)
	};
	// search_operator has a default, so it will always be present
	queryParams.search_operator = args.search_operator;

	// Configure Headers
	const headers: Record<string, string> = { "Accept": "application/json" };
	if (WAGTAIL_API_KEY) {
		headers["Authorization"] = `Bearer ${WAGTAIL_API_KEY}`;
	}

	context.log.info(`Calling Wagtail API: ${apiUrl}`, { params: queryParams });

	// Make API Call
	try {
		const response = await axios.get<DocumentApiResponse>(apiUrl, {
			headers: headers,
			params: queryParams,
			// Omitting signal handling for now, axios might timeout based on config
		});

		context.log.info(`Received response from Wagtail API`, { status: response.status });

		// Basic validation of response structure
		if (!response.data || !response.data.meta || !Array.isArray(response.data.items)) {
			 let responseSample = "[Unable to stringify response]";
			 try { responseSample = JSON.stringify(response.data).substring(0, 200); } catch(e){}
			context.log.error("API response data missing or invalid structure.", { dataSample: responseSample });
			throw new Error(`API request successful (Status ${response.status}) but response data missing or invalid.`);
		}

		// Process and Filter Results
		const filteredItems = response.data.items.map(item => {
			 // Add extra validation if necessary
			 if (!item || typeof item.id !== 'number' || typeof item.title !== 'string' || !item.meta || typeof item.meta.download_url !== 'string') {
				 context.log.warn("Skipping item with missing/invalid fields in API response", { itemId: item?.id });
				 return null; // Mark as null to filter out later
			 }
			 return {
				 id: item.id,
				 title: item.title,
				 download_url: item.meta.download_url
			 };
		 }).filter(item => item !== null); // Remove null items

		// Format for MCP: content array with a single text item containing stringified JSON
		let outputJson: string;
		try {
			outputJson = JSON.stringify({
				count: filteredItems.length,
				total_available: response.data.meta.total_count,
				items: filteredItems
			}, null, 2);
		} catch (stringifyError) {
			 context.log.error("Failed to stringify processed items", { error: String(stringifyError) });
			 throw new Error("Failed to format results.");
		}


		return {
			content: [{ type: "text", text: outputJson }],
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
		context.log.error(`Error executing ${toolName}`, errorDetails); // Log serializable details

		// Throw appropriate error type
		if (axios.isAxiosError(error)) {
			const status = error.response?.status;
			let message = `Wagtail API request failed`;
			if (status) message += ` with status ${status}`;
			message += `: ${error.message}`;

			if (status && status >= 400 && status < 500) {
				// Consider 404 specifically? API might return empty list instead of 404 for no search results.
				throw new UserError(`Client error calling Wagtail Documents API (Status: ${status}). Check query.`, { detail: message, request: errorDetails });
			} else {
				throw new Error(`Server or network error calling Wagtail Documents API: ${message}`);
			}
		} else if (error instanceof UserError) {
			throw error; // Re-throw UserErrors
		} else {
			throw new Error(`An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
};

// --- Registration Function (Exported) ---
export function registerTool(server: FastMCP) {
	// Pass object directly to addTool
	server.addTool({
		name: toolName,
		description: toolDescription,
		parameters: parameters,
		execute: execute,
	});
}
