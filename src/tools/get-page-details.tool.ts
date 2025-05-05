import axios from "axios";
import { z } from "zod";
import { zNullToUndefined } from "@/utils/zodNullToUndefined";
import { getWagtailApiUrl, getWagtailApiKey } from "@/utils/config";
import type { FastMCP, Context, ContentResult } from "fastmcp";
import { UserError } from "fastmcp";

type ToolContext = Context<any>;

const name = "get_page_details";
const description = "Retrieves the full details of a specific Wagtail page by its ID, slug, or URL. Requires at least one parameter. Priority: id > slug > url.";
const parameters = z.object({
	id: zNullToUndefined(z.number().int().positive().optional().describe("The unique numeric ID of the page.")),
	slug: zNullToUndefined(z.string().min(1).optional().describe("The slug (URL path part) of the page (e.g., \"about-us/team\").")),
	url: zNullToUndefined(z.string().url().min(1).optional().describe("The full public URL of the page.")),
	fields: zNullToUndefined(z.string().optional().describe("Optional comma-separated list to control returned fields (e.g., \"body,feed_image\", \"*,-title\", \"_,my_field\"). See Wagtail API docs for details.")),
});

type GetPageDetailsArgs = z.infer<typeof parameters>;
type WagtailPageDetailResponse = Record<string, any>;

const execute = async (
	args: GetPageDetailsArgs,
	context: ToolContext
): Promise<ContentResult> => {
	context.log.info(`Executing ${name} tool with args:`, args);

	const { id, slug, url, fields } = args;

	// Validate that at least one identifier is present
	if (!id && !slug && !url) {
		throw new UserError("At least one of 'id', 'slug', or 'url' must be provided.");
	}

	let specificPath = "/pages/";
	const queryParams: Record<string, string | number> = {};

	// Determine API path and query parameters based on provided identifiers (id > slug > url)
	if (id) {
		specificPath += `${id}/`;
		context.log.info(`Looking up page by ID: ${id}`);
	} else if (slug) {
		specificPath += `find/`;
		queryParams.html_path = slug; 
		context.log.info(`Looking up page by slug: ${slug}`);
	} else if (url) {
		specificPath += `find/`;
		try {
			const urlObject = new URL(url);
			queryParams.hostname = urlObject.hostname;
			queryParams.port = urlObject.port || (urlObject.protocol === "https:" ? "443" : "80");
			queryParams.path = urlObject.pathname.substring(1); // Remove leading slash
			context.log.info(`Looking up page by URL path: ${queryParams.path}`);
		} catch (e) {
			context.log.error(`Invalid URL provided: ${url}`, { error: String(e) });
			throw new UserError(`Invalid URL format provided: ${url}`);
		}
	}

	// Add fields parameter if provided
	if (fields) {
		queryParams.fields = fields;
		context.log.info(`Requesting specific fields: ${fields}`);
	} else {
		queryParams.fields = "*"; // Default to all fields if none specified
		context.log.info("Requesting default fields.");
	}

	// Construct the full API URL using the config function
	const apiUrl = getWagtailApiUrl(specificPath, queryParams);

	// Configure Headers
	const headers: Record<string, string> = { "Accept": "application/json" };
	const apiKey = getWagtailApiKey();
	if (apiKey) {
		headers["Authorization"] = `Bearer ${apiKey}`;
	}

	context.log.info(`Calling Wagtail API: ${apiUrl}`); // Log the full URL

	try {
		const response = await axios.get<WagtailPageDetailResponse>(apiUrl, { headers }); // Remove params
		context.log.info(`Received response from Wagtail API`, { status: response.status });

		if (!response.data) {
			context.log.error("Received empty response data from API.");
			throw new Error("API returned empty data.");
		}

		let outputJson: string;
		try {
			outputJson = JSON.stringify(response.data, null, 2);
		} catch (stringifyError) {
			context.log.error("Failed to stringify API response data", { error: String(stringifyError) });
			throw new Error("Failed to format API response.");
		}

		return {
			content: [{ type: "text", text: outputJson }],
		};

	} catch (error: unknown) {
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
		context.log.error(`Error executing ${name}`, errorDetails);

		if (axios.isAxiosError(error)) {
			const status = error.response?.status;
			let message = `Wagtail API request failed`;
			if (status) message += ` with status ${status}`;
			message += `: ${error.message}`;

			if (status === 404) {
				const identifier = id ?? slug ?? url;
				throw new UserError(`Page not found for identifier: ${identifier}`);
			} else if (status && status >= 400 && status < 500) {
				throw new UserError(`Client error calling Wagtail API (Status: ${status}). Check parameters.`, { detail: message, request: errorDetails });
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

export function registerTool(server: FastMCP) {
	server.addTool({
		name,
		description,
		parameters,
		execute,
	});
}
