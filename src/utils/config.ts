import { URLSearchParams } from "url"; // Import URLSearchParams

/**
 * Reads Wagtail configuration from environment variables and constructs the full API URL.
 * Throws an error if WAGTAIL_BASE_URL is not set.
 * @param specificPath The specific API endpoint path (e.g., "/pages/", "/documents/123/"). Should start with a slash.
 * @param queryParams Optional object containing query parameters.
 * @returns The constructed full API URL including query string (e.g., "https://example.com/api/v2/pages/?limit=10&offset=0").
 */
export function getWagtailApiUrl(specificPath: string, queryParams?: Record<string, string | number>): string {
	const baseUrl = process.env.WAGTAIL_BASE_URL;
	const apiPath = process.env.WAGTAIL_API_PATH || "/api/v2"; // Default API path

	if (!baseUrl) {
		console.error("WAGTAIL_BASE_URL environment variable is not set.");
		throw new Error("Server configuration error: WAGTAIL_BASE_URL is not set.");
	}

	// Normalize slashes for the base URL and the default API path part
	const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
	const normalizedApiPath = `/${apiPath.replace(/^\/|\/$/g, "")}`;

	// Ensure specificPath starts with a slash if it's not empty
	const normalizedSpecificPath = specificPath && !specificPath.startsWith("/")
		? `/${specificPath}`
		: specificPath;

	// Construct the base part of the URL
	let fullUrl = `${normalizedBaseUrl}${normalizedApiPath}${normalizedSpecificPath}`;

	// Add query parameters if provided
	if (queryParams && Object.keys(queryParams).length > 0) {
		// Convert all values to string for URLSearchParams
		const stringParams: Record<string, string> = {};
		for (const key in queryParams) {
			stringParams[key] = String(queryParams[key]);
		}
		const searchParams = new URLSearchParams(stringParams);
		fullUrl += `?${searchParams.toString()}`;
	}

	return fullUrl;
}

/**
 * Gets the Wagtail API Key from the environment.
 * @returns The API key or undefined if not set.
 */
export function getWagtailApiKey(): string | undefined {
    return process.env.WAGTAIL_API_KEY;
}
