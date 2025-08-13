#!/usr/bin/env node

/**
 * Super Context MCP Server - Standard MCP Configuration
 * Follows standard MCP patterns: environment variable configuration, single binary
 * Designed for use with claude_desktop_config.json
 */

// CRITICAL: Redirect console outputs to stderr for STDIO transport
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

const isStdioTransport = !process.env.MCP_TRANSPORT || process.env.MCP_TRANSPORT.toLowerCase() === 'stdio';

if (isStdioTransport) {
    console.log = (...args: any[]) => {
        process.stderr.write('[LOG] ' + args.join(' ') + '\n');
    };
    
    console.warn = (...args: any[]) => {
        process.stderr.write('[WARN] ' + args.join(' ') + '\n');
    };
}

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    ListToolsRequestSchema,
    CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { Context } from "@hongkongkiwi/super-context-core";
import { MilvusVectorDatabase, QdrantVectorDatabase } from "@hongkongkiwi/super-context-core";

// Import components
import { createMcpConfig, ContextMcpConfig } from "./config.js";
import { createEmbeddingInstance, logEmbeddingProviderInfo } from "./embedding.js";
import { SnapshotManager } from "./snapshot.js";
import { SyncManager } from "./sync.js";
import { ToolHandlers } from "./handlers.js";
import { StatelessToolHandlers } from "./stateless-handlers.js";
import { FeatureManager } from "./feature-manager.js";

/**
 * Standard MCP Server - Environment Variable Driven Configuration
 * Follows MCP best practices for claude_desktop_config.json usage
 */
class StandardMcpServer {
    private server: Server;
    private context!: Context;
    private snapshotManager!: SnapshotManager;
    private syncManager!: SyncManager;
    private toolHandlers!: ToolHandlers;
    private statelessHandlers!: StatelessToolHandlers;
    private isStateless: boolean;
    private config: ContextMcpConfig;

    constructor() {
        // Initialize features from environment (MCP standard)
        FeatureManager.initializeFromEnv();
        
        // Load configuration from environment
        this.config = createMcpConfig();
        this.isStateless = process.env.MCP_STATELESS_MODE === 'true';

        console.log(`[MCP] Super Context server starting...`);
        console.log(`[MCP] Mode: ${this.isStateless ? 'Stateless' : 'Filesystem'}`);
        console.log(`[MCP] Transport: ${process.env.MCP_TRANSPORT || 'STDIO'}`);

        // Log optional features status
        const enabledFeatures = FeatureManager.getEnabledFeatures();
        if (enabledFeatures.length > 0) {
            console.log(`[MCP] Optional features: ${enabledFeatures.join(', ')}`);
        } else {
            console.log(`[MCP] Optional features: none (all disabled)`);
        }

        // Initialize MCP server
        this.server = new Server(
            {
                name: "super-context",
                version: "0.1.1"
            },
            {
                capabilities: {
                    tools: {}
                }
            }
        );

        this.initializeCore();
        this.setupTools();
    }

    private initializeCore() {
        console.log(`[EMBEDDING] Provider: ${this.config.embeddingProvider}, Model: ${this.config.embeddingModel}`);

        // Initialize embedding provider
        const embedding = createEmbeddingInstance(this.config);
        logEmbeddingProviderInfo(this.config, embedding);

        // Initialize vector database
        let vectorDatabase;
        if (this.config.vectorDatabase === 'qdrant') {
            console.log(`[VECTOR_DB] Using Qdrant`);
            vectorDatabase = new QdrantVectorDatabase({
                url: this.config.qdrantUrl,
                apiKey: this.config.qdrantApiKey,
                host: this.config.qdrantHost,
                port: this.config.qdrantPort,
                https: this.config.qdrantHttps
            });
        } else {
            console.log(`[VECTOR_DB] Using Milvus`);
            vectorDatabase = new MilvusVectorDatabase({
                address: this.config.milvusAddress,
                ...(this.config.milvusToken && { token: this.config.milvusToken })
            });
        }

        // Initialize Super Context
        this.context = new Context({
            embedding,
            vectorDatabase
        });

        // Initialize handlers based on mode
        if (this.isStateless) {
            this.statelessHandlers = new StatelessToolHandlers(this.context);
        } else {
            this.snapshotManager = new SnapshotManager();
            this.syncManager = new SyncManager(this.context, this.snapshotManager);
            this.toolHandlers = new ToolHandlers(this.context, this.snapshotManager);
            this.snapshotManager.loadCodebaseSnapshot();
        }
    }

