import axios, { AxiosError } from 'axios';
import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

// --- Tool Definition ---
export const name = 'get_page_details';
export const description = 'Retrieves the full details of a specific Wagtail page by its ID, slug, or URL. Requires at least one parameter. Priority: id > slug > url.';

// --- Input Parameters Schema --- 
// Define as a plain object with Zod validators (ZodRawShape)
// This raw shape format is required by McpServer.tool()
export const paramsSchema = {
  id: z.number().int().positive().optional().describe('The unique numeric ID of the page.'),
  slug: z.string().optional().describe('The slug (URL path part) of the page (e.g., "about-us/team").'),
  url: z.string().url().optional().describe('The full public URL of the page.')
};

// Define the actual Zod object from the shape for inference
const ParamsZodObject = z.object(paramsSchema);

// Minimal type for the 'extra' parameter based on SDK expectations
interface RequestHandlerExtra {
  signal?: AbortSignal;
}

// Define the expected return structure
interface CallToolResult {
  [x: string]: unknown; // Index signature
  content: {
    type: "text";
    text: string;
  }[];
  _meta?: { [x: string]: unknown; };
  isError?: boolean;
}

// --- Tool Callback Function ---
// Define the callback signature directly
export const toolCallback = async (
  // Explicitly type args using the Zod object derived from the shape
  args: z.infer<typeof ParamsZodObject>,
  // Use the minimal RequestHandlerExtra type
  extra: RequestHandlerExtra
  // Explicitly type the return Promise
): Promise<CallToolResult> => {
  // Validate that at least one parameter is provided
  if (args.id === undefined && args.slug === undefined && args.url === undefined) {
    throw new Error('At least one of "id", "slug", or "url" must be provided.');
  }

  // 1. Validate Environment Configuration
  const WAGTAIL_BASE_URL = process.env.WAGTAIL_BASE_URL;
  const WAGTAIL_API_PATH = process.env.WAGTAIL_API_PATH || '/api/v2'; // Default API path
  const WAGTAIL_API_KEY = process.env.WAGTAIL_API_KEY;

  if (!WAGTAIL_BASE_URL) {
    throw new Error('WAGTAIL_BASE_URL environment variable is not set.');
  }

  // 2. Determine API Endpoint and Parameters based on input priority (id > slug > url)
  let apiEndpoint = '';
  let queryParams: Record<string, any> = {}; // Initialize empty query params

  if (args.id !== undefined) {
    // Construct the endpoint specific to ID lookup
    apiEndpoint = `/pages/${args.id}/`; 
    // No queryParams needed for ID lookup
  } else if (args.slug !== undefined) {
    // Construct the endpoint specific to find lookup
    apiEndpoint = `/pages/find/`; 
    queryParams.html_path = args.slug;
  } else if (args.url !== undefined) {
    // Construct the endpoint specific to find lookup
    apiEndpoint = `/pages/find/`; 
    try {
      const parsedUrl = new URL(args.url);
      // Remove leading/trailing slashes from pathname for consistency
      queryParams.html_path = parsedUrl.pathname.replace(/^\/|\/$/g, '');
    } catch (e) {
      throw new Error(`Invalid URL provided: ${args.url}`);
    }
  } else {
      // This case should theoretically be caught by the Zod refinement,
      // but it's good practice to handle it defensively.
      throw new Error('Internal error: No valid parameter found despite schema validation.');
  }

  // Construct the final API URL robustly handling slashes
  const baseUrl = WAGTAIL_BASE_URL.replace(/\/$/, ''); // Remove trailing slash from base URL
  const apiPath = WAGTAIL_API_PATH.startsWith('/') // Ensure API path starts with a slash
    ? WAGTAIL_API_PATH.replace(/\/$/, '') // Remove trailing slash from API path
    : `/${WAGTAIL_API_PATH.replace(/\/$/, '')}`;

  // Ensure the specific endpoint starts with a slash (it should from the logic above)
  const fullApiPath = apiEndpoint.startsWith('/') ? apiEndpoint : `/${apiEndpoint}`;

  const apiUrl = `${baseUrl}${apiPath}${fullApiPath}`;

  // 3. Configure Headers
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (WAGTAIL_API_KEY) {
    headers['Authorization'] = `Bearer ${WAGTAIL_API_KEY}`;
  }

  // 4. Make API Call
  try {
    const response = await axios.get(apiUrl, {
      headers: headers,
      params: queryParams,
    });

    // Basic validation of response
    if (response.status !== 200 || !response.data) {
       throw new Error(`API request failed with status ${response.status} to ${apiUrl}`);
    }

    // 5. Return Full JSON Response (as requested for now)
    // Format for MCP: content array with a single text item containing stringified JSON
    const outputJson = JSON.stringify(response.data, null, 2);

    // Map to CallToolResult format
    const result: CallToolResult = {
      content: [{ type: "text", text: outputJson }],
    };
    return result;

  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      // Handle Axios-specific errors (e.g., network error, 404 Not Found)
      const status = error.response?.status;
      const errorData = error.response?.data;
      const message = errorData?.message || error.message; // Use API message if available
      
      // Provide more specific error messages
      if (status === 404) {
         throw new Error(`Page not found at Wagtail API. URL: ${apiUrl}, Params: ${JSON.stringify(queryParams)}. Error: ${message}`);
      } else {
         throw new Error(`API request error: ${status} - ${message}. URL: ${apiUrl}, Params: ${JSON.stringify(queryParams)}`);
      }
    } else {
      // Handle other errors (e.g., URL parsing, validation)
      throw new Error(`An unexpected error occurred: ${error.message}`);
    }
  }
};
