

## Prerequisites

*   Node.js (v21.7.0 or later required)
*   npm
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