    private setupTools() {
        if (this.isStateless) {
            this.setupStatelessTools();
        } else {
            this.setupFilesystemTools();
        }
    }

    private setupStatelessTools() {
        console.log('[MCP] Setting up stateless tools');
        
        // Define tools following MCP standards
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = [
                {
                    name: "index_files",
                    description: "Index files directly from content - no filesystem access required",
                    inputSchema: {
                        type: "object",
                        properties: {
                            project: {
                                type: "object",
                                description: "Project context with files to index",
                                properties: {
                                    name: { type: "string", description: "Project identifier" },
                                    files: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                path: { type: "string", description: "File path" },
                                                content: { type: "string", description: "File content" },
                                                language: { type: "string", description: "Programming language hint" }
                                            },
                                            required: ["path", "content"]
                                        }
                                    }
                                },
                                required: ["name", "files"]
                            },
                            splitter: { type: "string", enum: ["ast", "langchain"], default: "ast" }
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
                            query: { type: "string", description: "Natural language search query" },
                            project: { type: "string", description: "Optional: Project name to search in" },
                            limit: { type: "number", default: 10, description: "Maximum results to return" }
                        },
                        required: ["query"]
                    }
                },
                {
                    name: "get_status",
                    description: "Get server status and configuration",
                    inputSchema: { type: "object", properties: {} }
                },
                {
                    name: "clear_index",
                    description: "Clear index for a project or all projects",
                    inputSchema: {
                        type: "object",
                        properties: {
                            project: { type: "string", description: "Optional: Project to clear" }
                        }
                    }
                }
            ];

            return { tools };
        });

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case "index_files":
                        return await this.statelessHandlers.handleIndexFiles(args);
                    case "search_code":
                        return await this.statelessHandlers.handleSearchCode(args);
                    case "get_status":
                        return this.handleGetStatus();
                    case "clear_index":
                        return await this.statelessHandlers.handleClearIndex(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error: any) {
                console.error(`[MCP] Tool error for ${name}:`, error.message);
                return {
                    content: [{
                        type: "text",
                        text: `Error executing ${name}: ${error.message}`
                    }],
                    isError: true
                };
            }
        });
    }

    private setupFilesystemTools() {
        console.log('[MCP] Setting up filesystem tools');
        
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = [
                {
                    name: "index_codebase",
                    description: "Index a codebase directory for semantic search",
                    inputSchema: {
                        type: "object",
                        properties: {
                            path: { type: "string", description: "Absolute path to codebase directory" },
                            force: { type: "boolean", default: false, description: "Force re-indexing" },
                            splitter: { type: "string", enum: ["ast", "langchain"], default: "ast" }
                        },
                        required: ["path"]
                    }
                },
                {
                    name: "search_code",
                    description: "Search indexed codebase using natural language queries",
                    inputSchema: {
                        type: "object",
                        properties: {
                            path: { type: "string", description: "Absolute path to search in" },
                            query: { type: "string", description: "Natural language search query" },
                            limit: { type: "number", default: 10, maximum: 50, description: "Maximum results" }
                        },
                        required: ["path", "query"]
                    }
                },
                {
                    name: "get_status",
                    description: "Get server status and indexing information",
                    inputSchema: {
                        type: "object",
                        properties: {
                            path: { type: "string", description: "Optional: Check specific path" }
                        }
                    }
                },
                {
                    name: "clear_index",
                    description: "Clear search index for a codebase",
                    inputSchema: {
                        type: "object",
                        properties: {
                            path: { type: "string", description: "Absolute path to clear" }
                        },
                        required: ["path"]
                    }
                }
            ];

            return { tools };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case "index_codebase":
                        return await this.toolHandlers.handleIndexCodebase(args);
                    case "search_code":
                        return await this.toolHandlers.handleSearchCode(args);
                    case "get_status":
                        return await this.handleGetStatus(args?.path as string);
                    case "clear_index":
                        return await this.toolHandlers.handleClearIndex(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error: any) {
                console.error(`[MCP] Tool error for ${name}:`, error.message);
                return {
                    content: [{
                        type: "text",
                        text: `Error executing ${name}: ${error.message}`
                    }],
                    isError: true
                };
            }
        });
    }

    private handleGetStatus(path?: string) {
        const featureStatus = FeatureManager.getFeatureStatus();
        const enabledFeatures = FeatureManager.getEnabledFeatures();
        const config = FeatureManager.getConfig();

        let statusText = `# Super Context MCP Server Status\n\n`;
        
        statusText += `**Configuration:**\n`;
        statusText += `- Mode: ${this.isStateless ? 'Stateless' : 'Filesystem'}\n`;
        statusText += `- Transport: ${process.env.MCP_TRANSPORT || 'STDIO'}\n`;
        statusText += `- Embedding: ${this.config.embeddingProvider} (${this.config.embeddingModel})\n`;
        statusText += `- Vector DB: ${this.config.vectorDatabase}\n\n`;
        
        statusText += `**Optional Features:**\n`;
        statusText += `- Content Encryption: ${featureStatus.encryption ? '✅ Enabled' : '❌ Disabled'}\n`;
        statusText += `- Authentication: ${featureStatus.authentication ? '✅ Enabled' : '❌ Disabled'}\n`;
        
        if (process.env.MCP_TRANSPORT === 'http' || process.env.MCP_TRANSPORT === 'https') {
            statusText += `- CORS: ${featureStatus.corsEnabled ? '✅ Enabled' : '❌ Disabled'}\n`;
            statusText += `- Rate Limiting: ${featureStatus.rateLimitEnabled ? `✅ ${config.transport?.rateLimit}/min` : '❌ Disabled'}\n`;
        }
        
        if (enabledFeatures.length === 0) {
            statusText += `\n**Running with minimal configuration** - no optional features enabled.\n`;
            statusText += `To enable features, set environment variables in your claude_desktop_config.json:\n`;
            statusText += `- ENCRYPTION_KEY=... - Enable content encryption\n`;
            statusText += `- ACCESS_TOKEN=... - Enable authentication\n`;
        } else {
            statusText += `\n**Active Features:** ${enabledFeatures.join(', ')}\n`;
        }

        return {
            content: [{
                type: "text",
                text: statusText
            }],
            isError: false
        };
    }

    async start() {
        console.log('[MCP] Connecting to transport...');
        
        // For now, only STDIO transport in standard MCP mode
        // Other transports would require different connection patterns
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        
        console.log('[MCP] ✅ Server connected and ready');

        // Start background sync only in filesystem mode
        if (!this.isStateless) {
            this.syncManager.startBackgroundSync();
            console.log('[MCP] Background sync started');
        }
    }
}

