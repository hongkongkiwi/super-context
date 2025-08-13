#!/usr/bin/env node

/**
 * Minimal Super Context MCP Server
 * Zero optional features enabled by default - maximum compatibility
 * Only core functionality: STDIO transport, basic indexing and search
 */

// CRITICAL: Redirect console outputs to stderr IMMEDIATELY for STDIO transport
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

console.log = (...args: any[]) => {
    process.stderr.write('[LOG] ' + args.join(' ') + '\n');
};

console.warn = (...args: any[]) => {
    process.stderr.write('[WARN] ' + args.join(' ') + '\n');
};

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    ListToolsRequestSchema,
    CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { Context } from "@hongkongkiwi/super-context-core";
import { MilvusVectorDatabase, QdrantVectorDatabase } from "@hongkongkiwi/super-context-core";

// Import core components only
import { createMcpConfig, ContextMcpConfig } from "./config.js";
import { createEmbeddingInstance } from "./embedding.js";
import { SnapshotManager } from "./snapshot.js";
import { SyncManager } from "./sync.js";
import { ToolHandlers } from "./handlers.js";
import { StatelessToolHandlers } from "./stateless-handlers.js";

/**
 * Minimal MCP Server - no optional features, maximum compatibility
 */
class MinimalContextMcpServer {
    private server: Server;
    private context: Context;
    private snapshotManager!: SnapshotManager;
    private syncManager!: SyncManager;
    private toolHandlers!: ToolHandlers;
    private statelessHandlers!: StatelessToolHandlers;
    private isStateless: boolean;

    constructor(config: ContextMcpConfig) {
        // Initialize MCP server with minimal configuration
        this.server = new Server(
            {
                name: config.name,
                version: config.version
            },
            {
                capabilities: {
                    tools: {}
                }
            }
        );

        console.log(`[MINIMAL] Starting minimal MCP server - no optional features enabled`);
        console.log(`[EMBEDDING] Using provider: ${config.embeddingProvider}, model: ${config.embeddingModel}`);

        // Initialize embedding provider (required)
        const embedding = createEmbeddingInstance(config);

        // Initialize vector database (required)
        let vectorDatabase;
        if (config.vectorDatabase === 'qdrant') {
            vectorDatabase = new QdrantVectorDatabase({
                url: config.qdrantUrl,
                apiKey: config.qdrantApiKey,
                host: config.qdrantHost,
                port: config.qdrantPort,
                https: config.qdrantHttps
            });
        } else {
            vectorDatabase = new MilvusVectorDatabase({
                address: config.milvusAddress,
                ...(config.milvusToken && { token: config.milvusToken })
            });
        }

        // Initialize Super Context (required)
        this.context = new Context({
            embedding,
            vectorDatabase
        });

        // Check operating mode
        this.isStateless = process.env.MCP_STATELESS_MODE === 'true';
        
        if (this.isStateless) {
            console.log('[MINIMAL] Running in STATELESS mode');
            this.statelessHandlers = new StatelessToolHandlers(this.context);
        } else {
            console.log('[MINIMAL] Running in FILESYSTEM mode');
            this.snapshotManager = new SnapshotManager();
            this.syncManager = new SyncManager(this.context, this.snapshotManager);
            this.toolHandlers = new ToolHandlers(this.context, this.snapshotManager);
            this.snapshotManager.loadCodebaseSnapshot();
        }

        this.setupTools();
    }

    private setupTools() {
        if (this.isStateless) {
            this.setupStatelessTools();
        } else {
            this.setupFilesystemTools();
        }
    }

