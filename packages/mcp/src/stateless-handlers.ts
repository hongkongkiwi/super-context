/**
 * Stateless MCP handlers that work purely with parameters
 * No filesystem assumptions, no persistent state, pure MCP design
 */

import { Context } from "@hongkongkiwi/super-context-core";
import { GitHistoryIntegration } from "@hongkongkiwi/super-context-core";
import { SimpleEncryption } from "@hongkongkiwi/super-context-core";
import path from 'path';

export interface FileContent {
    path: string;          // Relative path within project
    content: string;       // File content
    language?: string;     // Language hint for AST parsing
}

export interface ProjectContext {
    name: string;                    // Project identifier
    rootPath?: string;              // Optional absolute path (for git operations)
    files: FileContent[];           // File contents to process
    ignorePatterns?: string[];      // Ignore patterns
    includePatterns?: string[];     // Include patterns  
    metadata?: Record<string, any>; // Project metadata
}

export interface SearchContext {
    projects?: string[];            // Project names to search (if multi-project)
    filters?: Record<string, any>;  // Search filters
    limit?: number;                 // Result limit
}

export interface StatelessMcpConfig {
    embeddingProvider: 'OpenAI' | 'VoyageAI' | 'Gemini' | 'Ollama' | 'HuggingFace' | 'OpenRouter' | 'VertexAI' | 'Bedrock';
    embeddingModel: string;
    vectorDatabase: 'milvus' | 'qdrant' | 'pinecone' | 'weaviate' | 'chroma' | 'semadb';
    // API keys and config passed via environment variables
}

/**
 * Stateless MCP handlers - no persistent state, all data via parameters
 */
export class StatelessToolHandlers {
    private context: Context;
    private indexedProjects = new Map<string, any>(); // In-memory only, session-scoped

    constructor(context: Context) {
        this.context = context;
    }

    /**
     * Index files directly from provided content - no filesystem access
     */
    async handleIndexFiles(args: any) {
        try {
            const { project, splitter = 'ast' }: {
                project: ProjectContext,
                splitter?: 'ast' | 'langchain'
            } = args;

            if (!project?.name) {
                return {
                    content: [{
                        type: "text",
                        text: "Error: project.name is required"
                    }],
                    isError: true
                };
            }

            if (!project.files || project.files.length === 0) {
                return {
                    content: [{
                        type: "text", 
                        text: "Error: project.files array is required and cannot be empty"
                    }],
                    isError: true
                };
            }

            // Validate splitter parameter
            if (splitter !== 'ast' && splitter !== 'langchain') {
                return {
                    content: [{
                        type: "text",
                        text: `Error: Invalid splitter '${splitter}'. Must be 'ast' or 'langchain'`
                    }],
                    isError: true
                };
            }

            console.log(`[STATELESS-INDEX] Starting indexing for project: ${project.name}`);
            console.log(`[STATELESS-INDEX] Processing ${project.files.length} files with ${splitter} splitter`);

            const stats = {
                indexedFiles: 0,
                totalChunks: 0,
                errors: [] as string[]
            };

            // Process each file directly from content
            for (const file of project.files) {
                try {
                    // Skip if content is empty
                    if (!file.content.trim()) {
                        continue;
                    }

                    // Detect language from file extension if not provided
                    const language = file.language || this.detectLanguage(file.path);
                    
                    // Process content for encryption if needed
                    const processedContent = SimpleEncryption.processForStorage(file.content, file.path);
                    
                    // Create temporary file-like object for Context API
                    const fileData = {
                        path: file.path,
                        content: processedContent,
                        language,
                        size: file.content.length
                    };

                    console.log(`[STATELESS-INDEX] Processing ${file.path}: ${SimpleEncryption.safeLog(processedContent, 50)}`);

                    // Index using the core Context API (modified to accept content directly)
                    await this.indexFileContent(project.name, fileData, splitter);
                    
                    stats.indexedFiles++;
                    console.log(`[STATELESS-INDEX] ✅ Indexed: ${file.path} (${file.content.length} chars)`);

                } catch (error: any) {
                    const errorMsg = `Failed to index ${file.path}: ${error.message}`;
                    stats.errors.push(errorMsg);
                    console.error(`[STATELESS-INDEX] ❌ ${errorMsg}`);
                }
            }

            // Store project info in session memory
            this.indexedProjects.set(project.name, {
                ...project,
                indexedAt: new Date(),
                stats
            });

            const successRate = stats.indexedFiles / project.files.length * 100;
            
            let resultText = `✅ **Indexing Complete for "${project.name}"**\\n\\n`;
            resultText += `📊 **Statistics:**\\n`;
            resultText += `- Files processed: ${stats.indexedFiles}/${project.files.length} (${successRate.toFixed(1)}% success)\\n`;
            resultText += `- Total chunks created: ${stats.totalChunks}\\n`;
            resultText += `- Splitter used: ${splitter}\\n`;
            
            if (stats.errors.length > 0) {
                resultText += `\\n⚠️  **Errors (${stats.errors.length}):**\\n`;
                resultText += stats.errors.map(err => `- ${err}`).join('\\n');
            }

            return {
                content: [{
                    type: "text",
                    text: resultText
                }],
                isError: false
            };

        } catch (error: any) {
            console.error('[STATELESS-INDEX] Fatal error:', error);
            return {
                content: [{
                    type: "text",
                    text: `Error during indexing: ${error.message}`
                }],
                isError: true
            };
        }
    }

