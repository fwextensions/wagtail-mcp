import axios, { AxiosError } from 'axios';
import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

// --- Tool Definition ---
export const name = 'get_document_details';
export const description = 'Retrieves details (ID, title, download URL) for a specific Wagtail document by its ID.';

// --- Input Parameters Schema ---
export const paramsSchema = {
  id: z.number().int().positive().describe('The unique numeric ID of the document.')
};

// Define the actual Zod object from the shape for inference
const ParamsZodObject = z.object(paramsSchema);

// Minimal type for the 'extra' parameter based on SDK expectations
interface RequestHandlerExtra {
  signal?: AbortSignal;
}

// Define the expected return structure for the tool
// IMPORTANT: Must include index signature for SDK compatibility
interface CallToolResult {
  [x: string]: unknown; // Index signature
  content: { type: "text"; text: string; }[];
  _meta?: { [x: string]: unknown; };
  isError?: boolean;
}

// Define the expected structure of the API response (subset)
interface DocumentDetailApiResponse {
  id: number;
  meta: {
    type: string;
    detail_url: string;
    download_url: string; // The field we need
    // Other meta fields might exist
  };
  title: string;
  // Other document fields might exist
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

  // 2. Construct API URL
  const baseUrl = WAGTAIL_BASE_URL.replace(/\/$/, '');
  const apiPath = WAGTAIL_API_PATH.startsWith('/')
    ? WAGTAIL_API_PATH.replace(/\/$/, '')
    : `/${WAGTAIL_API_PATH.replace(/\/$/, '')}`;
  const apiUrl = `${baseUrl}${apiPath}/documents/${args.id}/`; // Target specific document ID

  // 3. Configure Headers
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (WAGTAIL_API_KEY) {
    headers['Authorization'] = `Bearer ${WAGTAIL_API_KEY}`;
  }

  // 4. Make API Call
  try {
    const response = await axios.get<DocumentDetailApiResponse>(apiUrl, {
      headers: headers,
      signal: extra.signal, // Pass along abort signal
    });

    // Basic validation of response
    if (response.status !== 200 || !response.data) {
       throw new Error(`API request failed with status ${response.status} to ${apiUrl}. Response data missing or invalid.`);
    }

    // 5. Extract Required Fields
    const documentDetails = {
      id: response.data.id,
      title: response.data.title,
      download_url: response.data.meta.download_url
    };

    // Format for MCP: content array with a single text item containing stringified JSON
    const outputJson = JSON.stringify(documentDetails, null, 2);

    const result: CallToolResult = {
      content: [{ type: "text", text: outputJson }],
    };
    return result;

  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorData = error.response?.data;
      const message = (errorData as any)?.message || error.message; // Type assertion needed
      
      if (status === 404) {
          throw new Error(`Document with ID ${args.id} not found at Wagtail API. URL: ${apiUrl}. Error: ${message}`);
       } else {
          throw new Error(`API request error: ${status} - ${message}. URL: ${apiUrl}`);
       }
    } else {
      throw new Error(`An unexpected error occurred: ${error.message}`);
    }
  }
};