    private setupStatelessTools() {
        // Define minimal stateless tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "index_files",
                        description: "Index files directly from content provided as parameters",
                        inputSchema: {
                            type: "object",
                            properties: {
                                project: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string", description: "Project identifier" },
                                        files: {
                                            type: "array",
                                            items: {
                                                type: "object",
                                                properties: {
                                                    path: { type: "string", description: "File path" },
                                                    content: { type: "string", description: "File content" },
                                                    language: { type: "string", description: "Programming language" }
                                                },
                                                required: ["path", "content"]
                                            }
                                        }
                                    },
                                    required: ["name", "files"]
                                },
                                splitter: {
                                    type: "string",
                                    enum: ["ast", "langchain"],
                                    default: "ast"
                                }
                            },
                            required: ["project"]
                        }
                    },
                    {
                        name: "search_code",
                        description: "Search indexed content using natural language queries",
                        inputSchema: {
                            type: "object",
                            properties: {
                                query: { type: "string", description: "Search query" },
                                project: { type: "string", description: "Optional: Project name to search" },
                                context: {
                                    type: "object",
                                    properties: {
                                        limit: { type: "number", default: 10, description: "Max results" }
                                    }
                                }
                            },
                            required: ["query"]
                        }
                    },
                    {
                        name: "get_indexing_status",
                        description: "Get status of indexed projects",
                        inputSchema: {
                            type: "object",
                            properties: {
                                project: { type: "string", description: "Optional: Specific project" }
                            }
                        }
                    },
                    {
                        name: "clear_index",
                        description: "Clear index for projects",
                        inputSchema: {
                            type: "object",
                            properties: {
                                project: { type: "string", description: "Optional: Project to clear" }
                            }
                        }
                    }
                ]
            };
        });

        // Handle tool execution
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            switch (name) {
                case "index_files":
                    return await this.statelessHandlers.handleIndexFiles(args);
                case "search_code":
                    return await this.statelessHandlers.handleSearchCode(args);
                case "get_indexing_status":
                    return await this.statelessHandlers.handleGetIndexingStatus(args);
                case "clear_index":
                    return await this.statelessHandlers.handleClearIndex(args);
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        });
    }

    private setupFilesystemTools() {
        // Define minimal filesystem tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "index_codebase",
                        description: "Index a codebase directory",
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: { type: "string", description: "Absolute path to codebase" },
                                force: { type: "boolean", default: false, description: "Force re-indexing" },
                                splitter: { type: "string", enum: ["ast", "langchain"], default: "ast" }
                            },
                            required: ["path"]
                        }
                    },
                    {
                        name: "search_code",
                        description: "Search indexed codebase",
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: { type: "string", description: "Absolute path to search in" },
                                query: { type: "string", description: "Search query" },
                                limit: { type: "number", default: 10, maximum: 50, description: "Max results" }
                            },
                            required: ["path", "query"]
                        }
                    },
                    {
                        name: "clear_index",
                        description: "Clear search index",
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: { type: "string", description: "Absolute path to clear" }
                            },
                            required: ["path"]
                        }
                    },
                    {
                        name: "get_indexing_status",
                        description: "Get indexing status",
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: { type: "string", description: "Absolute path to check" }
                            },
                            required: ["path"]
                        }
                    }
                ]
            };
        });

        // Handle tool execution
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            switch (name) {
                case "index_codebase":
                    return await this.toolHandlers.handleIndexCodebase(args);
                case "search_code":
                    return await this.toolHandlers.handleSearchCode(args);
                case "clear_index":
                    return await this.toolHandlers.handleClearIndex(args);
                case "get_indexing_status":
                    return await this.toolHandlers.handleGetIndexingStatus(args);
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        });
    }

    async start() {
        console.log('[MINIMAL] Starting minimal MCP server...');
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log("✅ Minimal MCP server started via STDIO");

        // Start background sync only in filesystem mode
        if (!this.isStateless) {
            this.syncManager.startBackgroundSync();
        }

        console.log('[MINIMAL] Server ready - no optional features enabled');
        console.log('[MINIMAL] To enable features, use the multi-transport server instead');
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
🔧 **Minimal Super Context MCP Server**

This is the minimal version with zero optional features enabled:
- ✅ Core indexing and search functionality  
- ✅ STDIO transport only (perfect for Claude Desktop)
- ❌ No encryption, authentication, or other optional features
- ❌ No HTTP/HTTPS transports

**Environment Variables** (required):
- OPENAI_API_KEY: Your OpenAI API key for embeddings
- MILVUS_ADDRESS: Milvus server address (default: localhost:19530)

**Optional Environment Variables**:  
- MCP_STATELESS_MODE=true: Enable stateless mode
- VECTOR_DATABASE=qdrant: Use Qdrant instead of Milvus

**For Additional Features:**
Use 'super-context-mcp-multi' binary instead for:
- HTTP/HTTPS transports
- Authentication and encryption
- CORS and rate limiting
- Advanced security features

**Examples:**
- npm start                    # Basic minimal server
- MCP_STATELESS_MODE=true npm start  # Stateless minimal server
`);
        process.exit(0);
    }

    try {
        const config = createMcpConfig();
        console.log(`[MINIMAL] Configuration loaded - provider: ${config.embeddingProvider}, database: ${config.vectorDatabase}`);
        
        const server = new MinimalContextMcpServer(config);
        await server.start();
    } catch (error) {
        console.error("Fatal error:", error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.error("Received SIGINT, shutting down gracefully...");
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.error("Received SIGTERM, shutting down gracefully...");
    process.exit(0);
});

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});