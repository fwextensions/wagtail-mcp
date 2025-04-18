# Wagtail CMS Read-Only MCP Server (v2 - SDK)

This project implements a Model Context Protocol (MCP) server that provides read-only access to a Wagtail CMS instance using its V2 API.
It is built using the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/sdk) for TypeScript/JavaScript.

**Version:** 2.0.0

## Features

*   Compliant with the MCP specification (2024-11-05).
*   Leverages `@modelcontextprotocol/sdk` for protocol handling, routing, and transport management.
*   Provides read-only access to Wagtail Pages, Images, and Documents.
*   Defines standard MCP actions for listing, fetching details, and searching.
*   Configurable via environment variables (Wagtail URL, API key, transport settings).
*   Supports stdio transport.
*   Uses TypeScript for enhanced type safety and development experience.
*   Uses Zod for schema definition and validation.

## Prerequisites

*   Node.js (v18 or later recommended)
*   npm or yarn
*   Access to a running Wagtail CMS instance with the V2 API enabled.

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd wagtail-mcp
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure environment variables:**
    Copy the example environment file:
    ```bash
    cp .env.example .env
    ```
    Edit the `.env` file and set the required variables, especially:
    *   `WAGTAIL_BASE_URL`: The base URL of your Wagtail instance (e.g., `http://localhost:8000`).
    *   `WAGTAIL_API_KEY`: (Optional) An API key if your Wagtail API requires authentication.
    *   `MCP_TRANSPORT`: (Optional) Specifies the transport mechanism. Currently, only `STDIO` is supported and used by default.

## Running the Server

1.  **Build the TypeScript code:**
    ```bash
    npm run build
    ```

2.  **Start the server:**
    ```bash
    npm start
    ```
    This will run the compiled JavaScript code from the `dist` directory.

3.  **Development Mode (using `ts-node`):**
    To run directly from TypeScript source without building (useful for development):
    ```bash
    npm run dev
    ```

The server will log its status. Since it now uses the stdio transport exclusively, it waits for MCP requests on standard input and sends responses to standard output.

## Implemented Tools

*   **`search_pages`**: Searches pages based on a query string and other filters.
*   **`get_page_details`**: Retrieves detailed information for a specific page by ID, slug, or URL. Supports customizing returned fields.
*   **`search_documents`**: Searches documents based on a query string.
*   **`get_document_details`**: Retrieves detailed information (ID, title, download URL) for a specific document by ID.

## Configuration Details

Environment variables are loaded from a `.env` file in the project root (create one from `.env.example`).

*   **Server Configuration:**
    *   `MCP_SERVICE_NAME`: (Optional) Name for the server reported via MCP. Defaults to 'Wagtail MCP Server (Default)'.
    *   `MCP_SERVICE_VERSION`: (Optional) Version string for the server reported via MCP. Defaults to '0.1.0'.
    *   `MCP_TRANSPORT`: (Optional) Specifies the transport mechanism. Currently, only `STDIO` is supported and used by default.
*   **Wagtail API Configuration:**
    *   `WAGTAIL_BASE_URL`: **Required**. The base URL of your Wagtail instance (e.g., `http://localhost:8000`).
    *   `WAGTAIL_API_PATH`: (Optional) Path to the API endpoint. Defaults to `/api/v2`.
    *   `WAGTAIL_API_KEY`: (Optional) An API key if your Wagtail API requires bearer token authentication.

## Project Structure

```
.
├── dist/                 # Compiled JavaScript output
├── node_modules/
├── src/
│   ├── actions/          # Action handler implementations (Milestone 2+)
│   └── server.ts         # Main server entry point
├── .env                  # Local environment variables (ignored by Git)
├── .env.example          # Example environment variables
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── tsconfig.json
```
