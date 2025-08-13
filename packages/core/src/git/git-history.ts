/**
 * Git history integration for enhanced code context
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface GitCommit {
    hash: string;
    author: string;
    date: Date;
    message: string;
    files: string[];
    stats?: {
        additions: number;
        deletions: number;
    };
}

export interface GitBlame {
    line: number;
    commit: string;
    author: string;
    date: Date;
    content: string;
}

export interface GitFileHistory {
    filePath: string;
    commits: GitCommit[];
    totalCommits: number;
    authors: string[];
    firstCommit: Date;
    lastCommit: Date;
}

export interface GitDiff {
    filePath: string;
    additions: string[];
    deletions: string[];
    context: string[];
}

export interface GitContext {
    recentCommits: GitCommit[];
    fileHistory: GitFileHistory;
    relatedFiles: string[];
    hotspots: CodeHotspot[];
    authors: AuthorInfo[];
}

export interface CodeHotspot {
    filePath: string;
    changeFrequency: number;
    lastModified: Date;
    complexity: number;
    authors: string[];
}

export interface AuthorInfo {
    name: string;
    email: string;
    commitCount: number;
    filesModified: string[];
    expertise: string[];
}

/**
 * Integrates git history for better code understanding
 */
export class GitHistoryIntegration {
    private repoPath: string;
    private cacheEnabled: boolean;
    private cache = new Map<string, any>();

    constructor(repoPath: string, cacheEnabled: boolean = true) {
        this.repoPath = repoPath;
        this.cacheEnabled = cacheEnabled;
    }

    /**
     * Get recent commits
     */
    async getRecentCommits(limit: number = 10): Promise<GitCommit[]> {
        const cacheKey = `commits_${limit}`;
        if (this.cacheEnabled && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const { stdout } = await execAsync(
                `git log --oneline --pretty=format:"%H|%an|%ad|%s" --date=iso -${limit}`,
                { cwd: this.repoPath }
            );

            const commits: GitCommit[] = stdout.split('\n').map(line => {
                const [hash, author, date, ...messageParts] = line.split('|');
                return {
                    hash,
                    author,
                    date: new Date(date),
                    message: messageParts.join('|'),
                    files: [] as string[]
                };
            });

            // Get files for each commit
            for (const commit of commits) {
                commit.files = await this.getCommitFiles(commit.hash);
            }

            if (this.cacheEnabled) {
                this.cache.set(cacheKey, commits);
            }

            return commits;
        } catch (error) {
            console.error(`Failed to get commits: ${error}`);
            return [];
        }
    }

    /**
     * Get file history
     */
    async getFileHistory(filePath: string, limit: number = 20): Promise<GitFileHistory> {
        const cacheKey = `history_${filePath}_${limit}`;
        if (this.cacheEnabled && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const relativePath = path.relative(this.repoPath, filePath);
            
            const { stdout } = await execAsync(
                `git log --follow --pretty=format:"%H|%an|%ad|%s" --date=iso -${limit} -- "${relativePath}"`,
                { cwd: this.repoPath }
            );

            if (!stdout) {
                return {
                    filePath: relativePath,
                    commits: [] as GitCommit[],
                    totalCommits: 0,
                    authors: [] as string[],
                    firstCommit: new Date(),
                    lastCommit: new Date()
                };
            }

            const commits = stdout.split('\n').filter(line => line).map(line => {
                const [hash, author, date, ...messageParts] = line.split('|');
                return {
                    hash,
                    author,
                    date: new Date(date),
                    message: messageParts.join('|'),
                    files: [relativePath]
                };
            });

            const authors = [...new Set(commits.map(c => c.author))];
            
            const history: GitFileHistory = {
                filePath: relativePath,
                commits,
                totalCommits: commits.length,
                authors,
                firstCommit: commits[commits.length - 1]?.date || new Date(),
                lastCommit: commits[0]?.date || new Date()
            };

            if (this.cacheEnabled) {
                this.cache.set(cacheKey, history);
            }

            return history;
        } catch (error) {
            console.error(`Failed to get file history: ${error}`);
            return {
                filePath,
                commits: [],
                totalCommits: 0,
                authors: [],
                firstCommit: new Date(),
                lastCommit: new Date()
            };
        }
    }

