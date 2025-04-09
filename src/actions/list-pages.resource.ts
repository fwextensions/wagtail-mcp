import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import axios from 'axios';

// TODO: Import necessary types from @modelcontextprotocol/sdk/server
// e.g., import { ResourceHandler, ResourceDefinition, ActionParameters, ActionResult, SdkError } from '@modelcontextprotocol/sdk/server';
// --- Using placeholder types until actual SDK types are confirmed ---
type ResourceHandler = any; // Placeholder
type ResourceDefinition = any; // Placeholder
type ActionParameters = Record<string, any>; // Placeholder
type ActionResult = any; // Placeholder
class SdkError extends Error { // Placeholder
    code: string;
    constructor(details: { code: string, message: string }) {
        super(details.message);
        this.code = details.code;
        this.name = 'SdkError';
    }
}
// --- End Placeholder types ---


// Zod schema for parameters based on Wagtail v2 Pages API endpoint
const listPagesParamsSchema = z.object({
    type: z.string().optional().describe("Filter by page content type (e.g., 'myapp.HomePage')"),
    child_of: z.union([z.number(), z.literal('root')]).optional().describe("Filter by parent page ID or 'root'"),
    descendant_of: z.number().optional().describe("Filter by ancestor page ID"),
    fields: z.string().optional().default('*').describe("Fields to include (e.g., 'title,seo_title' or '*' for all default, '_' for none)"),
    limit: z.number().int().positive().max(100).default(20).describe("Maximum number of results"),
    offset: z.number().int().nonnegative().default(0).describe("Offset for pagination"),
    search: z.string().optional().describe("Search query"),
    search_operator: z.enum(['and', 'or']).default('and').describe("Operator for search terms ('and' or 'or')"),
    order: z.string().optional().describe("Field to order by (e.g., 'title', '-title')"),
    // Add other relevant Wagtail parameters as needed
}).describe("Parameters for listing Wagtail pages");

// Zod schema for the expected result structure
const pageItemSchema = z.object({
    id: z.number(),
    meta: z.object({
        type: z.string(),
        detail_url: z.string().url(),
        html_url: z.string().url().nullable(),
        slug: z.string(),
        first_published_at: z.string().datetime().nullable(),
        parent: z.object({
           id: z.number(),
           meta: z.object({
                type: z.string(),
                detail_url: z.string().url(),
                html_url: z.string().url().nullable(),
           }).passthrough(),
        }).nullable(),
    }).passthrough(), // Allow other meta fields
    title: z.string(),
}).passthrough(); // Allow other top-level fields like custom page fields

const listPagesResultSchema = z.object({
    total_count: z.number().int().nonnegative().describe("Total number of pages matching the query"),
    items: z.array(pageItemSchema).describe("The list of page objects"),
}).describe("Result structure for listing Wagtail pages");

// Type definitions for validated parameters and result
type ListPagesParams = z.infer<typeof listPagesParamsSchema>;
type ListPagesResult = z.infer<typeof listPagesResultSchema>;

export class ListPagesResource implements ResourceHandler { // Assuming ResourceHandler interface

    // Provides metadata about the resource/action to the SDK
    get definition(): ResourceDefinition { // Assuming definition getter
        return {
            // Assuming resource_id or similar identifier
            resource_id: 'wagtail_pages', // Or maybe action_id: 'list_pages' - TBD
            description: 'Lists pages from a Wagtail CMS instance based on specified filters.',
            // Provide schemas for parameters and response
            parameters_schema: zodToJsonSchema(listPagesParamsSchema, "listPagesParamsSchema"),
            response_schema: zodToJsonSchema(listPagesResultSchema, "listPagesResultSchema"),
             // Define supported operations if needed by SDK (e.g., 'read', 'list')
            operations: ['list'] // Hypothetical: Defining 'list' operation
        };
    }

