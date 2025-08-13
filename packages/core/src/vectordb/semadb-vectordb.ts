/**
 * SemaDB Vector Database Implementation
 * Uses HTTP API since no official SDK exists
 */

import { 
    VectorDocument, 
    SearchOptions, 
    VectorSearchResult, 
    SimpleVectorDatabase,
    VectorDatabaseHealth,
    VectorDatabaseMetrics,
    HybridSearchRequest,
    HybridSearchResult
} from './types';

export interface SemaDBConfig {
    apiUrl?: string;
    apiKey?: string;
    userId?: string;
    userPlan?: string;
    useMessagePack?: boolean;
    searchSize?: number;
    degreeBound?: number;
    alpha?: number;
    distanceMetric?: 'cosine' | 'euclidean' | 'dot';
}

export interface SemaDBCollection {
    id: string;
    indexSchema: {
        vector: {
            type: 'vectorVamana';
            vectorVamana: {
                vectorSize: number;
                distanceMetric: string;
                searchSize: number;
                degreeBound: number;
                alpha: number;
            };
        };
    };
}

export interface SemaDBPoint {
    _id?: string;
    vector: number[];
    content?: string;
    source?: string;
    relativePath?: string;
    startLine?: number;
    endLine?: number;
    fileExtension?: string;
    metadata?: Record<string, any>;
    [key: string]: any;
}

export interface SemaDBSearchQuery {
    query: {
        property: string;
        vectorVamana: {
            vector: number[];
            operator: 'near';
            searchSize: number;
            limit: number;
        };
    };
    select?: string[];
    limit: number;
    filter?: Record<string, any>;
}

/**
 * SemaDB vector database implementation using REST API
 */
export class SemaDBVectorDatabase implements SimpleVectorDatabase {
    private config: SemaDBConfig;
    private baseUrl: string;
    private headers: Record<string, string>;
    private collectionName: string = 'default';
    private vectorSize: number = 0;

    constructor(config: SemaDBConfig) {
        this.config = {
            searchSize: 75,
            degreeBound: 64,
            alpha: 1.2,
            distanceMetric: 'cosine',
            useMessagePack: false,
            ...config
        };

        // Set base URL - use RapidAPI if API key provided, otherwise local
        if (config.apiKey) {
            this.baseUrl = 'https://semadb.p.rapidapi.com/v2';
            this.headers = {
                'X-RapidAPI-Key': config.apiKey,
                'X-RapidAPI-Host': 'semadb.p.rapidapi.com',
                'Content-Type': 'application/json'
            };
        } else {
            this.baseUrl = config.apiUrl || 'http://localhost:8081/v2';
            this.headers = {
                'Content-Type': 'application/json'
            };
            
            // Add user headers for self-hosted
            if (config.userId) {
                this.headers['X-User-Id'] = config.userId;
            }
            if (config.userPlan) {
                this.headers['X-User-Plan'] = config.userPlan;
            }
        }
    }

    /**
     * Connect to database (no-op for HTTP API)
     */
    async connect(): Promise<void> {
        // HTTP API doesn't require connection
        console.log('SemaDB HTTP connection established');
    }

    /**
     * Disconnect from database (no-op for HTTP API)
     */
    async disconnect(): Promise<void> {
        // HTTP API doesn't require closing
        console.log('SemaDB HTTP connection closed');
    }

    /**
     * Create a collection
     */
    async createCollection(name: string, dimension: number, description?: string): Promise<void> {
        this.collectionName = name;
        this.vectorSize = dimension;

        const collection: SemaDBCollection = {
            id: name,
            indexSchema: {
                vector: {
                    type: 'vectorVamana',
                    vectorVamana: {
                        vectorSize: dimension,
                        distanceMetric: this.config.distanceMetric!,
                        searchSize: this.config.searchSize!,
                        degreeBound: this.config.degreeBound!,
                        alpha: this.config.alpha!
                    }
                }
            }
        };

        const response = await fetch(`${this.baseUrl}/collections`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(collection)
        });