// Environment validation
function validateEnvironment() {
    if (!process.env.OPENAI_API_KEY && !process.env.HUGGINGFACE_API_KEY && !process.env.VOYAGE_API_KEY) {
        console.error('[MCP] ERROR: No embedding provider API key found');
        console.error('[MCP] Please set one of: OPENAI_API_KEY, HUGGINGFACE_API_KEY, VOYAGE_API_KEY');
        process.exit(1);
    }
}

// Main execution
async function main() {
    try {
        // Check for help flag
        if (process.argv.includes('--help') || process.argv.includes('-h')) {
            console.log(`
# Super Context MCP Server

Standard MCP server for semantic code indexing and search.
Configured via environment variables in claude_desktop_config.json.

## Required Environment Variables:
- OPENAI_API_KEY: Your OpenAI API key for embeddings

## Optional Environment Variables:
- VECTOR_DATABASE: 'milvus' (default) or 'qdrant'
- MCP_STATELESS_MODE: 'true' for stateless mode
- ENCRYPTION_KEY: Enable content encryption (32+ chars)
- ACCESS_TOKEN: Enable authentication (16+ chars)
- LOG_LEVEL: 'silent', 'error', 'warn', 'info', 'debug'

## Example claude_desktop_config.json:
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["@hongkongkiwi/super-context-mcp"],
      "env": {
        "OPENAI_API_KEY": "your-api-key"
      }
    }
  }
}

For more configuration examples, see the claude-desktop-configs/ directory.
`);
            process.exit(0);
        }

        validateEnvironment();
        
        const server = new StandardMcpServer();
        await server.start();
        
    } catch (error) {
        console.error('[MCP] Fatal error:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.error("[MCP] Received SIGINT, shutting down gracefully...");
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.error("[MCP] Received SIGTERM, shutting down gracefully...");
    process.exit(0);
});

main().catch((error) => {
    console.error("[MCP] Fatal error:", error);
    process.exit(1);
});