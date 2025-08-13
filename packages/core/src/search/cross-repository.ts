/**
 * Cross-repository search and management
 */

import * as path from 'path';
import * as fs from 'fs';
import { Context } from '../context';
import { SemanticSearchResult } from '../types';
import { VectorDatabase } from '../vectordb';

export interface Repository {
    id: string;
    name: string;
    path: string;
    remote?: string;
    branch?: string;
    lastIndexed?: Date;
    metadata?: Record<string, any>;
}

export interface CrossRepoSearchOptions {
    repositories?: string[]; // Repository IDs to search
    includeArchived?: boolean;
    aggregateResults?: boolean;
    maxResultsPerRepo?: number;
    globalMaxResults?: number;
}

export interface CrossRepoSearchResult extends SemanticSearchResult {
    repositoryId: string;
    repositoryName: string;
    repositoryPath: string;
}

export interface RepositoryGroup {
    id: string;
    name: string;
    repositories: string[];
    metadata?: Record<string, any>;
}

/**
 * Manages search across multiple repositories
 */
export class CrossRepositorySearch {
    private repositories = new Map<string, Repository>();
    private repositoryGroups = new Map<string, RepositoryGroup>();
    private context: Context;
    private repositoryPrefix = 'repo_';

    constructor(context: Context) {
        this.context = context;
    }

    /**
     * Register a repository for cross-repo search
     */
    async registerRepository(repo: Repository): Promise<void> {
        // Validate repository path
        if (!fs.existsSync(repo.path)) {
            throw new Error(`Repository path does not exist: ${repo.path}`);
        }

        // Check if it's a git repository
        const gitPath = path.join(repo.path, '.git');
        if (!fs.existsSync(gitPath)) {
            console.warn(`⚠️  ${repo.path} is not a git repository`);
        }

        // Store repository metadata
        this.repositories.set(repo.id, repo);
        
        console.log(`✅ Registered repository: ${repo.name} (${repo.id})`);
    }

    /**
     * Index a repository
     */
    async indexRepository(
        repositoryId: string,
        progressCallback?: (progress: any) => void
    ): Promise<{ indexedFiles: number; totalChunks: number }> {
        const repo = this.repositories.get(repositoryId);
        if (!repo) {
            throw new Error(`Repository not found: ${repositoryId}`);
        }

        console.log(`🚀 Indexing repository: ${repo.name}`);
        
        // Create a namespaced collection for this repository
        const collectionName = this.getRepositoryCollectionName(repositoryId);
        
        // Store original collection name method
        const originalGetCollectionName = this.context.getCollectionName.bind(this.context);
        
        // Override to use repository-specific collection
        this.context.getCollectionName = () => collectionName;
        
        try {
            // Index the repository
            const result = await this.context.indexCodebase(
                repo.path,
                progressCallback
            );
            
            // Update last indexed time
            repo.lastIndexed = new Date();
            
            return result;
        } finally {
            // Restore original method
            this.context.getCollectionName = originalGetCollectionName;
        }
    }

    /**
     * Search across multiple repositories
     */
    async searchAcrossRepositories(
        query: string,
        options: CrossRepoSearchOptions = {}
    ): Promise<CrossRepoSearchResult[]> {
        const {
            repositories = Array.from(this.repositories.keys()),
            aggregateResults = true,
            maxResultsPerRepo = 5,
            globalMaxResults = 20
        } = options;

        console.log(`🔍 Searching across ${repositories.length} repositories: "${query}"`);

        const allResults: CrossRepoSearchResult[] = [];
        
        // Search each repository
        for (const repoId of repositories) {
            const repo = this.repositories.get(repoId);
            if (!repo) {
                console.warn(`⚠️  Repository not found: ${repoId}`);
                continue;
            }

            try {
                const results = await this.searchRepository(
                    repoId,
                    query,
                    maxResultsPerRepo
                );
                
                // Add repository information to results
                const enrichedResults = results.map(result => ({
                    ...result,
                    repositoryId: repo.id,
                    repositoryName: repo.name,
                    repositoryPath: repo.path
                }));
                
                allResults.push(...enrichedResults);
            } catch (error) {
                console.error(`❌ Failed to search repository ${repo.name}: ${error}`);
            }
        }

        // Sort and limit results
        if (aggregateResults) {
            // Sort by score across all repositories
            allResults.sort((a, b) => b.score - a.score);
            return allResults.slice(0, globalMaxResults);
        }

        return allResults;
    }