    /**
     * Search across indexed content - no persistent state needed
     */
    async handleSearchCode(args: any) {
        try {
            const { query, context: searchContext, project }: {
                query: string,
                context?: SearchContext,
                project?: string
            } = args;

            if (!query) {
                return {
                    content: [{
                        type: "text",
                        text: "Error: query parameter is required"
                    }],
                    isError: true
                };
            }

            console.log(`[STATELESS-SEARCH] Searching for: "${query}"`);

            // Determine which projects to search
            let projectsToSearch: string[] = [];
            if (project) {
                projectsToSearch = [project];
            } else if (searchContext?.projects) {
                projectsToSearch = searchContext.projects;
            } else {
                // Search all indexed projects in this session
                projectsToSearch = Array.from(this.indexedProjects.keys());
            }

            if (projectsToSearch.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: "No indexed projects found. Please index files first using index_files."
                    }],
                    isError: true
                };
            }

            console.log(`[STATELESS-SEARCH] Searching in projects: ${projectsToSearch.join(', ')}`);

            // Perform search using Context API
            const searchResults = await this.searchInProjects(query, projectsToSearch, searchContext);

            if (searchResults.length === 0) {
                return {
                    content: [{
                        type: "text", 
                        text: `No results found for query: "${query}"\\n\\nSearched in projects: ${projectsToSearch.join(', ')}`
                    }],
                    isError: false
                };
            }

            // Format results
            let resultText = `🔍 **Search Results for "${query}"**\\n\\n`;
            resultText += `Found ${searchResults.length} results:\\n\\n`;

            searchResults.forEach((result, index) => {
                const similarity = (result.score * 100).toFixed(1);
                resultText += `**${index + 1}. ${result.relativePath}** (${similarity}% match)\\n`;
                resultText += `\`\`\`${result.language || 'text'}\\n`;
                resultText += result.content.substring(0, 300);
                if (result.content.length > 300) {
                    resultText += '...';
                }
                resultText += `\\n\`\`\`\\n`;
                resultText += `Lines: ${result.startLine}-${result.endLine}\\n\\n`;
            });

            return {
                content: [{
                    type: "text",
                    text: resultText
                }],
                isError: false
            };

        } catch (error: any) {
            console.error('[STATELESS-SEARCH] Error:', error);
            return {
                content: [{
                    type: "text",
                    text: `Search error: ${error.message}`
                }],
                isError: true
            };
        }
    }

    /**
     * Get git context for files - requires project.rootPath
     */
    async handleGetGitContext(args: any) {
        try {
            const { filePath, project }: {
                filePath: string,
                project: ProjectContext
            } = args;

            if (!filePath) {
                return {
                    content: [{
                        type: "text",
                        text: "Error: filePath parameter is required"
                    }],
                    isError: true
                };
            }

            if (!project?.rootPath) {
                return {
                    content: [{
                        type: "text",
                        text: "Error: project.rootPath is required for git operations"
                    }],
                    isError: true
                };
            }

            // Validate that rootPath is a git repository
            if (!this.isGitRepository(project.rootPath)) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: ${project.rootPath} is not a git repository`
                    }],
                    isError: true
                };
            }

            console.log(`[STATELESS-GIT] Getting git context for ${filePath} in ${project.rootPath}`);

            const git = new GitHistoryIntegration(project.rootPath);
            const gitContext = await git.getGitContext(filePath);

            let resultText = `📋 **Git Context for ${filePath}**\\n\\n`;
            
            if (gitContext.recentCommits.length > 0) {
                resultText += `**Recent commits (${gitContext.recentCommits.length}):**\\n`;
                gitContext.recentCommits.slice(0, 5).forEach((commit: any) => {
                    resultText += `- ${commit.hash.substring(0, 8)}: ${commit.message} (${commit.author})\\n`;
                });
                if (gitContext.recentCommits.length > 5) {
                    resultText += `... and ${gitContext.recentCommits.length - 5} more commits\\n`;
                }
                resultText += '\\n';
            }

            if (gitContext.hotspots.length > 0) {
                resultText += `**Hotspots (${gitContext.hotspots.length} files):**\\n`;
                gitContext.hotspots.slice(0, 3).forEach((hotspot: any) => {
                    resultText += `- ${hotspot.filePath}: ${hotspot.changeFrequency} changes\\n`;
                });
                if (gitContext.hotspots.length > 3) {
                    resultText += `... and ${gitContext.hotspots.length - 3} more files\\n`;
                }
            }

            return {
                content: [{
                    type: "text",
                    text: resultText
                }],
                isError: false
            };

        } catch (error: any) {
            console.error('[STATELESS-GIT] Error:', error);
            return {
                content: [{
                    type: "text",
                    text: `Git context error: ${error.message}`
                }],
                isError: true
            };
        }
    }

    /**
     * Get status of indexed projects in this session
     */
    async handleGetIndexingStatus(args: any) {
        try {
            const { project }: { project?: string } = args;

            if (project) {
                // Get status for specific project
                const projectData = this.indexedProjects.get(project);
                if (!projectData) {
                    return {
                        content: [{
                            type: "text",
                            text: `Project "${project}" is not indexed in this session.`
                        }],
                        isError: false
                    };
                }

                let resultText = `📊 **Status for "${project}"**\\n\\n`;
                resultText += `- Status: ✅ Indexed\\n`;
                resultText += `- Files: ${projectData.stats.indexedFiles}\\n`;
                resultText += `- Indexed at: ${projectData.indexedAt.toLocaleString()}\\n`;
                
                if (projectData.stats.errors.length > 0) {
                    resultText += `- Errors: ${projectData.stats.errors.length}\\n`;
                }

                return {
                    content: [{
                        type: "text",
                        text: resultText
                    }],
                    isError: false
                };

            } else {
                // Get status for all projects
                const projects = Array.from(this.indexedProjects.entries());
                
                if (projects.length === 0) {
                    return {
                        content: [{
                            type: "text",
                            text: "No projects indexed in this session."
                        }],
                        isError: false
                    };
                }

                let resultText = `📊 **Indexed Projects (${projects.length})**\\n\\n`;
                
                projects.forEach(([name, data]) => {
                    resultText += `**${name}**\\n`;
                    resultText += `- Files: ${data.stats.indexedFiles}\\n`;
                    resultText += `- Indexed: ${data.indexedAt.toLocaleString()}\\n`;
                    if (data.stats.errors.length > 0) {
                        resultText += `- Errors: ${data.stats.errors.length}\\n`;
                    }
                    resultText += '\\n';
                });

                return {
                    content: [{
                        type: "text",
                        text: resultText
                    }],
                    isError: false
                };
            }

        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Status error: ${error.message}`
                }],
                isError: true
            };
        }
    }

    /**
     * Clear indexed data for a project or all projects
     */
    async handleClearIndex(args: any) {
        try {
            const { project }: { project?: string } = args;

            if (project) {
                // Clear specific project
                if (!this.indexedProjects.has(project)) {
                    return {
                        content: [{
                            type: "text",
                            text: `Project "${project}" is not indexed.`
                        }],
                        isError: false
                    };
                }

                // Clear from vector database
                await this.context.clearCollection(`project_${project}`);
                this.indexedProjects.delete(project);

                return {
                    content: [{
                        type: "text",
                        text: `✅ Cleared index for project "${project}".`
                    }],
                    isError: false
                };

            } else {
                // Clear all projects
                const projectNames = Array.from(this.indexedProjects.keys());
                
                for (const projectName of projectNames) {
                    await this.context.clearCollection(`project_${projectName}`);
                    this.indexedProjects.delete(projectName);
                }

                return {
                    content: [{
                        type: "text",
                        text: `✅ Cleared index for ${projectNames.length} projects: ${projectNames.join(', ')}`
                    }],
                    isError: false
                };
            }

        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Clear index error: ${error.message}`
                }],
                isError: true
            };
        }
    }

    // Helper methods
    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const languageMap: Record<string, string> = {
            '.js': 'javascript',
            '.jsx': 'javascript', 
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.py': 'python',
            '.java': 'java',
            '.cpp': 'cpp',
            '.cc': 'cpp',
            '.cxx': 'cpp',
            '.c': 'c',
            '.h': 'c',
            '.hpp': 'cpp',
            '.go': 'go',
            '.rs': 'rust',
            '.cs': 'csharp',
            '.scala': 'scala',
            '.rb': 'ruby',
            '.php': 'php',
            '.swift': 'swift',
            '.kt': 'kotlin',
            '.dart': 'dart',
            '.zig': 'zig',
            '.ex': 'elixir',
            '.exs': 'elixir'
        };
        
        return languageMap[ext] || 'text';
    }

    private async indexFileContent(projectName: string, fileData: any, splitter: string) {
        // Create collection name for this project
        const collectionName = `project_${projectName}`;
        
        // Use Context API to index the file content
        // This would need to be modified in the core Context class to accept content directly
        return await this.context.indexContent({
            content: fileData.content,
            path: fileData.path,
            language: fileData.language,
            collectionName,
            splitter
        });
    }

    private async searchInProjects(query: string, projectNames: string[], searchContext?: SearchContext) {
        // Search across multiple project collections
        const allResults = [];
        
        for (const projectName of projectNames) {
            const collectionName = `project_${projectName}`;
            try {
                const results = await this.context.search({
                    query,
                    collectionName,
                    limit: searchContext?.limit || 10,
                    filter: searchContext?.filters
                });
                allResults.push(...results);
            } catch (error) {
                console.warn(`Failed to search in project ${projectName}:`, error);
            }
        }

        // Sort by relevance score
        return allResults.sort((a, b) => b.score - a.score);
    }

    private isGitRepository(dirPath: string): boolean {
        try {
            const fs = require('fs');
            const gitDir = path.join(dirPath, '.git');
            return fs.existsSync(gitDir);
        } catch {
            return false;
        }
    }
}