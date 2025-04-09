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
*   Supports HTTP and stdio transports (configurable).
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
    *   `MCP_ENABLE_HTTP=true` or `MCP_ENABLE_STDIO=true`: At least one transport must be enabled.
    *   Configure `MCP_HTTP_PORT` and `MCP_HTTP_HOST` if using the HTTP transport.

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

3.  **Development Mode (using ts-node):**
    To run directly from TypeScript source without building (useful for development):
    ```bash
    npm run dev
    ```

The server will log its status, including which transports are active and the address/port if HTTP is enabled.

## Available Actions (To be implemented in subsequent milestones)

*   `list_pages`
*   `get_page_details`
*   `list_images`
*   `get_image_details`
*   `list_documents`
*   `get_document_details`
*   `search_content`

## Configuration Details

See the `.env.example` file for a full list of environment variables:

*   **SDK Transport:** `MCP_ENABLE_HTTP`, `MCP_HTTP_PORT`, `MCP_HTTP_HOST`, `MCP_ENABLE_STDIO`
*   **Wagtail:** `WAGTAIL_BASE_URL`, `WAGTAIL_API_PATH`, `WAGTAIL_API_KEY`
*   **Server Metadata:** `MCP_SERVICE_NAME`, `MCP_SERVICE_VERSION`, `MCP_SERVICE_DESCRIPTION`
*   **Server Auth:** `MCP_SERVER_API_KEY` (Optional API key for clients connecting *to* this server)
*   **General:** `LOG_LEVEL`

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
