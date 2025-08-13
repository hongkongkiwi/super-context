// Core types and interfaces for vector databases
export interface VectorDocument {
    id?: string; // Optional - some DBs generate IDs
    vector: number[];
    content: string;
    source: string; // File path/source identifier
    relativePath: string;
    startLine: number;
    endLine: number;
    fileExtension: string;
    metadata?: Record<string, any>; // Optional metadata
}

export interface SearchOptions {
    topK?: number;
    limit?: number; // Alternative to topK for consistency
    filter?: Record<string, any>;
    threshold?: number;
    filterExpr?: string;
    timeout?: number; // Add timeout support
}

export interface VectorSearchResult {
    document: VectorDocument;
    score: number;
    metadata?: Record<string, any>; // Additional search metadata
}

// New interfaces for hybrid search
export interface HybridSearchRequest {
    vector: number[]; // Query vector
    query?: string; // Optional text query
    limit?: number; // Max results
    filter?: Record<string, any>; // Metadata filter
    timeout?: number; // Request timeout
    
    // Milvus-specific fields (for backward compatibility)
    data?: number[] | string; // Query vector or text
    anns_field?: string; // Vector field name (vector or sparse_vector)
    param?: Record<string, any>; // Search parameters
}

export interface HybridSearchOptions {
    rerank?: RerankStrategy;
    limit?: number;
    filterExpr?: string;
    timeout?: number;
}

export interface RerankStrategy {
    strategy: 'rrf' | 'weighted';
    params?: Record<string, any>;
}

export interface HybridSearchResult {
    results: VectorSearchResult[];
    metadata?: Record<string, any>;
}

/**
 * Base interface for simple vector databases that work with a single collection/index
 * This matches the pattern used by most implementations (Pinecone, Chroma, Weaviate, etc.)
 */
export interface SimpleVectorDatabase {
    // Connection management
    connect?(): Promise<void>;
    disconnect?(): Promise<void>;
    
    // Collection/Index management (single collection per instance)
    createCollection(name: string, dimension: number, description?: string): Promise<void>;
    dropCollection(name: string): Promise<void>;
    hasCollection(name: string): Promise<boolean>;
    listCollections?(): Promise<string[]>;

    // Document operations
    insertDocuments(documents: VectorDocument[]): Promise<void>;
    
    // Search operations
    search(query: number[], options?: SearchOptions): Promise<VectorSearchResult[]>;
    hybridSearch?(request: HybridSearchRequest): Promise<HybridSearchResult>;

    // Document management
    deleteDocuments(filter: Record<string, any>): Promise<number>;
    clearCollection?(): Promise<void>;
    getDocumentCount?(): Promise<number>;
}

/**
 * Interface for multi-collection vector databases (like Milvus, Qdrant)
 * These can work with multiple collections and need collection names as parameters
 */
export interface MultiCollectionVectorDatabase {
    // Connection management
    connect?(): Promise<void>;
    disconnect?(): Promise<void>;
    
    // Collection management
    createCollection(collectionName: string, dimension: number, description?: string): Promise<void>;
    createHybridCollection?(collectionName: string, dimension: number, description?: string): Promise<void>;
    dropCollection(collectionName: string): Promise<void>;
    hasCollection(collectionName: string): Promise<boolean>;
    listCollections(): Promise<string[]>;

    // Document operations with collection names
    insert(collectionName: string, documents: VectorDocument[]): Promise<void>;
    insertHybrid?(collectionName: string, documents: VectorDocument[]): Promise<void>;

    // Search operations with collection names
    search(collectionName: string, queryVector: number[], options?: SearchOptions): Promise<VectorSearchResult[]>;
    hybridSearch?(collectionName: string, searchRequests: HybridSearchRequest[], options?: HybridSearchOptions): Promise<HybridSearchResult[]>;

    // Document management with collection names
    delete?(collectionName: string, ids: string[]): Promise<void>;
    query?(collectionName: string, filter: string, outputFields: string[], limit?: number): Promise<Record<string, any>[]>;
}

/**
 * Adapter interface that bridges simple and multi-collection patterns
 * This is what the Context class will use
 */
export interface VectorDatabaseAdapter {
    // Collection management
    createCollection(collectionName: string, dimension: number, description?: string): Promise<void>;
    createHybridCollection?(collectionName: string, dimension: number, description?: string): Promise<void>;
    dropCollection(collectionName: string): Promise<void>;
    hasCollection(collectionName: string): Promise<boolean>;
    listCollections?(): Promise<string[]>;

    // Document operations
    insert(collectionName: string, documents: VectorDocument[]): Promise<void>;
    insertHybrid?(collectionName: string, documents: VectorDocument[]): Promise<void>;

    // Search operations
    search(collectionName: string, queryVector: number[], options?: SearchOptions): Promise<VectorSearchResult[]>;
    hybridSearch?(collectionName: string, searchRequests: HybridSearchRequest[], options?: HybridSearchOptions): Promise<HybridSearchResult[]>;

    // Document management
    delete?(collectionName: string, ids: string[]): Promise<void>;
    query?(collectionName: string, filter: string, outputFields: string[], limit?: number): Promise<Record<string, any>[]>;
    
    // Lifecycle management
    connect?(): Promise<void>;
    disconnect?(): Promise<void>;
}

/**
 * Configuration for vector database timeout and retry settings
 */
export interface VectorDatabaseConfig {
    timeout?: number; // Default timeout in milliseconds
    retries?: number; // Number of retry attempts
    retryDelay?: number; // Delay between retries in milliseconds
    maxConcurrency?: number; // Maximum concurrent operations
}

/**
 * Health check interface for monitoring
 */
export interface VectorDatabaseHealth {
    status: 'healthy' | 'unhealthy' | 'degraded';
    timestamp: string;
    responseTime?: number;
    error?: string;
    metadata?: Record<string, any>;
}

/**
 * Metrics interface for monitoring and observability
 */
export interface VectorDatabaseMetrics {
    operationsTotal: number;
    operationsPerSecond: number;
    avgResponseTime: number;
    errorRate: number;
    connectionCount: number;
    memoryUsage?: number;
    cacheHitRate?: number;
}

/**
 * Special error message for collection limit exceeded
 */
export const COLLECTION_LIMIT_MESSAGE = "[Error]: Your Zilliz Cloud account has hit its collection limit. To continue creating collections, you'll need to expand your capacity. We recommend visiting https://zilliz.com/pricing to explore options for dedicated or serverless clusters.";

// Re-export for backward compatibility
export type VectorDatabase = SimpleVectorDatabase;
export type CollectionAwareVectorDatabase = VectorDatabaseAdapter;