    /**
     * Search a specific repository
     */
    private async searchRepository(
        repositoryId: string,
        query: string,
        limit: number
    ): Promise<SemanticSearchResult[]> {
        const repo = this.repositories.get(repositoryId);
        if (!repo) {
            throw new Error(`Repository not found: ${repositoryId}`);
        }

        const collectionName = this.getRepositoryCollectionName(repositoryId);
        
        // Check if collection exists
        const hasCollection = await this.context.getVectorDatabase().hasCollection(collectionName);
        if (!hasCollection) {
            console.warn(`⚠️  Repository ${repo.name} has not been indexed yet`);
            return [];
        }

        // Store original collection name method
        const originalGetCollectionName = this.context.getCollectionName.bind(this.context);
        
        // Override to use repository-specific collection
        this.context.getCollectionName = () => collectionName;
        
        try {
            // Perform search
            const results = await this.context.semanticSearch(
                repo.path,
                query,
                limit
            );
            
            return results;
        } finally {
            // Restore original method
            this.context.getCollectionName = originalGetCollectionName;
        }
    }

    /**
     * Create a repository group
     */
    createRepositoryGroup(group: RepositoryGroup): void {
        this.repositoryGroups.set(group.id, group);
        console.log(`✅ Created repository group: ${group.name} with ${group.repositories.length} repositories`);
    }

    /**
     * Search within a repository group
     */
    async searchRepositoryGroup(
        groupId: string,
        query: string,
        options?: CrossRepoSearchOptions
    ): Promise<CrossRepoSearchResult[]> {
        const group = this.repositoryGroups.get(groupId);
        if (!group) {
            throw new Error(`Repository group not found: ${groupId}`);
        }

        return this.searchAcrossRepositories(query, {
            ...options,
            repositories: group.repositories
        });
    }

    /**
     * Get repository statistics
     */
    async getRepositoryStats(repositoryId: string): Promise<{
        indexed: boolean;
        fileCount?: number;
        chunkCount?: number;
        lastIndexed?: Date;
        collectionSize?: number;
    }> {
        const repo = this.repositories.get(repositoryId);
        if (!repo) {
            throw new Error(`Repository not found: ${repositoryId}`);
        }

        const collectionName = this.getRepositoryCollectionName(repositoryId);
        const hasCollection = await this.context.getVectorDatabase().hasCollection(collectionName);

        if (!hasCollection) {
            return { indexed: false };
        }

        // Get collection statistics
        try {
            const stats = await (this.context.getVectorDatabase() as any).getCollectionStats?.(collectionName);
            
            return {
                indexed: true,
                fileCount: stats?.fileCount,
                chunkCount: stats?.vectorCount,
                lastIndexed: repo.lastIndexed,
                collectionSize: stats?.size
            };
        } catch (error) {
            return {
                indexed: true,
                lastIndexed: repo.lastIndexed
            };
        }
    }

    /**
     * Compare code across repositories
     */
    async compareAcrossRepositories(
        query: string,
        repositoryIds: string[]
    ): Promise<{
        repository: string;
        results: SemanticSearchResult[];
        summary: string;
    }[]> {
        const comparisons = [];
        
        for (const repoId of repositoryIds) {
            const repo = this.repositories.get(repoId);
            if (!repo) continue;
            
            const results = await this.searchRepository(repoId, query, 3);
            
            // Generate summary
            const summary = this.generateComparisonSummary(results, repo.name);
            
            comparisons.push({
                repository: repo.name,
                results,
                summary
            });
        }
        
        return comparisons;
    }