        if (!response.ok && response.status !== 409) { // 409 = already exists
            const error = await response.text();
            throw new Error(`Failed to create collection: ${error}`);
        }
    }

    /**
     * Drop a collection
     */
    async dropCollection(name: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/collections/${name}`, {
            method: 'DELETE',
            headers: this.headers
        });

        if (!response.ok && response.status !== 404) {
            const error = await response.text();
            throw new Error(`Failed to drop collection: ${error}`);
        }
    }

    /**
     * Check if collection exists
     */
    async hasCollection(name: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/collections/${name}`, {
                method: 'GET',
                headers: this.headers
            });

            return response.status === 200;
        } catch (error) {
            return false;
        }
    }

    /**
     * List collections
     */
    async listCollections(): Promise<string[]> {
        const response = await fetch(`${this.baseUrl}/collections`, {
            method: 'GET',
            headers: this.headers
        });

        if (!response.ok) {
            return [];
        }

        const result = await response.json() as any;
        return (result.collections || []).map((c: any) => c.id || c.name);
    }

    /**
     * Insert documents into the database
     */
    async insertDocuments(documents: VectorDocument[]): Promise<void> {
        if (documents.length === 0) return;

        const points: SemaDBPoint[] = documents.map(doc => ({
            _id: doc.id,
            vector: doc.vector,
            content: doc.content,
            source: doc.source,
            relativePath: doc.relativePath,
            startLine: doc.startLine,
            endLine: doc.endLine,
            fileExtension: doc.fileExtension,
            metadata: doc.metadata || {}
        }));

        const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ points })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to insert documents: ${error}`);
        }
    }

    /**
     * Search for similar vectors
     */
    async search(
        query: number[],
        options: SearchOptions = {}
    ): Promise<VectorSearchResult[]> {
        const limit = options.topK || options.limit || 10;

        const searchQuery: SemaDBSearchQuery = {
            query: {
                property: 'vector',
                vectorVamana: {
                    vector: query,
                    operator: 'near',
                    searchSize: this.config.searchSize!,
                    limit: limit
                }
            },
            select: ['content', 'source', 'relativePath', 'startLine', 'endLine', 'fileExtension', 'metadata'],
            limit: limit
        };

        // Add filters if provided
        if (options.filter) {
            searchQuery.filter = options.filter;
        }

        const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points/search`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(searchQuery)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Search failed: ${error}`);
        }

        const result = await response.json() as any;
        
        // Transform results to our format
        return (result.points || []).map((point: any) => ({
            document: {
                id: point._id,
                vector: point.vector || [],
                content: point.content || '',
                source: point.source || '',
                relativePath: point.relativePath || '',
                startLine: point.startLine || 0,
                endLine: point.endLine || 0,
                fileExtension: point.fileExtension || '',
                metadata: point.metadata
            },
            score: point._distance !== undefined ? (1 - point._distance) : 0,
            metadata: point.metadata
        }));
    }

    /**
     * Hybrid search implementation
     */
    async hybridSearch(request: HybridSearchRequest): Promise<HybridSearchResult> {
        const limit = request.limit || 10;

        const searchQuery: SemaDBSearchQuery = {
            query: {
                property: 'vector',
                vectorVamana: {
                    vector: request.vector,
                    operator: 'near',
                    searchSize: this.config.searchSize!,
                    limit: limit
                }
            },
            select: ['content', 'source', 'relativePath', 'startLine', 'endLine', 'fileExtension', 'metadata'],
            limit: limit,
            filter: request.filter
        };

        const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points/search`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(searchQuery)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Hybrid search failed: ${error}`);
        }

        const result = await response.json() as any;
        
        const results = (result.points || []).map((point: any) => ({
            document: {
                id: point._id,
                vector: point.vector || [],
                content: point.content || '',
                source: point.source || '',
                relativePath: point.relativePath || '',
                startLine: point.startLine || 0,
                endLine: point.endLine || 0,
                fileExtension: point.fileExtension || '',
                metadata: point.metadata
            },
            score: point._distance !== undefined ? (1 - point._distance) : 0,
            metadata: point.metadata
        }));

        return {
            results,
            metadata: {
                totalResults: results.length
            }
        };
    }

    /**
     * Delete documents by filter
     */
    async deleteDocuments(filter: Record<string, any>): Promise<number> {
        // SemaDB doesn't support filter-based deletion directly
        // We need to search first then delete by IDs
        const searchQuery = {
            filter: filter,
            limit: 1000
        };

        const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points/search`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(searchQuery)
        });

        if (!response.ok) {
            return 0;
        }

        const result = await response.json() as any;
        const ids = (result.points || []).map((p: any) => p._id).filter((id: any) => id);
        
        if (ids.length === 0) return 0;

        await this.deleteByIds(ids);
        return ids.length;
    }

    /**
     * Delete vectors by IDs
     */
    private async deleteByIds(ids: string[]): Promise<void> {
        if (ids.length === 0) return;

        // SemaDB doesn't have bulk delete, so we need to delete one by one
        const deletePromises = ids.map(id => 
            fetch(`${this.baseUrl}/collections/${this.collectionName}/points/${id}`, {
                method: 'DELETE',
                headers: this.headers
            })
        );

        const results = await Promise.allSettled(deletePromises);
        
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length > 0) {
            console.warn(`Failed to delete ${failed.length} documents`);
        }
    }

    /**
     * Clear all vectors from the collection
     */
    async clearCollection(): Promise<void> {
        // Delete and recreate collection
        try {
            await this.dropCollection(this.collectionName);
            await this.createCollection(this.collectionName, this.vectorSize);
        } catch (error) {
            console.error('Failed to clear collection:', error);
            throw error;
        }
    }

    /**
     * Get document count
     */
    async getDocumentCount(): Promise<number> {
        const stats = await this.getStats();
        return stats.count;
    }

    /**
     * Get database statistics
     */
    private async getStats(): Promise<{ count: number; dimension: number }> {
        try {
            const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                return { count: 0, dimension: this.vectorSize };
            }

            const collection = await response.json() as any;
            
            return {
                count: collection.pointCount || 0,
                dimension: collection.indexSchema?.vector?.vectorVamana?.vectorSize || this.vectorSize
            };
        } catch (error) {
            console.error('Failed to get stats:', error);
            return { count: 0, dimension: this.vectorSize };
        }
    }

    /**
     * Check database health
     */
    async checkHealth(): Promise<VectorDatabaseHealth> {
        try {
            const startTime = Date.now();
            const response = await fetch(`${this.baseUrl}/collections`, {
                method: 'GET',
                headers: this.headers
            });

            const responseTime = Date.now() - startTime;
            const status = response.ok ? 'healthy' : 'unhealthy';

            return {
                status: status as 'healthy' | 'unhealthy',
                timestamp: new Date().toISOString(),
                responseTime,
                metadata: {
                    httpStatus: response.status,
                    statusText: response.statusText,
                    collection: this.collectionName
                }
            };
        } catch (error: any) {
            return {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                responseTime: -1,
                error: error.message,
                metadata: { error: error.toString() }
            };
        }
    }

    /**
     * Get database metrics
     */
    async getMetrics(): Promise<VectorDatabaseMetrics> {
        const stats = await this.getStats();
        const health = await this.checkHealth();

        return {
            operationsTotal: 0,
            operationsPerSecond: 0,
            avgResponseTime: health.responseTime || 0,
            errorRate: health.status === 'healthy' ? 0.0 : 1.0,
            connectionCount: 1,
            memoryUsage: 0,
            cacheHitRate: 0
        };
    }
}