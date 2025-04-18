import axios, { AxiosError } from 'axios';
import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

// --- Tool Definition ---
export const name = 'search_documents';
export const description = 'Searches for Wagtail documents based on a query string. Allows specifying the search operator (and/or). Returns a list of matching documents with their ID, title, and download URL.';

// --- Input Parameters Schema ---
export const paramsSchema = {
  query: z.string().min(1).describe('The search term to use for finding documents.'),
  search_operator: z.enum(['and', 'or']).optional().default('and').describe(`The logical operator to use if the query contains multiple terms ('and' or 'or'). Defaults to 'and'.`)
};

// Define the actual Zod object from the shape for inference
const ParamsZodObject = z.object(paramsSchema);

// Minimal type for the 'extra' parameter based on SDK expectations
interface RequestHandlerExtra {
  signal?: AbortSignal;
}

// Define the expected return structure for the tool
interface CallToolResult {
  [x: string]: unknown; // Add index signature for compatibility
  content: { type: "text"; text: string; }[];
  _meta?: { [x: string]: unknown; };
  isError?: boolean;
}

// Define the structure of an item in the API response
interface DocumentApiResponseItem {
  id: number;
  meta: {
    type: string;
    detail_url: string;
    download_url: string; // Expecting this
    // Potentially other meta fields exist
  };
  title: string;
  // Potentially other document fields exist
}

// Define the structure of the API response
interface DocumentApiResponse {
  meta: {
    total_count: number;
  };
  items: DocumentApiResponseItem[];
}

// --- Tool Callback Function ---
export const toolCallback = async (
  args: z.infer<typeof ParamsZodObject>,
  extra: RequestHandlerExtra
): Promise<CallToolResult> => {
  // 1. Validate Environment Configuration
  const WAGTAIL_BASE_URL = process.env.WAGTAIL_BASE_URL;
  const WAGTAIL_API_PATH = process.env.WAGTAIL_API_PATH || '/api/v2';
  const WAGTAIL_API_KEY = process.env.WAGTAIL_API_KEY;

  if (!WAGTAIL_BASE_URL) {
    throw new Error('WAGTAIL_BASE_URL environment variable is not set.');
  }

  // 2. Construct API URL and Parameters
  const baseUrl = WAGTAIL_BASE_URL.replace(/\/$/, '');
  const apiPath = WAGTAIL_API_PATH.startsWith('/')
    ? WAGTAIL_API_PATH.replace(/\/$/, '')
    : `/${WAGTAIL_API_PATH.replace(/\/$/, '')}`;
  const apiUrl = `${baseUrl}${apiPath}/documents/`; // Target the documents endpoint

  const queryParams: Record<string, string> = {
    search: args.query,
  };
  if (args.search_operator) {
    queryParams.search_operator = args.search_operator;
  }
  // Specify desired fields directly in the query if the API supports it,
  // otherwise we filter *after* getting the response.
  // Let's filter after for broader compatibility, assuming the API doesn't
  // have a robust 'fields' parameter for list views like the detail view does.
  // queryParams.fields = 'id,title,meta(download_url)'; // Ideal, but might not work


  // 3. Configure Headers
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (WAGTAIL_API_KEY) {
    headers['Authorization'] = `Bearer ${WAGTAIL_API_KEY}`;
  }

  // 4. Make API Call
  try {
    const response = await axios.get<DocumentApiResponse>(apiUrl, {
      headers: headers,
      params: queryParams,
      signal: extra.signal, // Pass along abort signal
    });

    // Basic validation of response
    if (response.status !== 200 || !response.data || !response.data.items) {
       throw new Error(`API request failed with status ${response.status} to ${apiUrl}. Response data missing or invalid.`);
    }

    // 5. Process and Filter Results
    const filteredItems = response.data.items.map(item => ({
      id: item.id,
      title: item.title,
      download_url: item.meta.download_url // Extract the download URL
    }));

    // Format for MCP: content array with a single text item containing stringified JSON
    const outputJson = JSON.stringify({
        count: filteredItems.length, // Add count for clarity
        total_available: response.data.meta.total_count, // From API meta
        items: filteredItems
    }, null, 2);

    const result: CallToolResult = {
      content: [{ type: "text", text: outputJson }],
    };
    return result;

  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorData = error.response?.data;
      const message = (errorData as any)?.message || error.message; // Type assertion needed
      throw new Error(`API request error: ${status} - ${message}. URL: ${apiUrl}, Params: ${JSON.stringify(queryParams)}`);
    } else {
      throw new Error(`An unexpected error occurred: ${error.message}`);
    }
  }
};