    /**
     * Get git blame for file
     */
    async getBlame(filePath: string): Promise<GitBlame[]> {
        const cacheKey = `blame_${filePath}`;
        if (this.cacheEnabled && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const relativePath = path.relative(this.repoPath, filePath);
            
            const { stdout } = await execAsync(
                `git blame --line-porcelain "${relativePath}"`,
                { cwd: this.repoPath }
            );

            const blameData: GitBlame[] = [];
            const lines = stdout.split('\n');
            let currentBlame: Partial<GitBlame> = {};
            
            for (const line of lines) {
                if (line.match(/^[0-9a-f]{40}/)) {
                    // Commit hash line
                    const parts = line.split(' ');
                    currentBlame.commit = parts[0];
                    currentBlame.line = parseInt(parts[2]);
                } else if (line.startsWith('author ')) {
                    currentBlame.author = line.substring(7);
                } else if (line.startsWith('author-time ')) {
                    currentBlame.date = new Date(parseInt(line.substring(12)) * 1000);
                } else if (line.startsWith('\t')) {
                    // Content line
                    currentBlame.content = line.substring(1);
                    blameData.push(currentBlame as GitBlame);
                    currentBlame = {};
                }
            }

            if (this.cacheEnabled) {
                this.cache.set(cacheKey, blameData);
            }

            return blameData;
        } catch (error) {
            console.error(`Failed to get blame: ${error}`);
            return [];
        }
    }

    /**
     * Get files changed in commit
     */
    private async getCommitFiles(commitHash: string): Promise<string[]> {
        try {
            const { stdout } = await execAsync(
                `git diff-tree --no-commit-id --name-only -r ${commitHash}`,
                { cwd: this.repoPath }
            );
            
            return stdout.split('\n').filter(file => file);
        } catch (error) {
            return [];
        }
    }

    /**
     * Get related files (files often changed together)
     */
    async getRelatedFiles(filePath: string, limit: number = 10): Promise<string[]> {
        try {
            const relativePath = path.relative(this.repoPath, filePath);
            
            // Get commits that modified this file
            const { stdout: commits } = await execAsync(
                `git log --pretty=format:"%H" --follow -50 -- "${relativePath}"`,
                { cwd: this.repoPath }
            );

            if (!commits) return [];

            const commitHashes = commits.split('\n').filter(h => h);
            const fileFrequency = new Map<string, number>();

            // For each commit, get all files changed
            for (const hash of commitHashes) {
                const files = await this.getCommitFiles(hash);
                for (const file of files) {
                    if (file !== relativePath) {
                        fileFrequency.set(file, (fileFrequency.get(file) || 0) + 1);
                    }
                }
            }

            // Sort by frequency and return top files
            const sortedFiles = Array.from(fileFrequency.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit)
                .map(([file]) => file);

            return sortedFiles;
        } catch (error) {
            console.error(`Failed to get related files: ${error}`);
            return [];
        }
    }

    /**
     * Get code hotspots (frequently changed files)
     */
    async getCodeHotspots(days: number = 30): Promise<CodeHotspot[]> {
        try {
            const since = new Date();
            since.setDate(since.getDate() - days);
            const sinceStr = since.toISOString().split('T')[0];

            const { stdout } = await execAsync(
                `git log --since="${sinceStr}" --pretty=format: --name-only | sort | uniq -c | sort -rg`,
                { cwd: this.repoPath }
            );

            const hotspots: CodeHotspot[] = [];
            const lines = stdout.split('\n').filter(line => line.trim());

            for (const line of lines.slice(0, 20)) { // Top 20 hotspots
                const match = line.trim().match(/(\d+)\s+(.+)/);
                if (match) {
                    const [, count, filePath] = match;
                    const fullPath = path.join(this.repoPath, filePath);
                    
                    if (fs.existsSync(fullPath)) {
                        const stats = await fs.promises.stat(fullPath);
                        const history = await this.getFileHistory(fullPath, 10);
                        
                        hotspots.push({
                            filePath,
                            changeFrequency: parseInt(count),
                            lastModified: stats.mtime,
                            complexity: await this.estimateComplexity(fullPath),
                            authors: history.authors
                        });
                    }
                }
            }

            return hotspots;
        } catch (error) {
            console.error(`Failed to get hotspots: ${error}`);
            return [];
        }
    }

