**Project:** Wagtail CMS Read-Only MCP Server (using @modelcontextprotocol/sdk via Stdio)

**Version:** 2.1

**Date:** 2025-04-09

**1. Overview**

This document specifies the requirements for an MCP (Model Context Protocol) server built using the official **`@modelcontextprotocol/sdk`** for TypeScript/JavaScript. The server acts as an intermediary between an LLM agent (or any MCP client) and a Wagtail CMS instance, communicating exclusively via **standard input/output (stdio)**. It leverages the SDK to handle protocol compliance and transport management, while implementing specific read-only actions (querying Pages) against the Wagtail V2 API as MCP **Tools**.

**2. Goals**

*   Implement a functional MCP server compliant with the MCP specification (2024-11-05) by utilizing the `@modelcontextprotocol/sdk`.
*   Provide read-only access to Wagtail CMS content (currently Pages) via its V2 API.
*   Define clear and useful MCP **Tools** for common read operations (listing, fetching details, searching) using the SDK's tool definition mechanisms.
*   Allow configuration of the target Wagtail site URL and optional API key via environment variables.
*   Leverage the SDK for handling MCP request routing over **stdio**, response formatting, and error reporting.
*   Ensure tool execution logic correctly interacts with the Wagtail API.
*   Be runnable as a standard Node.js process communicating via **stdio**.

**3. Non-Goals**

