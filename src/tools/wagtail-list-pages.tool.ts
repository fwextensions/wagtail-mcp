import { z } from 'zod';
import axios, { AxiosError } from 'axios';
import * as dotenv from 'dotenv';
import { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';

dotenv.config();

// --- Configuration ---
const WAGTAIL_BASE_URL = process.env.WAGTAIL_BASE_URL;
const WAGTAIL_API_PATH = process.env.WAGTAIL_API_PATH || '/api/v2/';
const WAGTAIL_API_KEY = process.env.WAGTAIL_API_KEY;

// --- Tool Definition ---

export const name = 'wagtail_list_pages'; 
export const description = 'Lists pages from the Wagtail CMS API.';

// Define parameters the tool accepts
export const paramsSchema = {
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .default(50)
    .describe('Maximum number of pages to return.'),
  offset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Offset for pagination.'),
  type: z
    .string()
    .optional()
    .describe('Filter by page type (e.g., blog.BlogPage).'),
  fields: z
    .string()
    .optional()
    .default('*')
    .describe('Comma-separated list of fields to include (e.g., id,title,slug). Use * for all.'),
  search: z
    .string()
    .optional()
    .describe('Search term to filter pages.'),
  // Add other relevant Wagtail API parameters as needed (e.g., child_of, descendant_of)
};

// Define the expected structure of a single page item from the Wagtail API
// (Adjust based on your actual Wagtail Page model and API fields)
const WagtailPageSchema = z.object({
  id: z.number(),
  meta: z.object({
    type: z.string(),
    detail_url: z.string(),
    html_url: z.string().nullable(),
    slug: z.string(),
    first_published_at: z.string().nullable(),
//    first_published_at: z.string().datetime().nullable(),
    // Potentially add search score if search is used
    search_score: z.number().optional(),
  }),
  title: z.string(),
  // Allow other fields as they depend on the requested 'fields' param
}).passthrough(); 

// Define the expected structure of the Wagtail API response for listing pages
const WagtailApiResponseSchema = z.object({
  meta: z.object({
    total_count: z.number(),
  }),
  items: z.array(WagtailPageSchema),
});

// --- Tool Handler ---

export const toolCallback: ToolCallback<typeof paramsSchema> = async (
  args,
  extra
) => {
//  console.log(`Handling tool call: ${name} with args:`, args);

  // 1. Validate Environment Configuration
  if (!WAGTAIL_BASE_URL) {
    throw new Error('WAGTAIL_BASE_URL environment variable is not set.');
  }

  // 2. Construct API URL
  const baseUrl = WAGTAIL_BASE_URL.replace(/\/$/, ''); 
  const apiPath = WAGTAIL_API_PATH.startsWith('/')
    ? WAGTAIL_API_PATH
    : `/${WAGTAIL_API_PATH}`;
  const pagesEndpoint = apiPath.endsWith('/') ? 'pages/' : '/pages/';
  const apiUrl = `${baseUrl}${apiPath}${pagesEndpoint}`;

  // 3. Prepare Headers
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (WAGTAIL_API_KEY) {
    headers['Authorization'] = `Bearer ${WAGTAIL_API_KEY}`; 
  }

  // 4. Prepare Query Params from Tool Args
  const queryParams: Record<string, any> = {};
  if (args.limit !== undefined) queryParams.limit = args.limit;
  if (args.offset !== undefined) queryParams.offset = args.offset;
  if (args.type !== undefined) queryParams.type = args.type;
  if (args.fields !== undefined) queryParams.fields = args.fields;
  if (args.search !== undefined) queryParams.search = args.search;
  // Map other args to query params here

  // 5. Make API Call
  try {
//    console.log(`Fetching pages from: ${apiUrl} with params:`, queryParams);
    const response = await axios.get(apiUrl, {
      headers: headers,
      params: queryParams,
    });

    // 6. Validate API Response
    const validationResult = WagtailApiResponseSchema.safeParse(response.data);
    if (!validationResult.success) {
      console.error('Wagtail API response validation failed:', validationResult.error);
      throw new Error(
        `Received invalid data structure from Wagtail API: ${validationResult.error.message}`
      );
    }

    const pages = validationResult.data.items;
    const totalCount = validationResult.data.meta.total_count;
//    console.log(`Successfully fetched ${pages.length} of ${totalCount} pages.`);

    // 7. Map to CallToolResult format
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ 
            count: pages.length, 
            total_count: totalCount, 
            items: pages 
          }),
        },
      ],
    };
  } catch (error) {
    console.error(`Error in ${name} tool:`, error);

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const errorData = axiosError.response?.data;
      throw new Error(
        `Wagtail API request failed with status ${status}: ${JSON.stringify(errorData)}`
      );
    }

    throw new Error(`An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`);
  }
};
