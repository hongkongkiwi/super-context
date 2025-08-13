import {
    SimpleVectorDatabase,
    MultiCollectionVectorDatabase,
    VectorDatabaseAdapter,
    VectorDocument,
    VectorSearchResult,
    SearchOptions,
    HybridSearchRequest,
    HybridSearchOptions,
    HybridSearchResult,
    VectorDatabaseConfig,
    VectorDatabaseHealth,
    VectorDatabaseMetrics
} from './interfaces';

/**
 * Adapter that wraps a SimpleVectorDatabase to work with the Context class
 * This handles the collection-aware interface while delegating to single-collection implementations
 */
export class SimpleVectorDatabaseAdapter implements VectorDatabaseAdapter {
    private database: SimpleVectorDatabase;
    private config: VectorDatabaseConfig;
    private currentCollection: string | null = null;
    private metrics: VectorDatabaseMetrics;
    private startTime: number;

    constructor(database: SimpleVectorDatabase, config: VectorDatabaseConfig = {}) {
        this.database = database;
        this.config = {
            timeout: 30000,
            retries: 3,
            retryDelay: 1000,
            maxConcurrency: 10,
            ...config
        };
        this.metrics = {
            operationsTotal: 0,
            operationsPerSecond: 0,
            avgResponseTime: 0,
            errorRate: 0,
            connectionCount: 0
        };
        this.startTime = Date.now();
    }

    async connect(): Promise<void> {
        if (this.database.connect) {
            await this.executeWithTimeout('connect', () => this.database.connect!());
        }
    }

    async disconnect(): Promise<void> {
        if (this.database.disconnect) {
            await this.executeWithTimeout('disconnect', () => this.database.disconnect!());
        }
    }

