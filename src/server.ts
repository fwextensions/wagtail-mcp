#!/usr/bin/env node

import fs from "fs";
import path from "path";

// Conditionally load .env file if it exists in the project root
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
	try {
		process.loadEnvFile(envPath);
		console.log("Loaded environment variables from .env file.");
	} catch (err) {
		console.error("Error loading .env file:", err);
	}
}

// Use FastMCP
import { FastMCP } from "fastmcp";

// Import the registration functions from each tool module
import { registerTool as registerGetPageDetails } from "./tools/get-page-details.tool";
import { registerTool as registerSearchPages } from "./tools/search-pages.tool";
import { registerTool as registerGetDocumentDetails } from "./tools/get-document-details.tool";
import { registerTool as registerSearchDocuments } from "./tools/search-documents.tool";

async function main() {
	// Initialize Configuration
	const serviceName = "Wagtail MCP Server";
	const serviceVersion = "0.0.1";
	const transportType = (process.env.MCP_TRANSPORT || "STDIO").toUpperCase();

	console.error(`Starting ${serviceName} v${serviceVersion}...`);

	// --- Server Initialization using FastMCP ---
	const server = new FastMCP({
		name: serviceName,
		version: serviceVersion,
		// Optional: Add server-level capabilities if needed
		// capabilities: { ... }
	});

	// --- Tool Registration using imported functions ---
	console.error("Registering Wagtail tools...");
	registerGetPageDetails(server);
	registerSearchPages(server);
	registerGetDocumentDetails(server);
	registerSearchDocuments(server);
	console.error("Tools registered successfully.");

	// --- Transport Initialization and Connection ---
	try {
		if (transportType === "STDIO") {
			console.error("Connecting using STDIO transport...");
			// Use the start method with options object
			await server.start({
				transportType: "stdio",
			});
			console.error("STDIO transport connected and server started.");
		} else {
			console.error(`Unsupported transport type: ${transportType}`);
			process.exit(1);
		}
	} catch (error) {
		console.error("Failed to start server:", error);
		process.exit(1);
	}

	// --- Graceful Shutdown Handling (FastMCP might handle some signals) ---
	const shutdown = async (signal: string) => {
		console.error(`Received ${signal}. Shutting down server...`);
		try {
			// Removed server.close() as it doesn't exist
			console.error("Server closed gracefully.");
			process.exit(0);
		} catch (error) {
			console.error("Error during server shutdown:", error);
			process.exit(1);
		}
	};

	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));

	console.error(`${serviceName} is running.`);
}

main().catch((error) => {
	console.error("Unhandled error during server execution:", error);
	process.exit(1);
});
