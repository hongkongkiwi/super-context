#!/usr/bin/env node

/**
 * Multi-Transport MCP Server for Super Context
 * Supports STDIO, HTTP, HTTPS, and SSE transports with integrated security
 */

// CRITICAL: Redirect console outputs to stderr IMMEDIATELY for STDIO transport
// Only MCP protocol messages should go to stdout when using STDIO
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

// console.error already goes to stderr by default

import {
    ListToolsRequestSchema,
    CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { Context } from "@hongkongkiwi/super-context-core";
import { MilvusVectorDatabase, QdrantVectorDatabase } from "@hongkongkiwi/super-context-core";

// Import our modular components
import { createMcpConfig, logConfigurationSummary, showHelpMessage, ContextMcpConfig } from "./config.js";
import { createEmbeddingInstance, logEmbeddingProviderInfo } from "./embedding.js";
import { SnapshotManager } from "./snapshot.js";
import { SyncManager } from "./sync.js";
import { ToolHandlers } from "./handlers.js";
import { StatelessToolHandlers } from "./stateless-handlers.js";
import { MCPServerFactory, MCPServerConfig } from "./server-factory.js";
import { SimpleMCPAuth } from "./simple-auth.js";
import { FeatureManager } from "./feature-manager.js";

class UniversalContextMcpServer {
    private server: any;
    private transport: any;
    private context!: Context;
    private snapshotManager!: SnapshotManager;
    private syncManager!: SyncManager;
    private toolHandlers!: ToolHandlers;
    private statelessHandlers!: StatelessToolHandlers;
    private isStateless: boolean;
    private config: MCPServerConfig;
    private startFn!: () => Promise<void>;
    private stopFn!: () => Promise<void>;

    constructor(config: MCPServerConfig) {
        this.config = config;
        this.isStateless = process.env.MCP_STATELESS_MODE === 'true';
    }

    async initialize() {
        // Initialize optional features first
        FeatureManager.initializeFromEnv();
        
        // Initialize embedding provider
        console.log(`[EMBEDDING] Initializing embedding provider: ${this.config.embeddingProvider}`);
        console.log(`[EMBEDDING] Using model: ${this.config.embeddingModel}`);

        const embedding = createEmbeddingInstance(this.config);
        logEmbeddingProviderInfo(this.config, embedding);

        // Initialize vector database
        let vectorDatabase;
        if (this.config.vectorDatabase === 'qdrant') {
            console.log(`[VECTOR_DB] Initializing Qdrant vector database`);
            vectorDatabase = new QdrantVectorDatabase({
                url: this.config.qdrantUrl,
                apiKey: this.config.qdrantApiKey,
                host: this.config.qdrantHost,
                port: this.config.qdrantPort,
                https: this.config.qdrantHttps
            });
        } else {
            console.log(`[VECTOR_DB] Initializing Milvus vector database`);
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

        // Create server using factory
        const serverResult = await MCPServerFactory.createServer(this.config, this.context);
        this.server = serverResult.server;
        this.transport = serverResult.transport;
        this.startFn = serverResult.start;
        this.stopFn = serverResult.stop;

        // Initialize handlers
        if (this.isStateless) {
            console.log('[MCP] Running in STATELESS mode - no filesystem assumptions');
            this.statelessHandlers = new StatelessToolHandlers(this.context);
        } else {
            console.log('[MCP] Running in FILESYSTEM mode - with project root access');
            this.snapshotManager = new SnapshotManager();
            this.syncManager = new SyncManager(this.context, this.snapshotManager);
            this.toolHandlers = new ToolHandlers(this.context, this.snapshotManager);
            
            // Load existing codebase snapshot on startup
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
        const index_description = `
Index files directly from content provided as parameters - no filesystem access required.

⚠️ **STATELESS MODE**: This tool accepts file contents directly as parameters.

🔐 **Security**: Content is automatically encrypted if ENCRYPTION_KEY environment variable is set.

✨ **Usage Guidance**:
- You provide the file contents and metadata directly in the request
- No filesystem paths are accessed - everything is parameter-based
- Perfect for secure environments where filesystem access is restricted
- Supports authentication via ACCESS_TOKEN environment variable
`;

        const search_description = `
Search indexed content using natural language queries in a specific project.

⚠️ **STATELESS MODE**: Searches within indexed projects by name, not filesystem paths.

🔐 **Security**: Encrypted content is automatically decrypted during search.

🎯 **When to Use**:
- Search within previously indexed projects
- Find specific code patterns or implementations
- Retrieve relevant context for development tasks
`;

        // Define stateless tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "index_files",
                        description: index_description,
                        inputSchema: {
                            type: "object",
                            properties: {
                                project: {
                                    type: "object",
                                    description: "Project context with files to index",
                                    properties: {
                                        name: {
                                            type: "string",
                                            description: "Unique project identifier/name"
                                        },
                                        rootPath: {
                                            type: "string",
                                            description: "Optional: Project root path (for git operations)"
                                        },
                                        files: {
                                            type: "array",
                                            items: {
                                                type: "object",
                                                properties: {
                                                    path: {
                                                        type: "string",
                                                        description: "Relative path within project"
                                                    },
                                                    content: {
                                                        type: "string",
                                                        description: "File content to index"
                                                    },
                                                    language: {
                                                        type: "string",
                                                        description: "Programming language hint"
                                                    }
                                                },
                                                required: ["path", "content"]
                                            },
                                            description: "Array of files with their content to index"
                                        },
                                        ignorePatterns: {
                                            type: "array",
                                            items: { type: "string" },
                                            description: "Optional: Ignore patterns for filtering"
                                        },
                                        includePatterns: {
                                            type: "array",
                                            items: { type: "string" },
                                            description: "Optional: Include patterns for filtering"
                                        },
                                        metadata: {
                                            type: "object",
                                            description: "Optional: Additional project metadata"
                                        }
                                    },
                                    required: ["name", "files"]
                                },
                                splitter: {
                                    type: "string",
                                    enum: ["ast", "langchain"],
                                    default: "ast",
                                    description: "Code splitter to use"
                                }
                            },
                            required: ["project"]
                        }
                    },
                    {
                        name: "search_code",
                        description: search_description,
                        inputSchema: {
                            type: "object",
                            properties: {
                                query: {
                                    type: "string",
                                    description: "Natural language search query"
                                },
                                project: {
                                    type: "string",
                                    description: "Project name to search within (optional, searches all if not specified)"
                                },
                                context: {
                                    type: "object",
                                    description: "Optional search context",
                                    properties: {
                                        projects: {
                                            type: "array",
                                            items: { type: "string" },
                                            description: "Specific projects to search"
                                        },
                                        limit: {
                                            type: "number",
                                            default: 10,
                                            description: "Maximum results to return"
                                        },
                                        filters: {
                                            type: "object",
                                            description: "Additional search filters"
                                        }
                                    }
                                }
                            },
                            required: ["query"]
                        }
                    },
                    {
                        name: "get_git_context",
                        description: "Get git context for a file (requires project rootPath)",
                        inputSchema: {
                            type: "object",
                            properties: {
                                filePath: {
                                    type: "string",
                                    description: "Relative path to file within project"
                                },
                                project: {
                                    type: "object",
                                    description: "Project context with rootPath for git operations",
                                    properties: {
                                        name: { type: "string" },
                                        rootPath: { type: "string", description: "Absolute path to git repository root" }
                                    },
                                    required: ["name", "rootPath"]
                                }
                            },
                            required: ["filePath", "project"]
                        }
                    },
                    {
                        name: "get_indexing_status",
                        description: "Get status of indexed projects in current session",
                        inputSchema: {
                            type: "object",
                            properties: {
                                project: {
                                    type: "string",
                                    description: "Optional: Specific project name to check"
                                }
                            }
                        }
                    },
                    {
                        name: "clear_index",
                        description: "Clear index for a project or all projects",
                        inputSchema: {
                            type: "object",
                            properties: {
                                project: {
                                    type: "string",
                                    description: "Optional: Project name to clear (clears all if not specified)"
                                }
                            }
                        }
                    },
                    {
                        name: "get_security_status",
                        description: "Get current security configuration and status",
                        inputSchema: {
                            type: "object",
                            properties: {}
                        }
                    }
                ]
            };
        });

        // Handle stateless tool execution
        this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
            const { name, arguments: args } = request.params;

            // Authentication check for all requests (only if feature is enabled)
            if (FeatureManager.isFeatureEnabled('authentication')) {
                // For non-HTTP transports, authentication is handled at the transport level
                // HTTP transports handle authentication in the request handler
            }

            switch (name) {
                case "index_files":
                    return await this.statelessHandlers.handleIndexFiles(args);
                case "search_code":
                    return await this.statelessHandlers.handleSearchCode(args);
                case "get_git_context":
                    return await this.statelessHandlers.handleGetGitContext(args);
                case "get_indexing_status":
                    return await this.statelessHandlers.handleGetIndexingStatus(args);
                case "clear_index":
                    return await this.statelessHandlers.handleClearIndex(args);
                case "get_security_status":
                    return this.handleGetSecurityStatus();
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        });
    }

    private setupFilesystemTools() {
        // Similar to stateless but with filesystem-based tools
        // Implementation would mirror the existing filesystem tools with security integration
        console.log('[TODO] Filesystem tools setup with security integration');
    }

    private handleGetSecurityStatus() {
        const featureStatus = FeatureManager.getFeatureStatus();
        const enabledFeatures = FeatureManager.getEnabledFeatures();
        const config = FeatureManager.getConfig();
        
        let statusText = `🔒 **Super Context MCP Server Status**\n\n`;
        
        // Basic configuration
        statusText += `**📡 Transport Configuration:**\n`;
        statusText += `- Protocol: ${this.config.transport.toUpperCase()}\n`;
        statusText += `- Security Level: ${this.config.transport === 'https' ? '🔒 High (HTTPS)' : 
                        this.config.transport === 'stdio' ? '🔒 High (Local)' : '⚠️  Medium (HTTP)'}\n`;
        if (this.config.port) statusText += `- Port: ${this.config.port}\n`;
        if (this.config.host) statusText += `- Host: ${this.config.host}\n`;
        statusText += `- Mode: ${this.isStateless ? 'Stateless' : 'Filesystem'}\n\n`;
        
        // Optional features status
        statusText += `**🛠️ Optional Features:**\n`;
        statusText += `- Content Encryption: ${featureStatus.encryption ? '✅ Enabled' : '❌ Disabled (set ENCRYPTION_KEY to enable)'}\n`;
        statusText += `- Authentication: ${featureStatus.authentication ? '✅ Enabled' : '❌ Disabled (set ACCESS_TOKEN to enable)'}\n`;
        statusText += `- CORS: ${featureStatus.corsEnabled ? '✅ Enabled' : '❌ Disabled (set MCP_CORS=true to enable)'}\n`;
        statusText += `- Rate Limiting: ${featureStatus.rateLimitEnabled ? `✅ Enabled (${config.transport?.rateLimit}/min)` : '❌ Disabled (set MCP_RATE_LIMIT to enable)'}\n`;
        statusText += `- SSL/TLS: ${featureStatus.sslEnabled ? '✅ Enabled' : '❌ Disabled (use HTTPS transport to enable)'}\n\n`;
        
        // Summary
        if (enabledFeatures.length === 0) {
            statusText += `**ℹ️ Running with minimal configuration** - all optional features disabled\n`;
            statusText += `To enable features, set the appropriate environment variables and restart the server.\n\n`;
            statusText += `**🚀 Quick Enable Examples:**\n`;
            statusText += `- \`ENCRYPTION_KEY=your-32-char-key\` - Enable content encryption\n`;
            statusText += `- \`ACCESS_TOKEN=your-16-char-token\` - Enable authentication\n`;
            statusText += `- \`MCP_CORS=true\` - Enable CORS for web clients\n`;
            statusText += `- \`MCP_RATE_LIMIT=100\` - Enable rate limiting\n`;
        } else {
            statusText += `**✨ Active Optional Features:** ${enabledFeatures.join(', ')}\n`;
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
        console.log('[MULTI-TRANSPORT] Universal MCP server start() method called');
        console.log(`Starting Universal Context MCP server with ${this.config.transport.toUpperCase()} transport...`);

        await this.startFn();
        
        // Start background sync only in filesystem mode and STDIO transport
        if (!this.isStateless && this.config.transport === 'stdio') {
            console.log('[SYNC-DEBUG] Initializing background sync...');
            this.syncManager.startBackgroundSync();
            console.log('[SYNC-DEBUG] MCP server initialization complete');
        } else if (this.isStateless) {
            console.log('[STATELESS-DEBUG] Stateless mode - no background sync needed');
            console.log('[STATELESS-DEBUG] MCP server initialization complete');
        }
    }

    async stop() {
        console.log('Stopping Universal Context MCP server...');
        await this.stopFn();
    }
}