    async createCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
        await this.executeWithTimeout('createCollection', async () => {
            await this.database.createCollection(collectionName, dimension, description);
            this.currentCollection = collectionName;
        });
    }

    async createHybridCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
        // For simple databases, hybrid collection is the same as regular collection
        await this.createCollection(collectionName, dimension, description);
    }

    async dropCollection(collectionName: string): Promise<void> {
        await this.executeWithTimeout('dropCollection', async () => {
            await this.database.dropCollection(collectionName);
            if (this.currentCollection === collectionName) {
                this.currentCollection = null;
            }
        });
    }

    async hasCollection(collectionName: string): Promise<boolean> {
        return await this.executeWithTimeout('hasCollection', () => 
            this.database.hasCollection(collectionName)
        );
    }

    async listCollections(): Promise<string[]> {
        if (this.database.listCollections) {
            return await this.executeWithTimeout('listCollections', () => 
                this.database.listCollections!()
            );
        }
        return this.currentCollection ? [this.currentCollection] : [];
    }

    async insert(collectionName: string, documents: VectorDocument[]): Promise<void> {
        await this.executeWithTimeout('insert', async () => {
            this.ensureCollection(collectionName);
            await this.database.insertDocuments(documents);
        });
    }

    async insertHybrid(collectionName: string, documents: VectorDocument[]): Promise<void> {
        // For simple databases, hybrid insert is the same as regular insert
        await this.insert(collectionName, documents);
    }

    async search(collectionName: string, queryVector: number[], options?: SearchOptions): Promise<VectorSearchResult[]> {
        return await this.executeWithTimeout('search', async () => {
            this.ensureCollection(collectionName);
            return await this.database.search(queryVector, options);
        });
    }

    async hybridSearch(collectionName: string, searchRequests: HybridSearchRequest[], options?: HybridSearchOptions): Promise<HybridSearchResult[]> {
        return await this.executeWithTimeout('hybridSearch', async () => {
            this.ensureCollection(collectionName);
            
            if (!this.database.hybridSearch) {
                // Fallback to regular search for the first request
                if (searchRequests.length > 0) {
                    const request = searchRequests[0];
                    const results = await this.database.search(request.vector, {
                        limit: request.limit || options?.limit,
                        filter: request.filter,
                        threshold: undefined,
                        timeout: request.timeout || options?.timeout
                    });
                    return [{
                        results,
                        metadata: {
                            searchType: 'vector_only',
                            message: 'Hybrid search not supported, used vector search'
                        }
                    }];
                }
                return [];
            }

            // For simple databases, we need to convert multi-request to single request
            const results: HybridSearchResult[] = [];
            for (const request of searchRequests) {
                const result = await this.database.hybridSearch(request);
                results.push(result);
            }
            return results;
        });
    }

    async delete(collectionName: string, ids: string[]): Promise<void> {
        await this.executeWithTimeout('delete', async () => {
            this.ensureCollection(collectionName);
            await this.database.deleteDocuments({ id: ids });
        });
    }

    async query(collectionName: string, filter: string, outputFields: string[], limit?: number): Promise<Record<string, any>[]> {
        // Most simple databases don't support structured queries
        // Return empty array or implement basic filtering
        return [];
    }

    private ensureCollection(collectionName: string): void {
        if (this.currentCollection !== collectionName) {
            throw new Error(`Collection mismatch. Expected: ${this.currentCollection}, got: ${collectionName}. Simple databases work with a single collection.`);
        }
    }

    private async executeWithTimeout<T>(
        operation: string,
        fn: () => Promise<T>,
        timeout?: number
    ): Promise<T> {
        const startTime = Date.now();
        const timeoutMs = timeout || this.config.timeout!;
        
        try {
            const result = await Promise.race([
                fn(),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error(`Operation ${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
                )
            ]);
            
            const responseTime = Date.now() - startTime;
            this.updateMetrics(operation, responseTime, false);
            
            return result;
        } catch (error) {
            const responseTime = Date.now() - startTime;
            this.updateMetrics(operation, responseTime, true);
            throw error;
        }
    }

    private updateMetrics(operation: string, responseTime: number, isError: boolean): void {
        this.metrics.operationsTotal++;
        this.metrics.avgResponseTime = (this.metrics.avgResponseTime + responseTime) / 2;
        
        if (isError) {
            this.metrics.errorRate = (this.metrics.errorRate + 1) / this.metrics.operationsTotal;
        }

        // Calculate operations per second (simple moving average)  
        this.metrics.operationsPerSecond = this.metrics.operationsTotal / Math.max(1, (Date.now() - this.startTime) / 1000);
    }

    async getHealth(): Promise<VectorDatabaseHealth> {
        const startTime = Date.now();
        try {
            // Simple health check - try to list collections
            if (this.database.listCollections) {
                await this.database.listCollections();
            } else if (this.currentCollection) {
                await this.database.hasCollection(this.currentCollection);
            }

            return {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                responseTime: Date.now() - startTime,
                metadata: {
                    currentCollection: this.currentCollection,
                    databaseType: this.database.constructor.name
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                responseTime: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    getMetrics(): VectorDatabaseMetrics {
        return { ...this.metrics };
    }
}

/**
 * Adapter that wraps a MultiCollectionVectorDatabase to ensure consistent interface
 * This mainly adds timeout handling and metrics collection
 */
export class MultiCollectionVectorDatabaseAdapter implements VectorDatabaseAdapter {
    private database: MultiCollectionVectorDatabase;
    private config: VectorDatabaseConfig;
    private metrics: VectorDatabaseMetrics;
    private startTime: number;

    constructor(database: MultiCollectionVectorDatabase, config: VectorDatabaseConfig = {}) {
        this.database = database;
        this.config = {
            timeout: 30000,
            retries: 3,
            retryDelay: 1000,
            maxConcurrency: 10,
            ...config
        };
        this.metrics = {
            operationsTotal: 0,
            operationsPerSecond: 0,
            avgResponseTime: 0,
            errorRate: 0,
            connectionCount: 0
        };
        this.startTime = Date.now();
    }

    async connect(): Promise<void> {
        if (this.database.connect) {
            await this.executeWithTimeout('connect', () => this.database.connect!());
        }
    }

    async disconnect(): Promise<void> {
        if (this.database.disconnect) {
            await this.executeWithTimeout('disconnect', () => this.database.disconnect!());
        }
    }

    async createCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
        await this.executeWithTimeout('createCollection', () => 
            this.database.createCollection(collectionName, dimension, description)
        );
    }

    async createHybridCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
        if (this.database.createHybridCollection) {
            await this.executeWithTimeout('createHybridCollection', () => 
                this.database.createHybridCollection!(collectionName, dimension, description)
            );
        } else {
            await this.createCollection(collectionName, dimension, description);
        }
    }

    async dropCollection(collectionName: string): Promise<void> {
        await this.executeWithTimeout('dropCollection', () => 
            this.database.dropCollection(collectionName)
        );
    }

    async hasCollection(collectionName: string): Promise<boolean> {
        return await this.executeWithTimeout('hasCollection', () => 
            this.database.hasCollection(collectionName)
        );
    }

    async listCollections(): Promise<string[]> {
        return await this.executeWithTimeout('listCollections', () => 
            this.database.listCollections()
        );
    }

    async insert(collectionName: string, documents: VectorDocument[]): Promise<void> {
        await this.executeWithTimeout('insert', () => 
            this.database.insert(collectionName, documents)
        );
    }

    async insertHybrid(collectionName: string, documents: VectorDocument[]): Promise<void> {
        if (this.database.insertHybrid) {
            await this.executeWithTimeout('insertHybrid', () => 
                this.database.insertHybrid!(collectionName, documents)
            );
        } else {
            await this.insert(collectionName, documents);
        }
    }

    async search(collectionName: string, queryVector: number[], options?: SearchOptions): Promise<VectorSearchResult[]> {
        return await this.executeWithTimeout('search', () => 
            this.database.search(collectionName, queryVector, options)
        );
    }

    async hybridSearch(collectionName: string, searchRequests: HybridSearchRequest[], options?: HybridSearchOptions): Promise<HybridSearchResult[]> {
        if (this.database.hybridSearch) {
            return await this.executeWithTimeout('hybridSearch', () => 
                this.database.hybridSearch!(collectionName, searchRequests, options)
            );
        }
        
        // Fallback to regular search
        if (searchRequests.length > 0) {
            const request = searchRequests[0];
            const results = await this.search(collectionName, request.vector, {
                limit: request.limit || options?.limit,
                filter: request.filter
            });
            return [{
                results,
                metadata: {
                    searchType: 'vector_only',
                    message: 'Hybrid search not supported, used vector search'
                }
            }];
        }
        return [];
    }

    async delete(collectionName: string, ids: string[]): Promise<void> {
        if (this.database.delete) {
            await this.executeWithTimeout('delete', () => 
                this.database.delete!(collectionName, ids)
            );
        }
    }

    async query(collectionName: string, filter: string, outputFields: string[], limit?: number): Promise<Record<string, any>[]> {
        if (this.database.query) {
            return await this.executeWithTimeout('query', () => 
                this.database.query!(collectionName, filter, outputFields, limit)
            );
        }
        return [];
    }

    private async executeWithTimeout<T>(
        operation: string,
        fn: () => Promise<T>,
        timeout?: number
    ): Promise<T> {
        const startTime = Date.now();
        const timeoutMs = timeout || this.config.timeout!;
        
        try {
            const result = await Promise.race([
                fn(),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error(`Operation ${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
                )
            ]);
            
            const responseTime = Date.now() - startTime;
            this.updateMetrics(operation, responseTime, false);
            
            return result;
        } catch (error) {
            const responseTime = Date.now() - startTime;
            this.updateMetrics(operation, responseTime, true);
            throw error;
        }
    }

    private updateMetrics(operation: string, responseTime: number, isError: boolean): void {
        this.metrics.operationsTotal++;
        this.metrics.avgResponseTime = (this.metrics.avgResponseTime + responseTime) / 2;
        
        if (isError) {
            this.metrics.errorRate = (this.metrics.errorRate + 1) / this.metrics.operationsTotal;
        }

        // Calculate operations per second
        const elapsedSeconds = Math.max(1, (Date.now() - this.startTime) / 1000);
        this.metrics.operationsPerSecond = this.metrics.operationsTotal / elapsedSeconds;
    }

    async getHealth(): Promise<VectorDatabaseHealth> {
        const startTime = Date.now();
        try {
            // Health check - try to list collections
            await this.database.listCollections();

            return {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                responseTime: Date.now() - startTime,
                metadata: {
                    databaseType: this.database.constructor.name
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                responseTime: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    getMetrics(): VectorDatabaseMetrics {
        return { ...this.metrics };
    }
}

/**
 * Factory function to create appropriate adapter for any vector database
 */
export function createVectorDatabaseAdapter(
    database: SimpleVectorDatabase | MultiCollectionVectorDatabase,
    config: VectorDatabaseConfig = {}
): VectorDatabaseAdapter {
    // Check if database has multi-collection methods
    if ('insert' in database && typeof database.insert === 'function') {
        return new MultiCollectionVectorDatabaseAdapter(database as MultiCollectionVectorDatabase, config);
    } else {
        return new SimpleVectorDatabaseAdapter(database as SimpleVectorDatabase, config);
    }
}