    // Handles the actual execution when the 'list' operation is invoked
    // Method name might be 'execute', 'handle', 'list', etc. - Assuming 'list' for now
    async list(params: ActionParameters): Promise<ActionResult> {
//        console.log('Executing list_pages with params:', params);

        // 1. Validate parameters using Zod
        let validatedParams: ListPagesParams;
        try {
            validatedParams = listPagesParamsSchema.parse(params);
//            console.log('Validated params:', validatedParams);
        } catch (error) {
            if (error instanceof z.ZodError) {
                 console.error("Parameter validation failed:", error.errors);
                throw new SdkError({
                    code: 'INVALID_PARAMETERS', // Standard MCP error code
                    message: `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')} (${e.message})`).join(', ')}`
                 });
            }
            throw error; // Re-throw unexpected errors
        }

        // 2. Read Wagtail configuration from environment variables
        const wagtailBaseUrl = process.env.WAGTAIL_BASE_URL;
        const wagtailApiPath = process.env.WAGTAIL_API_PATH || '/api/v2/'; // Default API path
        const wagtailApiKey = process.env.WAGTAIL_API_KEY; // Optional API key

        if (!wagtailBaseUrl) {
             console.error('Configuration error: WAGTAIL_BASE_URL is not set.');
            throw new SdkError({ code: 'CONFIGURATION_ERROR', message: 'WAGTAIL_BASE_URL is not configured.' });
        }

        // 3. Construct Wagtail API URL
        // Ensure paths are joined correctly (avoid double slashes)
        const baseUrl = wagtailBaseUrl.endsWith('/') ? wagtailBaseUrl : wagtailBaseUrl + '/';
        const apiPath = wagtailApiPath.startsWith('/') ? wagtailApiPath.substring(1) : wagtailApiPath;
        const fullApiPath = apiPath.endsWith('/') ? apiPath : apiPath + '/';
        const pagesEndpoint = 'pages/'; // Specific endpoint for pages
        const apiUrl = baseUrl + fullApiPath + pagesEndpoint;
//        console.log(`Target Wagtail API URL: ${apiUrl}`);

        // 4. Prepare Query Parameters and Headers
        const queryParams = new URLSearchParams();
        Object.entries(validatedParams).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                 // Convert boolean/number to string if necessary for URLSearchParams
                 queryParams.append(key, String(value));
            }
        });

        const headers: Record<string, string> = {
            'Accept': 'application/json',
        };
        if (wagtailApiKey) {
            headers['Authorization'] = `Bearer ${wagtailApiKey}`; // Or 'Token' depending on Wagtail auth
//             console.log('Using Authorization header.');
        } else {
//             console.log('No WAGTAIL_API_KEY found, making unauthenticated request.');
        }

        // 5. Make API call using Axios
        try {
//            console.log(`Making GET request to ${apiUrl} with params: ${queryParams.toString()}`);
            const response = await axios.get(apiUrl, {
                params: queryParams,
                headers: headers,
                timeout: 15000, // 15 second timeout
            });

//            console.log(`Wagtail API response status: ${response.status}`);
            // console.log('Wagtail API response data:', response.data); // Careful: can be large

            // 6. Validate Wagtail response structure (optional but recommended)
            // We expect an object like { meta: { total_count: number }, items: array }
            if (!response.data || typeof response.data.meta?.total_count !== 'number' || !Array.isArray(response.data.items)) {
                 console.error('Unexpected Wagtail API response structure:', response.data);
                throw new SdkError({
                    code: 'PROVIDER_ERROR',
                    message: 'Received unexpected data structure from Wagtail API.'
                });
            }

            // 7. Transform and validate the result using Zod schema
            const resultData = listPagesResultSchema.parse({
                total_count: response.data.meta.total_count,
                items: response.data.items, // Pass items directly
            });

//             console.log(`Successfully fetched and parsed ${resultData.items.length} pages.`);
            // 8. Return the validated result (SDK likely wraps this)
            return resultData;

        } catch (error: any) {
             console.error('Error during Wagtail API request or processing:', error);

             if (axios.isAxiosError(error)) {
                const statusCode = error.response?.status;
                const responseData = error.response?.data;
                console.error(`Axios error: Status ${statusCode}`, responseData);

                let mcpErrorCode = 'PROVIDER_UNAVAILABLE'; // Default
                let message = `Failed to communicate with Wagtail API: ${error.message}`;

                 if (statusCode) {
                     message = `Wagtail API error (${statusCode}): ${JSON.stringify(responseData) || error.message}`;
                     if (statusCode === 404) mcpErrorCode = 'RESOURCE_NOT_FOUND'; // Or specific endpoint not found
                     else if (statusCode === 401 || statusCode === 403) mcpErrorCode = 'AUTHENTICATION_ERROR'; // Or PERMISSION_DENIED
                     else if (statusCode >= 400 && statusCode < 500) mcpErrorCode = 'PROVIDER_ERROR'; // Includes bad requests from params
                     else if (statusCode >= 500) mcpErrorCode = 'PROVIDER_UNAVAILABLE';
                 } else if (error.request) {
                     // Request made but no response received (timeout, network error)
                     message = `No response received from Wagtail API: ${error.message}`;
                 }

                throw new SdkError({ code: mcpErrorCode, message });

             } else if (error instanceof z.ZodError) {
                 // Handle validation errors during response parsing
                 console.error("Response validation failed:", error.errors);
                 throw new SdkError({
                    code: 'PROVIDER_ERROR', // Data from provider didn't match expectations
                    message: `Wagtail response validation failed: ${error.errors.map(e => `${e.path.join('.')} (${e.message})`).join(', ')}`
                });
             } else if (error instanceof SdkError) {
                throw error; // Re-throw SDK errors from validation steps
             } else {
                 // Handle other unexpected errors
                 throw new SdkError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: `An unexpected error occurred: ${error.message || String(error)}`
                });
            }
        }
    }

    // Hypothetical: Add other methods for other operations like 'get_details' if needed
    // async get_details(params: ActionParameters): Promise<ActionResult> { ... }
}