    /**
     * Get author information
     */
    async getAuthorInfo(limit: number = 10): Promise<AuthorInfo[]> {
        try {
            const { stdout } = await execAsync(
                `git shortlog -sne --all`,
                { cwd: this.repoPath }
            );

            const authors: AuthorInfo[] = [];
            const lines = stdout.split('\n').filter(line => line.trim());

            for (const line of lines.slice(0, limit)) {
                const match = line.trim().match(/(\d+)\s+(.+)\s+<(.+)>/);
                if (match) {
                    const [, commits, name, email] = match;
                    
                    // Get files modified by author
                    const { stdout: files } = await execAsync(
                        `git log --author="${email}" --pretty=format: --name-only | sort -u`,
                        { cwd: this.repoPath }
                    );
                    
                    const modifiedFiles = files.split('\n').filter(f => f);
                    const expertise = this.inferExpertise(modifiedFiles);
                    
                    authors.push({
                        name,
                        email,
                        commitCount: parseInt(commits),
                        filesModified: modifiedFiles.slice(0, 20), // Limit to 20 files
                        expertise
                    });
                }
            }

            return authors;
        } catch (error) {
            console.error(`Failed to get author info: ${error}`);
            return [];
        }
    }

    /**
     * Get comprehensive git context for a file
     */
    async getGitContext(filePath: string): Promise<GitContext> {
        const [
            recentCommits,
            fileHistory,
            relatedFiles,
            hotspots,
            authors
        ] = await Promise.all([
            this.getRecentCommits(5),
            this.getFileHistory(filePath, 10),
            this.getRelatedFiles(filePath, 5),
            this.getCodeHotspots(30),
            this.getAuthorInfo(5)
        ]);

        return {
            recentCommits,
            fileHistory,
            relatedFiles,
            hotspots: hotspots.slice(0, 5),
            authors
        };
    }

    /**
     * Get diff between commits
     */
    async getDiff(fromCommit: string, toCommit: string = 'HEAD'): Promise<GitDiff[]> {
        try {
            const { stdout } = await execAsync(
                `git diff ${fromCommit}..${toCommit} --unified=3`,
                { cwd: this.repoPath }
            );

            const diffs: GitDiff[] = [];
            const files = stdout.split('diff --git');
            
            for (const file of files.slice(1)) {
                const lines = file.split('\n');
                const fileMatch = lines[0].match(/a\/(.+)\s+b\/(.+)/);
                
                if (fileMatch) {
                    const filePath = fileMatch[2];
                    const additions: string[] = [];
                    const deletions: string[] = [];
                    const context: string[] = [];
                    
                    for (const line of lines) {
                        if (line.startsWith('+') && !line.startsWith('+++')) {
                            additions.push(line.substring(1));
                        } else if (line.startsWith('-') && !line.startsWith('---')) {
                            deletions.push(line.substring(1));
                        } else if (line.startsWith(' ')) {
                            context.push(line.substring(1));
                        }
                    }
                    
                    diffs.push({
                        filePath,
                        additions,
                        deletions,
                        context
                    });
                }
            }

            return diffs;
        } catch (error) {
            console.error(`Failed to get diff: ${error}`);
            return [];
        }
    }

    /**
     * Estimate file complexity
     */
    private async estimateComplexity(filePath: string): Promise<number> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            
            // Simple complexity estimation
            let complexity = 1;
            
            for (const line of lines) {
                // Count decision points
                if (/\b(if|else|for|while|switch|case|catch)\b/.test(line)) {
                    complexity++;
                }
                // Count function definitions
                if (/\b(function|def|fn|func)\b/.test(line)) {
                    complexity++;
                }
            }
            
            return complexity;
        } catch {
            return 0;
        }
    }

    /**
     * Infer expertise from file paths
     */
    private inferExpertise(files: string[]): string[] {
        const expertise = new Set<string>();
        
        for (const file of files) {
            const ext = path.extname(file);
            const dir = path.dirname(file);
            
            // Language expertise
            const langMap: Record<string, string> = {
                '.js': 'JavaScript',
                '.ts': 'TypeScript',
                '.py': 'Python',
                '.java': 'Java',
                '.go': 'Go',
                '.rs': 'Rust',
                '.cpp': 'C++',
                '.cs': 'C#'
            };
            
            if (langMap[ext]) {
                expertise.add(langMap[ext]);
            }
            
            // Domain expertise
            if (dir.includes('frontend') || dir.includes('ui')) {
                expertise.add('Frontend');
            }
            if (dir.includes('backend') || dir.includes('api')) {
                expertise.add('Backend');
            }
            if (dir.includes('test') || dir.includes('spec')) {
                expertise.add('Testing');
            }
            if (dir.includes('database') || dir.includes('db')) {
                expertise.add('Database');
            }
        }
        
        return Array.from(expertise);
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        this.cache.clear();
    }
}