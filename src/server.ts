import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'; // Corrected import path
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'; // Corrected import path
import * as dotenv from 'dotenv';
import path from 'path';

// Import the tool definitions
import {
  name as listPagesToolName,
  description as listPagesToolDescription,
  paramsSchema as listPagesToolParamsSchema,
  toolCallback as listPagesToolCallback,
} from './tools/search-pages.tool'; // Updated filename

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
//  console.log('Starting MCP server...');

  // Initialize Configuration (using dotenv loaded values)
  const serviceName = process.env.MCP_SERVICE_NAME || 'Wagtail MCP Server (Default)';
  const serviceVersion = process.env.MCP_SERVICE_VERSION || '0.1.0';
  const enableStdio = process.env.MCP_ENABLE_STDIO?.toLowerCase() === 'true';

//  console.log(`Service Name: ${serviceName}`);
//  console.log(`Service Version: ${serviceVersion}`);
//  console.log(`Stdio Enabled: ${enableStdio}`);

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
//  console.log(`Registering tool: ${listPagesToolName}`);
  server.tool(
    listPagesToolName,
    listPagesToolDescription,
    listPagesToolParamsSchema,
    listPagesToolCallback
  );

  // --- Transport Initialization and Connection ---
  let transportConnected = false;
  if (enableStdio) {
//    console.log('Setting up Stdio transport...');
    // Instantiate stdio transport - defaults to process.stdin/stdout
    const transport = new StdioServerTransport(); 
    try {
      await server.connect(transport);
//      console.log('Stdio transport connected successfully.');
      transportConnected = true;
    } catch (error) {
      console.error('Failed to connect Stdio transport:', error);
    }
  } else {
//      console.log('Stdio transport is disabled via MCP_ENABLE_STDIO.');
  }

  // Add other transport setups here (e.g., HTTP) if needed

  if (!transportConnected) {
    console.error('Server failed to connect to any transport. Please check configuration (e.g., MCP_ENABLE_STDIO). Exiting.');
    process.exit(1);
  }

//  console.log('MCP server running and connected.');

  // --- Graceful Shutdown Handling ---
  const shutdown = async (signal: string) => {
//    console.log(`Received ${signal}, shutting down server...`);
    try {
      await server.close();
//      console.log('Server shut down gracefully.');
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
