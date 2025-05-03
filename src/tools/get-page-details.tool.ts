import axios, { AxiosError } from "axios";
import { z } from "zod";
import { zNullToUndefined } from "./zodNullToUndefined";
import * as dotenv from "dotenv";
import type { FastMCP, Tool, Content, Context, ContentResult } from "fastmcp";
import { UserError } from "fastmcp";

type ToolContext = Context<any>;

dotenv.config();
const WAGTAIL_BASE_URL = process.env.WAGTAIL_BASE_URL;
const WAGTAIL_API_PATH = process.env.WAGTAIL_API_PATH || "/api/v2";
const WAGTAIL_API_KEY = process.env.WAGTAIL_API_KEY;

const name = "get_page_details";
const description = "Retrieves the full details of a specific Wagtail page by its ID, slug, or URL. Requires at least one parameter. Priority: id > slug > url.";
const parameters = z.object({
	id: zNullToUndefined(z.number().int().nonnegative().optional().describe("The unique numeric ID of the page.")),
	slug: zNullToUndefined(z.string().optional().describe("The slug (URL path part) of the page (e.g., \"about-us/team\").")),
	url: zNullToUndefined(z.string().url().optional().describe("The full public URL of the page.")),
	fields: zNullToUndefined(z.string().optional().describe("Optional comma-separated list to control returned fields (e.g., \"body,feed_image\", \"*,-title\", \"_,my_field\"). See Wagtail API docs for details.")),
}).refine(data => data.id !== undefined || data.slug !== undefined || data.url !== undefined, {
	message: "At least one of 'id', 'slug', or 'url' must be provided.",
});

type GetPageDetailsArgs = z.infer<typeof parameters>;
type WagtailPageDetailResponse = Record<string, any>;

const execute = async (
	args: GetPageDetailsArgs,
	context: ToolContext
): Promise<ContentResult> => {
	context.log.info(`Executing ${name} tool with args:`, args);

	let effectiveArgs = { ...args };
	if (effectiveArgs.id === 0) {
		context.log.info("Received id=0, treating as undefined.");
		effectiveArgs.id = undefined;
		if (effectiveArgs.slug === undefined && effectiveArgs.url === undefined) {
			throw new UserError("At least one valid 'id' (non-zero), 'slug', or 'url' must be provided.");
		}
	}
	if (!WAGTAIL_BASE_URL) {
		context.log.error("WAGTAIL_BASE_URL environment variable is not set.");
		throw new Error("Server configuration error: WAGTAIL_BASE_URL is not set.");
	}

	const apiBasePath = WAGTAIL_API_PATH.replace(/^\/|\/$/g, "");
	let apiEndpoint = "";
	const queryParams: Record<string, string | number> = {};

	if (effectiveArgs.id !== undefined) {
		apiEndpoint = `/${apiBasePath}/pages/${effectiveArgs.id}/`;
		context.log.info(`Looking up page by ID: ${effectiveArgs.id}`);
	} else if (effectiveArgs.slug !== undefined) {
		apiEndpoint = `/${apiBasePath}/pages/find/`;
		queryParams.html_path = effectiveArgs.slug;
		context.log.info(`Looking up page by slug: ${effectiveArgs.slug}`);
	} else if (effectiveArgs.url !== undefined) {
		apiEndpoint = `/${apiBasePath}/pages/find/`;
		try {
			const parsedUrl = new URL(effectiveArgs.url);
			queryParams.html_path = parsedUrl.pathname.replace(/^\/|\/$/g, "");
			context.log.info(`Looking up page by URL path: ${queryParams.html_path}`);
		} catch (e) {
			context.log.error(`Invalid URL provided: ${effectiveArgs.url}`, { error: String(e) });
			throw new UserError(`Invalid URL format provided: ${effectiveArgs.url}`);
		}
	} else {
		context.log.error("Internal error: No valid parameter found despite schema validation.");
		throw new Error("Internal error: No valid parameter found.");
	}

	if (effectiveArgs.fields !== undefined) {
		queryParams.fields = effectiveArgs.fields;
		context.log.info(`Requesting specific fields: ${effectiveArgs.fields}`);
	} else {
		context.log.info("Requesting default fields.");
	}

	const baseUrl = WAGTAIL_BASE_URL.replace(/\/$/, "");
	const apiUrl = `${baseUrl}${apiEndpoint}`;
	const headers: Record<string, string> = { "Accept": "application/json" };
	if (WAGTAIL_API_KEY) {
		headers["Authorization"] = `Bearer ${WAGTAIL_API_KEY}`;
	}

	context.log.info(`Calling Wagtail API: ${apiUrl}`, { params: queryParams });

	try {
		const response = await axios.get<WagtailPageDetailResponse>(apiUrl, { params: queryParams, headers });
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
				const identifier = effectiveArgs.id ?? effectiveArgs.slug ?? effectiveArgs.url;
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
