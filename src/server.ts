#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"; // Corrected import path
import {
	StdioServerTransport
} from "@modelcontextprotocol/sdk/server/stdio.js"; // Corrected import path
import * as dotenv from "dotenv";
import path from "path";

// Import the tool definitions
import {
	name as searchPagesToolName,
	description as searchPagesToolDescription,
	paramsSchema as searchPagesToolParamsSchema,
	toolCallback as searchPagesToolCallback,
} from "./tools/search-pages.tool";

// Import the new tool definition
import {
	name as getPageDetailsToolName,
	description as getPageDetailsToolDescription,
	paramsSchema as getPageDetailsToolParamsSchema,
	toolCallback as getPageDetailsToolCallback,
} from "./tools/get-page-details.tool";

// Import the search documents tool definition
import {
	name as searchDocumentsToolName,
	description as searchDocumentsToolDescription,
	paramsSchema as searchDocumentsToolParamsSchema,
	toolCallback as searchDocumentsToolCallback,
} from "./tools/search-documents.tool"; // Adjusted import path

// Import the get document details tool definition
import {
	name as getDocumentDetailsToolName,
	description as getDocumentDetailsToolDescription,
	paramsSchema as getDocumentDetailsToolParamsSchema,
	toolCallback as getDocumentDetailsToolCallback,
} from "./tools/get-document-details.tool";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main()
{

	// Initialize Configuration (using dotenv loaded values)
	const serviceName = process.env.MCP_SERVICE_NAME ||
		"Wagtail MCP Server (Default)";
	const serviceVersion = process.env.MCP_SERVICE_VERSION || "0.1.0";
	// Read the transport type, default to STDIO
	const transportType = (process.env.MCP_TRANSPORT || "STDIO").toUpperCase();

	if (!serviceName || !serviceVersion) {
		console.error(
			"MCP_SERVICE_NAME and MCP_SERVICE_VERSION must be set in the environment.");
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

	// Register the search_documents tool
	server.tool(
		searchDocumentsToolName,
		searchDocumentsToolDescription,
		searchDocumentsToolParamsSchema,
		searchDocumentsToolCallback
	);

	// Register the get_document_details tool
	server.tool(
		getDocumentDetailsToolName,
		getDocumentDetailsToolDescription,
		getDocumentDetailsToolParamsSchema,
		getDocumentDetailsToolCallback
	);

	// --- Transport Initialization and Connection ---
	let transportConnected = false;
	try {
		if (transportType === "STDIO") {
//      console.log('Connecting using STDIO transport...');
			// Instantiate stdio transport - defaults to process.stdin/stdout
			const transport = new StdioServerTransport();
			await server.connect(transport);
			transportConnected = true;
//      console.log('STDIO transport connected.');
		} else {
			console.error(
				`Invalid MCP_TRANSPORT value: "${transportType}". Currently, only "STDIO" is supported in this server configuration.`);
		}
	} catch (error) {
		console.error(`Failed to connect ${transportType} transport:`, error);
	}

	if (!transportConnected) {
		console.error(
			`Server failed to connect using the configured transport (${transportType}). Check configuration (only STDIO supported) and logs. Exiting.`);
		process.exit(1);
	}

	// --- Graceful Shutdown Handling ---
	const shutdown = async (signal: string) => {
		try {
			await server.close();
			process.exit(0);
		} catch (error) {
			console.error("Error during server shutdown:", error);
			process.exit(1);
		}
	};

	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));

}

main().catch((error) => {
	console.error("Unhandled error during server startup:", error);
	process.exit(1);
});
