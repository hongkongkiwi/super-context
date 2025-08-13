import fs from 'fs';
import path from 'path';
import { GitHistoryIntegration } from '@hongkongkiwi/super-context-core';

/**
 * Git context handlers for MCP server
 * Supports multiple access patterns for maximum flexibility
 */
export class GitHandlers {
    private gitIntegrations = new Map<string, GitHistoryIntegration>();

    /**
     * Get or create git integration for a repository
     */
    private getGitIntegration(repoPath: string): GitHistoryIntegration {
        const absolutePath = path.resolve(repoPath);
        
        if (!this.gitIntegrations.has(absolutePath)) {
            this.gitIntegrations.set(absolutePath, new GitHistoryIntegration(absolutePath));
        }
        
        return this.gitIntegrations.get(absolutePath)!;
    }

    /**
     * Resolve git repository path using multiple strategies
     */
    private resolveGitRepository(providedPath?: string): string {
        // Strategy 1: Use provided path if given
        if (providedPath) {
            const absolutePath = path.resolve(providedPath);
            if (this.isGitRepository(absolutePath)) {
                return absolutePath;
            }
            throw new Error(`Provided path '${providedPath}' is not a git repository`);
        }

        // Strategy 2: Check PROJECT_ROOT environment variable
        const projectRoot = process.env.PROJECT_ROOT;
        if (projectRoot) {
            const absolutePath = path.resolve(projectRoot);
            if (this.isGitRepository(absolutePath)) {
                return absolutePath;
            }
            console.warn(`PROJECT_ROOT '${projectRoot}' is not a git repository, trying current directory`);
        }

        // Strategy 3: Try current working directory
        const cwd = process.cwd();
        const gitRepo = this.findGitRepository(cwd);
        if (gitRepo) {
            return gitRepo;
        }

        throw new Error(
            'No git repository found. Please either:\\n' +
            '1. Pass repository path as parameter: { "repoPath": "/path/to/repo" }\\n' +
            '2. Set PROJECT_ROOT environment variable\\n' +
            '3. Run MCP server from within a git repository'
        );
    }

    /**
     * Check if a directory is a git repository
     */
    private isGitRepository(dirPath: string): boolean {
        try {
            const gitDir = path.join(dirPath, '.git');
            return fs.existsSync(gitDir);
        } catch {
            return false;
        }
    }

    /**
     * Find git repository by walking up directory tree
     */
    private findGitRepository(startPath: string): string | null {
        let currentPath = path.resolve(startPath);
        const root = path.parse(currentPath).root;

        while (currentPath !== root) {
            if (this.isGitRepository(currentPath)) {
                return currentPath;
            }
            currentPath = path.dirname(currentPath);
        }

        return null;
    }

