import axios, { AxiosError } from "axios";
import { z } from "zod";
import * as dotenv from "dotenv";
import { zNullToUndefined } from "./zodNullToUndefined";
import type { FastMCP, Tool, Context, ContentResult } from "fastmcp";
import { UserError } from "fastmcp";

dotenv.config();

// --- Environment Variables ---
const WAGTAIL_BASE_URL = process.env.WAGTAIL_BASE_URL;
const WAGTAIL_API_PATH = process.env.WAGTAIL_API_PATH || "/api/v2";
const WAGTAIL_API_KEY = process.env.WAGTAIL_API_KEY;

// --- Tool Definition ---
const toolName = "get_document_details";
const toolDescription = "Retrieves details (ID, title, download URL) for a specific Wagtail document by its ID.";

// --- Input Parameters Schema ---
const parameters = z.object({
	id: z.number().int().positive().describe("The unique numeric ID of the document."),
});

// Type alias for validated arguments
type GetDocDetailsArgs = z.infer<typeof parameters>;

// --- Helper Types ---
interface DocumentDetailApiResponse {
	id: number;
	meta: {
		type: string;
		detail_url: string;
		download_url: string; 
	};
	title: string;
}

// Use a generic context type
type ToolContext = Context<any>;

// --- Tool Handler (Execute Function) ---
const execute = async (
	args: GetDocDetailsArgs,
	context: ToolContext
): Promise<ContentResult> => {
	context.log.info(`Executing ${toolName} tool with args:`, args);

	if (!WAGTAIL_BASE_URL) {
		context.log.error("WAGTAIL_BASE_URL environment variable is not set.");
		throw new Error("Server configuration error: WAGTAIL_BASE_URL is not set.");
	}
	if (!args.id) {
		 throw new UserError("Missing required parameter: id");
	}


	// Construct API URL
	const baseUrl = WAGTAIL_BASE_URL.replace(/\/$/, "");
	const apiBasePath = WAGTAIL_API_PATH.replace(/^\/|\/$/g, "");
	const apiUrl = `${baseUrl}/${apiBasePath}/documents/${args.id}/`; 

	// Configure Headers
	const headers: Record<string, string> = { "Accept": "application/json" };
	if (WAGTAIL_API_KEY) {
		headers["Authorization"] = `Bearer ${WAGTAIL_API_KEY}`;
	}

	context.log.info(`Calling Wagtail API: ${apiUrl}`);

	// Make API Call
	try {
		const response = await axios.get<DocumentDetailApiResponse>(apiUrl, {
			headers: headers,
		});

		context.log.info(`Received response from Wagtail API`, { status: response.status });

		// Basic validation of response structure
		 if (!response.data || typeof response.data.id !== 'number' || typeof response.data.title !== 'string' || !response.data.meta || typeof response.data.meta.download_url !== 'string') {
			 let responseSample = "[Unable to stringify response]";
			 try { responseSample = JSON.stringify(response.data).substring(0, 200); } catch(e){}
			context.log.error("API response data missing or invalid structure.", { dataSample: responseSample, id: args.id });
			 throw new Error(`API request successful (Status ${response.status}) but response data structure is invalid.`);
		 }

		// Extract Required Fields
		const documentDetails = {
			id: response.data.id,
			title: response.data.title,
			download_url: response.data.meta.download_url
		};

		// Format for MCP: content array with a single text item containing stringified JSON
		let outputJson: string;
		try {
			 outputJson = JSON.stringify(documentDetails, null, 2);
		} catch (stringifyError) {
			 context.log.error("Failed to stringify document details", { error: String(stringifyError), id: args.id });
			 throw new Error("Failed to format results.");
		}

		return {
			content: [{ type: "text", text: outputJson }],
		};

	} catch (error: unknown) {
		// Log serializable details
		let errorDetails: Record<string, any> = { message: String(error), documentId: args.id };
		if (axios.isAxiosError(error)) {
			errorDetails.status = error.response?.status;
			try {
				errorDetails.data = JSON.parse(JSON.stringify(error.response?.data ?? null));
			} catch (parseError) {
				errorDetails.data = "Error serializing response data";
			}
			errorDetails.code = error.code;
			errorDetails.requestUrl = error.config?.url;
		}
		context.log.error(`Error executing ${toolName}`, errorDetails); 

		// Throw appropriate error type
		if (axios.isAxiosError(error)) {
			const status = error.response?.status;
			let message = `Wagtail API request failed`;
			if (status) message += ` with status ${status}`;
			message += `: ${error.message}`;

			if (status === 404) {
				throw new UserError(`Document with ID ${args.id} not found.`, { detail: message, request: errorDetails });
			} else if (status && status >= 400 && status < 500) {
				 throw new UserError(`Client error calling Wagtail Document Detail API (Status: ${status}).`, { detail: message, request: errorDetails });
			} else {
				throw new Error(`Server or network error calling Wagtail Document Detail API: ${message}`);
			}
		} else if (error instanceof UserError) {
			 throw error; 
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