*   Implementing write operations on the Wagtail CMS.
*   Supporting HTTP or other transports (current implementation is stdio only).
*   Implementing the underlying MCP protocol details or transport listeners (this is the SDK's responsibility).
*   Implementing user-specific permissions passthrough.
*   Supporting older versions of the Wagtail API.

**4. Architecture**

1.  **MCP Client (Agent):** Initiates requests via **stdio**.
2.  **Wagtail MCP Server (This project running via SDK):**
    *   Uses `@modelcontextprotocol/sdk` to initialize and run the server.
    *   Registers **Tool** handlers (implemented by you) with the SDK.
    *   The SDK listens for incoming requests on the **stdio** transport.
    *   The SDK parses requests, validates against MCP spec, and routes to the appropriate **Tool** handler.
    *   **Your Tool Handler Logic:**
        *   Receives parsed arguments (matching `paramsSchema`) and an `extra` context object (types inferred).
        *   Performs the necessary logic (reading config, calling Wagtail API, handling auth, parsing/validating response).
        *   **Must return a `Promise` resolving to a `CallToolResult` object.** The structure must be:
            ```typescript
            {
              content: [
                {
                  type: 'text', // Use 'text' for structured data
                  text: JSON.stringify(your_json_payload) // Stringify the JSON payload
                }
              ]
            }
            ```
        *   **Error Handling:** Throw standard `Error` objects for internal or API errors. The SDK catches these and formats the MCP error response. Do not use `SdkError` as it may not be available or correctly typed.
        *   Type inference should be relied upon for the `extra` parameter and the `Promise<CallToolResult>` return type, as explicitly importing `CallToolResult` and `RequestHandlerExtra` can cause type resolution issues with the SDK.

**5. MCP Server Implementation using SDK**

Implementation focuses on configuring the SDK and providing **Tool** handlers.

**5.1. Server Initialization:**

*   Import necessary components using **specific `.js` paths**: `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` and `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`.
*   Instantiate the MCP Server using the `McpServer` class constructor, providing configuration like `name` and `version`:
    ```typescript
    const server = new McpServer({
        name: process.env.MCP_SERVICE_NAME || 'Wagtail MCP Server (Default)',
        version: process.env.MCP_SERVICE_VERSION || '0.1.0'
    });
    ```
*   Instantiate the `StdioServerTransport` **without arguments** (it defaults to `process.stdin/stdout`):
    ```typescript
    const transport = new StdioServerTransport();
    ```
*   Connect the server instance to the transport instance using `server.connect()`:
    ```typescript
    await server.connect(transport);
    ```
*   Register implemented **Tool** Handlers (see 5.2) with the SDK server instance using `server.tool()`:
    ```typescript
    import { name, description, paramsSchema, toolCallback } from './tools/your-tool.tool.js';
    // ...
    server.tool(name, description, paramsSchema, toolCallback);
    ```
*   No server-level authentication is currently implemented.

**5.2. Tool Definition and Implementation:**

*   For each logical operation (e.g., `list_pages`), define a corresponding **Tool** in a separate `.tool.ts` file (e.g., `src/tools/wagtail-list-pages.tool.ts`).
*   Each tool file must export:
    *   `name`: A unique string identifier for the tool (e.g., `'wagtail_list_pages'`).
    *   `description`: A string describing the tool's purpose.
    *   `paramsSchema`: A Zod object schema defining the expected input parameters for the tool.
    *   `toolCallback`: An `async` function matching the `ToolCallback` signature (imported from `@modelcontextprotocol/sdk/server/mcp.js`).
*   The `toolCallback` function:
    *   Receives parsed arguments (matching `paramsSchema`) and an `extra` context object (types inferred).
    *   Performs the necessary logic (reading config, calling Wagtail API, handling auth, parsing/validating response).
    *   **Must return a `Promise` resolving to a `CallToolResult` object.** The structure must be:
        ```typescript
        {
          content: [
            {
              type: 'text', // Use 'text' for structured data
              text: JSON.stringify(your_json_payload) // Stringify the JSON payload
            }
          ]
        }
        ```
    *   **Error Handling:** Throw standard `Error` objects for internal or API errors. The SDK catches these and formats the MCP error response. Do not use `SdkError` as it may not be available or correctly typed.
    *   Type inference should be relied upon for the `extra` parameter and the `Promise<CallToolResult>` return type, as explicitly importing `CallToolResult` and `RequestHandlerExtra` can cause type resolution issues with the SDK.

**6. Wagtail API Interaction**

*(Logic remains the same conceptually, but implemented *inside* the `toolCallback` functions)*

*   **Base URL/Path:** Read from configuration (`WAGTAIL_BASE_URL`, `WAGTAIL_API_PATH`).
*   **Authentication:** Check for `WAGTAIL_API_KEY` config and add `Authorization` header conditionally.
*   **Request Construction/Response Parsing:** Implemented within the `toolCallback` of each tool.

**7. Tool Definitions**

Currently implemented:

*   **`wagtail_list_pages`**: Lists pages from Wagtail API.
    *   `description`: "Lists pages from the Wagtail CMS API."
    *   `paramsSchema`: Zod schema for `limit`, `offset`, `type`, `fields`, `search`.
    *   `toolCallback`: Implemented in `src/tools/wagtail-list-pages.tool.ts`.

Future tools (as per original spec):

*   `get_page_details`
*   `get_page_html`
*   `list_images`
*   `get_image_details`
*   `list_documents`
*   `get_document_details`
*   `search_content`

**8. Configuration**

Environment variables (`.env` file loaded by `dotenv`):

*   **SDK/Server Config:**
    *   `MCP_SERVICE_NAME`: Name for the server (e.g., "Wagtail MCP Server").
    *   `MCP_SERVICE_VERSION`: Version string (e.g., "0.1.0").
    *   `MCP_ENABLE_STDIO`: Must be set to `true` to enable the only supported transport.
*   **Wagtail Config:**
    *   `WAGTAIL_BASE_URL`: Required. Base URL of the Wagtail instance (e.g., `http://localhost:8000`).
    *   `WAGTAIL_API_PATH`: Optional. Path to the API endpoint (defaults to `/api/v2/`).
    *   `WAGTAIL_API_KEY`: Optional. API key for authenticated Wagtail requests.
*   **General:**
    *   `LOG_LEVEL`: Not currently used by the server logic.

**9. Authentication and Authorization**

*   **Client to MCP Server:** No authentication implemented.
*   **MCP Server to Wagtail:** Implemented within `toolCallback` functions by conditionally adding the `Authorization: Bearer ${WAGTAIL_API_KEY}` header based on environment variable presence.

**10. Error Handling**

*   **MCP Request Validation:** Handled *by the SDK* using the Zod `paramsSchema` provided for each tool.
*   **Wagtail API / Internal Errors:** Within `toolCallback` functions:
    *   Catch errors (network, API response issues, validation failures).
    *   **Throw standard `Error` objects**. The SDK catches these and formats the MCP error response.

**11. Deployment Considerations**

*   **Runtime:** Standard Node.js process launched via `npm start` (which executes `node dist/server.js`).
*   **Communication:** Exclusively via **stdio**. The process expects MCP requests on stdin and sends responses to stdout.
*   **Dependencies:** `package.json` includes `@modelcontextprotocol/sdk`, `axios`, `typescript`, `@types/node`, `zod`, `dotenv`.
*   **Build:** Requires `npm run build` to compile TypeScript from `src/` to `dist/`.
*   **Containerization (Optional):** Dockerfile should build code (`npm run build`), install production dependencies (`npm install --omit=dev`), and run the start command (`npm start`). No ports need exposing.

**12. Implementation Notes & Key Learnings**

*   **Transport:** Initial attempts to use HTTP were based on general MCP principles, but the specific environment constraints necessitated using the SDK's **stdio transport**. Configuration (`MCP_ENABLE_STDIO=true`) and instantiation (`new StdioServerTransport()`) were key.
*   **Resources vs. Tools:** The SDK offers different constructs. Initial exploration used Resources, but **Tools** proved more suitable or necessary for the target environment. This involved structuring the implementation around exporting `name`, `description`, `paramsSchema`, and `toolCallback` from `.tool.ts` files and registering them via `server.tool()`.
*   **SDK Imports:** The SDK's module structure required using specific, non-standard import paths including the `.js` extension (e.g., `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';`). Root imports or imports without the extension failed.
*   **SDK Types:** Explicitly importing and using certain types from the SDK (like `CallToolResult`, `RequestHandlerExtra`, `SdkError`) caused TypeScript resolution errors. The solution was to **remove these explicit imports/annotations** and rely on **type inference** derived from the `ToolCallback` type signature.
*   **Tool Result Formatting:** The expected format for returning data from a `toolCallback` required careful adherence to the inferred `CallToolResult` type. For structured data, this meant using `{ content: [{ type: 'text', text: JSON.stringify(...) }] }`.
*   **Error Handling:** The anticipated `SdkError` class was not reliably available or correctly typed. Throwing **standard `Error` objects** proved effective, as the SDK correctly catches and formats them into MCP error responses.

**13. Future Enhancements**

*(Same as previous spec)*
*   More specific Wagtail features (filtering, ordering).
*   Other Wagtail auth methods.
*   Write actions (as Tools).
*   Preview integration.
*   User context passthrough.

**14. Development Milestones (Revised for SDK Tools & Stdio)**

1.  **Milestone 1: Project Setup & Basic SDK Stdio Server**
    *   Initialize Node.js project, Git, TypeScript.
    *   Install dependencies: `@modelcontextprotocol/sdk`, `typescript`, `@types/node`, `axios`, `zod`, `dotenv`.
    *   Create `src/server.ts`.
    *   Instantiate `McpServer` (from `.../mcp.js`) and `StdioServerTransport` (from `.../stdio.js`) correctly.
    *   Load environment variables (`dotenv`).
    *   Connect server to transport (`server.connect(transport)`).
    *   Log successful startup.
    *   Basic run test (`npm start` with `MCP_ENABLE_STDIO=true`).

2.  **Milestone 2: Implement First Tool (`wagtail_list_pages`)**
    *   Create `src/tools/wagtail-list-pages.tool.ts`.
    *   Export `name`, `description`, Zod `paramsSchema`.
    *   Implement the `toolCallback` function: Config reading, Wagtail API call logic (`axios`), conditional auth header, response parsing/validation, correct `CallToolResult` formatting (`type: 'text', text: JSON.stringify(...)`), standard `Error` handling.
    *   Register the tool with the `McpServer` instance in `src/server.ts` using `server.tool()`.
    *   Build (`npm run build`).
    *   Test using a stdio client script sending a valid `callTool` request. Verify success and error cases.

3.  **Milestone 3: Implement Remaining Get/List Tools**
    *   Create tool files (e.g., `src/tools/get-page-details.tool.ts`, etc.) exporting the required constants/functions.
    *   Implement the `toolCallback` for each.
    *   Refactor common logic (e.g., `makeWagtailRequest` helper function).
    *   Register all new tools with the SDK server.
    *   Build and add tests for each tool.

4.  **Milestone 4: Implement Search Tool & Refine Validation/Errors**
    *   Create and implement the `wagtail_search_content` tool handler.
    *   Ensure robust parameter validation using Zod's `parse` within each `toolCallback`.
    *   Refine error handling: Ensure consistent use of standard `Error` for all anticipated Wagtail API errors and internal issues across all tools.
    *   Build and test edge cases for search and error conditions.

5.  **Milestone 5: Final Polish & Documentation**
    *   Review all code for clarity, consistency, and error handling.
    *   Ensure `README.md` is up-to-date with setup, configuration, and execution instructions.
    *   Ensure `.env.example` is accurate.
    *   Final build and test cycle.