    /**
     * Get git context for a file
     */
    async handleGetGitContext(args: any) {
        try {
            const { filePath, repoPath } = args;
            
            if (!filePath) {
                return {
                    content: [{
                        type: "text",
                        text: "Error: filePath parameter is required"
                    }],
                    isError: true
                };
            }

            const gitRepoPath = this.resolveGitRepository(repoPath);
            const git = this.getGitIntegration(gitRepoPath);
            
            // Convert to relative path within the repository
            const absoluteFilePath = path.resolve(filePath);
            const relativeFilePath = path.relative(gitRepoPath, absoluteFilePath);

            const gitContext = await git.getGitContext(relativeFilePath);

            return {
                content: [{
                    type: "text",
                    text: `Git context for ${relativeFilePath}:\\n\\n` +
                          `**Recent commits (${gitContext.recentCommits.length}):**\\n` +
                          gitContext.recentCommits.map((commit: any) => 
                              `- ${commit.hash.substring(0, 8)}: ${commit.message} (${commit.author})`
                          ).join('\\n') + '\\n\\n' +
                          `**Hotspots (${gitContext.hotspots.length} files):**\\n` +
                          gitContext.hotspots.slice(0, 3).map((hotspot: any) => 
                              `- ${hotspot.filePath}: ${hotspot.changeFrequency} changes`
                          ).join('\\n') +
                          (gitContext.hotspots.length > 3 ? `\\n... and ${gitContext.hotspots.length - 3} more files` : '')
                }],
                isError: false
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error getting git context: ${error.message}`
                }],
                isError: true
            };
        }
    }

    /**
     * Get git blame for a file
     */
    async handleGetGitBlame(args: any) {
        try {
            const { filePath, repoPath } = args;
            
            if (!filePath) {
                return {
                    content: [{
                        type: "text",
                        text: "Error: filePath parameter is required"
                    }],
                    isError: true
                };
            }

            const gitRepoPath = this.resolveGitRepository(repoPath);
            const git = this.getGitIntegration(gitRepoPath);
            
            const absoluteFilePath = path.resolve(filePath);
            const relativeFilePath = path.relative(gitRepoPath, absoluteFilePath);

            const blameInfo = await git.getBlame(relativeFilePath);

            return {
                content: [{
                    type: "text", 
                    text: `Git blame for ${relativeFilePath}:\\n\\n` +
                          blameInfo.map((blame: any) => 
                              `${String(blame.lineNumber).padStart(4)}: ${blame.author.padEnd(20)} ${blame.commit.substring(0, 8)} ${blame.content}`
                          ).join('\\n')
                }],
                isError: false
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error getting git blame: ${error.message}`
                }],
                isError: true
            };
        }
    }

    /**
     * Get git history for a file
     */
    async handleGetGitHistory(args: any) {
        try {
            const { filePath, repoPath, limit = 20 } = args;
            
            if (!filePath) {
                return {
                    content: [{
                        type: "text",
                        text: "Error: filePath parameter is required"
                    }],
                    isError: true
                };
            }

            const gitRepoPath = this.resolveGitRepository(repoPath);
            const git = this.getGitIntegration(gitRepoPath);
            
            const absoluteFilePath = path.resolve(filePath);
            const relativeFilePath = path.relative(gitRepoPath, absoluteFilePath);

            const history = await git.getFileHistory(relativeFilePath, limit);

            return {
                content: [{
                    type: "text",
                    text: `Git history for ${relativeFilePath} (last ${limit} commits):\\n\\n` +
                          history.commits.map((commit: any) => 
                              `**${commit.hash.substring(0, 8)}** ${commit.date.toLocaleDateString()}\\n` +
                              `Author: ${commit.author}\\n` +
                              `Message: ${commit.message}\\n` +
                              `Files: ${commit.files.join(', ')}\\n`
                          ).join('\\n')
                }],
                isError: false
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text", 
                    text: `Error getting git history: ${error.message}`
                }],
                isError: true
            };
        }
    }

    /**
     * Get repository hotspots (most changed files)
     */
    async handleGetGitHotspots(args: any) {
        try {
            const { repoPath, limit = 10 } = args;

            const gitRepoPath = this.resolveGitRepository(repoPath);
            const git = this.getGitIntegration(gitRepoPath);
            
            const hotspots = await git.getCodeHotspots(30); // 30 days

            return {
                content: [{
                    type: "text",
                    text: `Repository hotspots (top ${limit} most changed files):\\n\\n` +
                          hotspots.slice(0, limit).map((hotspot: any, index: number) => 
                              `${index + 1}. **${hotspot.filePath}**\\n` +
                              `   Changes: ${hotspot.changeFrequency}\\n` +
                              `   Authors: ${hotspot.authors.length}\\n` +
                              `   Last modified: ${hotspot.lastModified.toLocaleDateString() || 'N/A'}\\n`
                          ).join('\\n')
                }],
                isError: false
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error getting repository hotspots: ${error.message}`
                }],
                isError: true
            };
        }
    }

    /**
     * Get all available git tools
     */
    getGitTools() {
        return [
            {
                name: "get_git_context",
                description: "Get comprehensive git context for a file including recent commits, blame info, and hotspots",
                inputSchema: {
                    type: "object",
                    properties: {
                        filePath: {
                            type: "string",
                            description: "Path to the file (absolute or relative)"
                        },
                        repoPath: {
                            type: "string", 
                            description: "Optional: Path to git repository root. If not provided, will try PROJECT_ROOT env var or auto-detect"
                        }
                    },
                    required: ["filePath"]
                }
            },
            {
                name: "get_git_blame",
                description: "Get git blame information showing who last modified each line of a file",
                inputSchema: {
                    type: "object",
                    properties: {
                        filePath: {
                            type: "string",
                            description: "Path to the file (absolute or relative)"
                        },
                        repoPath: {
                            type: "string",
                            description: "Optional: Path to git repository root. If not provided, will try PROJECT_ROOT env var or auto-detect"
                        }
                    },
                    required: ["filePath"]
                }
            },
            {
                name: "get_git_history",
                description: "Get commit history for a specific file",
                inputSchema: {
                    type: "object",
                    properties: {
                        filePath: {
                            type: "string",
                            description: "Path to the file (absolute or relative)"
                        },
                        repoPath: {
                            type: "string",
                            description: "Optional: Path to git repository root. If not provided, will try PROJECT_ROOT env var or auto-detect"
                        },
                        limit: {
                            type: "number",
                            description: "Maximum number of commits to return (default: 20)"
                        }
                    },
                    required: ["filePath"]
                }
            },
            {
                name: "get_git_hotspots",
                description: "Get repository hotspots - files that change most frequently",
                inputSchema: {
                    type: "object",
                    properties: {
                        repoPath: {
                            type: "string",
                            description: "Optional: Path to git repository root. If not provided, will try PROJECT_ROOT env var or auto-detect"
                        },
                        limit: {
                            type: "number",
                            description: "Maximum number of hotspots to return (default: 10)"
                        }
                    },
                    required: []
                }
            }
        ];
    }
}