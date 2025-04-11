import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'; // Corrected import path
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'; // Corrected import path
import * as dotenv from 'dotenv';
import path from 'path';

// Import the tool definitions
import {
  name as searchPagesToolName,
  description as searchPagesToolDescription,
  paramsSchema as searchPagesToolParamsSchema,
  toolCallback as searchPagesToolCallback,
} from './tools/search-pages.tool';

// Import the new tool definition
import {
  name as getPageDetailsToolName,
  description as getPageDetailsToolDescription,
  paramsSchema as getPageDetailsToolParamsSchema,
  toolCallback as getPageDetailsToolCallback,
} from './tools/get-page-details.tool';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {

  // Initialize Configuration (using dotenv loaded values)
  const serviceName = process.env.MCP_SERVICE_NAME || 'Wagtail MCP Server (Default)';
  const serviceVersion = process.env.MCP_SERVICE_VERSION || '0.1.0';
  // Enable STDIO by default, disable only if explicitly set to 'false'
  const enableStdio = process.env.MCP_ENABLE_STDIO?.toLowerCase() !== 'false';

  if (!serviceName || !serviceVersion) {
    console.error('MCP_SERVICE_NAME and MCP_SERVICE_VERSION must be set in the environment.');
    process.exit(1);
  }

  // --- Server Initialization ---
  const server = new McpServer(
    {
      name: serviceName,
      version: serviceVersion,
      // Define server capabilities (optional)
      // capabilities: { ... }
    },
    {
      // Optional ServerOptions
      // logger: console, // Uncomment for more detailed SDK logging
    }
  );

  // --- Tool Registration ---
  server.tool(
    searchPagesToolName,
    searchPagesToolDescription,
    searchPagesToolParamsSchema,
    searchPagesToolCallback
  );

  // Register the get_page_details tool
  server.tool(
    getPageDetailsToolName,
    getPageDetailsToolDescription,
    getPageDetailsToolParamsSchema,
    getPageDetailsToolCallback
  );

  // --- Transport Initialization and Connection ---
  let transportConnected = false;
  if (enableStdio) {
    // Instantiate stdio transport - defaults to process.stdin/stdout
    const transport = new StdioServerTransport(); 
    try {
      await server.connect(transport);
      transportConnected = true;
    } catch (error) {
      console.error('Failed to connect Stdio transport:', error);
    }
  } else {
  }

  // Add other transport setups here (e.g., HTTP) if needed

  if (!transportConnected) {
    console.error('Server failed to connect to any transport. Please check configuration (e.g., MCP_ENABLE_STDIO). Exiting.');
    process.exit(1);
  }

  // --- Graceful Shutdown Handling ---
  const shutdown = async (signal: string) => {
    try {
      await server.close();
      process.exit(0);
    } catch (error) {
      console.error('Error during server shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

}

main().catch((error) => {
  console.error('Unhandled error during server startup:', error);
  process.exit(1);
});