// Main execution
async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2);

    // Show help if requested
    if (args.includes('--help') || args.includes('-h')) {
        showHelpMessage();
        console.log(`
🌐 **Transport Options** (via MCP_TRANSPORT env var):
  - stdio: Standard input/output (default) - best for Claude integration
  - http: HTTP REST API - good for web clients
  - https: HTTPS REST API - secure web clients (requires SSL certificates)  
  - sse: Server-Sent Events - real-time web clients

🔐 **Security Options** (via environment variables):
  - ENCRYPTION_KEY: Enable content encryption (32+ chars)
  - ACCESS_TOKEN: Enable authentication (16+ chars)
  - MCP_RATE_LIMIT: Requests per minute limit
  - MCP_CORS: Enable CORS (true/false)
  - MCP_PORT: Server port (default: 3000 for HTTP/HTTPS, 3001 for SSE)

📡 **Examples:**
  - Basic STDIO: npm start
  - HTTP with auth: MCP_TRANSPORT=http ACCESS_TOKEN=mytoken123456 npm start  
  - HTTPS with encryption: MCP_TRANSPORT=https ENCRYPTION_KEY=mysecretkey123456789012345678901234 MCP_SSL_KEY_PATH=./key.pem MCP_SSL_CERT_PATH=./cert.pem npm start
`);
        process.exit(0);
    }

    // Create base configuration
    const baseConfig = createMcpConfig();
    
    // Create multi-transport configuration
    const config = MCPServerFactory.createConfigFromEnv(baseConfig);
    
    // Validate configuration
    const validation = MCPServerFactory.validateConfig(config);
    if (!validation.valid) {
        console.error('❌ Configuration errors:');
        validation.errors.forEach(error => console.error(`   - ${error}`));
        process.exit(1);
    }

    logConfigurationSummary(baseConfig);
    console.log(`🚀 Transport: ${config.transport.toUpperCase()}`);
    if (config.port) console.log(`🌐 Port: ${config.port}`);
    if (config.host) console.log(`🏠 Host: ${config.host}`);

    const server = new UniversalContextMcpServer(config);
    await server.initialize();
    await server.start();
    
    // Graceful shutdown handlers
    const shutdown = async () => {
        console.error("Shutting down gracefully...");
        await server.stop();
        process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

// Always start the server
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});