    /**
     * Find code duplicates across repositories
     */
    async findDuplicatesAcrossRepositories(
        threshold: number = 0.9
    ): Promise<Map<string, CrossRepoSearchResult[]>> {
        const duplicates = new Map<string, CrossRepoSearchResult[]>();
        
        // This would be more sophisticated in production
        // For now, we'll search for common patterns
        const commonPatterns = [
            'database connection',
            'authentication middleware',
            'error handler',
            'logging utility'
        ];
        
        for (const pattern of commonPatterns) {
            const results = await this.searchAcrossRepositories(pattern, {
                maxResultsPerRepo: 3
            });
            
            // Group by similarity
            if (results.length > 1) {
                duplicates.set(pattern, results);
            }
        }
        
        return duplicates;
    }

    /**
     * Sync all repositories
     */
    async syncAllRepositories(
        progressCallback?: (repo: string, progress: any) => void
    ): Promise<Map<string, { added: number; removed: number; modified: number }>> {
        const syncResults = new Map();
        
        for (const [repoId, repo] of this.repositories) {
            try {
                console.log(`🔄 Syncing repository: ${repo.name}`);
                
                // Store original collection name method
                const originalGetCollectionName = this.context.getCollectionName.bind(this.context);
                
                // Override to use repository-specific collection
                const collectionName = this.getRepositoryCollectionName(repoId);
                this.context.getCollectionName = () => collectionName;
                
                try {
                    const result = await this.context.reindexByChange(
                        repo.path,
                        (progress) => progressCallback?.(repo.name, progress)
                    );
                    
                    syncResults.set(repo.name, result);
                } finally {
                    // Restore original method
                    this.context.getCollectionName = originalGetCollectionName;
                }
            } catch (error) {
                console.error(`❌ Failed to sync repository ${repo.name}: ${error}`);
                syncResults.set(repo.name, { added: 0, removed: 0, modified: 0 });
            }
        }
        
        return syncResults;
    }

    /**
     * Get repository collection name
     */
    private getRepositoryCollectionName(repositoryId: string): string {
        return `${this.repositoryPrefix}${repositoryId}`;
    }

    /**
     * Generate comparison summary
     */
    private generateComparisonSummary(
        results: SemanticSearchResult[],
        repoName: string
    ): string {
        if (results.length === 0) {
            return `No matching code found in ${repoName}`;
        }
        
        const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
        const languages = [...new Set(results.map(r => r.language))];
        
        return `Found ${results.length} matches in ${repoName} (avg score: ${avgScore.toFixed(2)}, languages: ${languages.join(', ')})`;
    }

    /**
     * Export repository configuration
     */
    exportConfiguration(): {
        repositories: Repository[];
        groups: RepositoryGroup[];
    } {
        return {
            repositories: Array.from(this.repositories.values()),
            groups: Array.from(this.repositoryGroups.values())
        };
    }

    /**
     * Import repository configuration
     */
    async importConfiguration(config: {
        repositories: Repository[];
        groups: RepositoryGroup[];
    }): Promise<void> {
        // Import repositories
        for (const repo of config.repositories) {
            await this.registerRepository(repo);
        }
        
        // Import groups
        for (const group of config.groups) {
            this.createRepositoryGroup(group);
        }
        
        console.log(`✅ Imported ${config.repositories.length} repositories and ${config.groups.length} groups`);
    }

    /**
     * Get all registered repositories
     */
    getRepositories(): Repository[] {
        return Array.from(this.repositories.values());
    }

    /**
     * Remove a repository
     */
    async removeRepository(repositoryId: string): Promise<void> {
        const repo = this.repositories.get(repositoryId);
        if (!repo) {
            throw new Error(`Repository not found: ${repositoryId}`);
        }

        // Drop the collection
        const collectionName = this.getRepositoryCollectionName(repositoryId);
        const hasCollection = await this.context.getVectorDatabase().hasCollection(collectionName);
        
        if (hasCollection) {
            await this.context.getVectorDatabase().dropCollection(collectionName);
        }

        // Remove from registry
        this.repositories.delete(repositoryId);
        
        console.log(`✅ Removed repository: ${repo.name}`);
    }
}