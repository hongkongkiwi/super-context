#!/usr/bin/env node

// CRITICAL: Redirect console outputs to stderr IMMEDIATELY to avoid interfering with MCP JSON protocol
// Only MCP protocol messages should go to stdout
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

console.log = (...args: any[]) => {
    process.stderr.write('[LOG] ' + args.join(' ') + '\n');
};

console.warn = (...args: any[]) => {
    process.stderr.write('[WARN] ' + args.join(' ') + '\n');
};

// console.error already goes to stderr by default

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

class ContextMcpServer {
    private server: Server;
    private context: Context;
    private snapshotManager!: SnapshotManager;
    private syncManager!: SyncManager;
    private toolHandlers!: ToolHandlers;
    private statelessHandlers!: StatelessToolHandlers;
    private isStateless: boolean;

    constructor(config: ContextMcpConfig) {
        // Initialize MCP server
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

        // Initialize embedding provider
        console.log(`[EMBEDDING] Initializing embedding provider: ${config.embeddingProvider}`);
        console.log(`[EMBEDDING] Using model: ${config.embeddingModel}`);

        const embedding = createEmbeddingInstance(config);
        logEmbeddingProviderInfo(config, embedding);

        // Initialize vector database
        let vectorDatabase;
        if (config.vectorDatabase === 'qdrant') {
            console.log(`[VECTOR_DB] Initializing Qdrant vector database`);
            vectorDatabase = new QdrantVectorDatabase({
                url: config.qdrantUrl,
                apiKey: config.qdrantApiKey,
                host: config.qdrantHost,
                port: config.qdrantPort,
                https: config.qdrantHttps
            });
        } else {
            console.log(`[VECTOR_DB] Initializing Milvus vector database`);
            vectorDatabase = new MilvusVectorDatabase({
                address: config.milvusAddress,
                ...(config.milvusToken && { token: config.milvusToken })
            });
        }

        // Initialize Super Context
        this.context = new Context({
            embedding,
            vectorDatabase
        });

        // Check if stateless mode is enabled
        this.isStateless = process.env.MCP_STATELESS_MODE === 'true';
        
        if (this.isStateless) {
            console.log('[MCP] Running in STATELESS mode - no filesystem assumptions');
            // Initialize stateless handlers only
            this.statelessHandlers = new StatelessToolHandlers(this.context);
        } else {
            console.log('[MCP] Running in FILESYSTEM mode - with project root access');
            // Initialize filesystem-based managers
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

✨ **Usage Guidance**:
- You provide the file contents and metadata directly in the request
- No filesystem paths are accessed - everything is parameter-based
- Perfect for secure environments where filesystem access is restricted
`;

        const search_description = `
Search indexed content using natural language queries in a specific project.

⚠️ **STATELESS MODE**: Searches within indexed projects by name, not filesystem paths.

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
                    }
                ]
            };
        });

        // Handle stateless tool execution
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

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
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        });
    }

    private setupFilesystemTools() {
        const index_description = `
Index a codebase directory to enable semantic search using a configurable code splitter.

⚠️ **IMPORTANT**:
- You MUST provide an absolute path to the target codebase.

✨ **Usage Guidance**:
- This tool is typically used when search fails due to an unindexed codebase.
- If indexing is attempted on an already indexed path, and a conflict is detected, you MUST prompt the user to confirm whether to proceed with a force index (i.e., re-indexing and overwriting the previous index).
`;

        const search_description = `
Search the indexed codebase using natural language queries within a specified absolute path.

⚠️ **IMPORTANT**:
- You MUST provide an absolute path.

🎯 **When to Use**:
This tool is versatile and can be used before completing various tasks to retrieve relevant context:
- **Code search**: Find specific functions, classes, or implementations
- **Context-aware assistance**: Gather relevant code context before making changes
- **Issue identification**: Locate problematic code sections or bugs
- **Code review**: Understand existing implementations and patterns
- **Refactoring**: Find all related code pieces that need to be updated
- **Feature development**: Understand existing architecture and similar implementations
- **Duplicate detection**: Identify redundant or duplicated code patterns across the codebase

✨ **Usage Guidance**:
- If the codebase is not indexed, this tool will return a clear error message indicating that indexing is required first.
- You can then use the index_codebase tool to index the codebase before searching again.
`;

        // Define available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "index_codebase",
                        description: index_description,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: `ABSOLUTE path to the codebase directory to index.`
                                },
                                force: {
                                    type: "boolean",
                                    description: "Force re-indexing even if already indexed",
                                    default: false
                                },
                                splitter: {
                                    type: "string",
                                    description: "Code splitter to use: 'ast' for syntax-aware splitting with automatic fallback, 'langchain' for character-based splitting",
                                    enum: ["ast", "langchain"],
                                    default: "ast"
                                },
                                customExtensions: {
                                    type: "array",
                                    items: {
                                        type: "string"
                                    },
                                    description: "Optional: Additional file extensions to include beyond defaults (e.g., ['.vue', '.svelte', '.astro']). Extensions should include the dot prefix or will be automatically added",
                                    default: []
                                },
                                ignorePatterns: {
                                    type: "array",
                                    items: {
                                        type: "string"
                                    },
                                    description: "Optional: Additional ignore patterns to exclude specific files/directories beyond defaults. Only include this parameter if the user explicitly requests custom ignore patterns (e.g., ['static/**', '*.tmp', 'private/**'])",
                                    default: []
                                }
                            },
                            required: ["path"]
                        }
                    },
                    {
                        name: "search_code",
                        description: search_description,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: `ABSOLUTE path to the codebase directory to search in.`
                                },
                                query: {
                                    type: "string",
                                    description: "Natural language query to search for in the codebase"
                                },
                                limit: {
                                    type: "number",
                                    description: "Maximum number of results to return",
                                    default: 10,
                                    maximum: 50
                                },
                                extensionFilter: {
                                    type: "array",
                                    items: {
                                        type: "string"
                                    },
                                    description: "Optional: List of file extensions to filter results. (e.g., ['.ts','.py']).",
                                    default: []
                                }
                            },
                            required: ["path", "query"]
                        }
                    },
                    {
                        name: "clear_index",
                        description: `Clear the search index. IMPORTANT: You MUST provide an absolute path.`,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: `ABSOLUTE path to the codebase directory to clear.`
                                }
                            },
                            required: ["path"]
                        }
                    },
                    {
                        name: "get_indexing_status",
                        description: `Get the current indexing status of a codebase. Shows progress percentage for actively indexing codebases and completion status for indexed codebases.`,
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    description: `ABSOLUTE path to the codebase directory to check status for.`
                                }
                            },
                            required: ["path"]
                        }
                    },
                    // Add git tools
                    ...this.toolHandlers.getGitTools()
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
                case "get_git_context":
                    return await this.toolHandlers.handleGetGitContext(args);
                case "get_git_blame":
                    return await this.toolHandlers.handleGetGitBlame(args);
                case "get_git_history":
                    return await this.toolHandlers.handleGetGitHistory(args);
                case "get_git_hotspots":
                    return await this.toolHandlers.handleGetGitHotspots(args);

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        });
    }

    async start() {
        console.log('[SYNC-DEBUG] MCP server start() method called');
        console.log('Starting Context MCP server...');

        const transport = new StdioServerTransport();
        console.log('[SYNC-DEBUG] StdioServerTransport created, attempting server connection...');

        await this.server.connect(transport);
        console.log("MCP server started and listening on stdio.");
        console.log('[SYNC-DEBUG] Server connection established successfully');

        // Start background sync only in filesystem mode
        if (!this.isStateless) {
            console.log('[SYNC-DEBUG] Initializing background sync...');
            this.syncManager.startBackgroundSync();
            console.log('[SYNC-DEBUG] MCP server initialization complete');
        } else {
            console.log('[STATELESS-DEBUG] Stateless mode - no background sync needed');
            console.log('[STATELESS-DEBUG] MCP server initialization complete');
        }
    }
}

// Main execution
async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2);

    // Show help if requested
    if (args.includes('--help') || args.includes('-h')) {
        showHelpMessage();
        process.exit(0);
    }

    // Create configuration
    const config = createMcpConfig();
    logConfigurationSummary(config);

    const server = new ContextMcpServer(config);
    await server.start();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.error("Received SIGINT, shutting down gracefully...");
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.error("Received SIGTERM, shutting down gracefully...");
    process.exit(0);
});

// Always start the server - this is designed to be the main entry point
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});