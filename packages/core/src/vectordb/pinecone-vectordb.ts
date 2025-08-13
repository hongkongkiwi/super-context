import { VectorDatabase, VectorDocument, VectorSearchResult, SearchOptions, HybridSearchResult, HybridSearchRequest } from './types';

// Pinecone SDK - install with: npm install @pinecone-database/pinecone
let Pinecone: any = null;
try {
    Pinecone = require('@pinecone-database/pinecone').Pinecone;
} catch (error) {
    console.warn('[PINECONE] @pinecone-database/pinecone not available. Please install it with: npm install @pinecone-database/pinecone');
}

export interface PineconeConfig {
    apiKey: string;
    // Index configuration
    indexName: string;
    environment?: string;
    // Vector configuration
    dimension: number;
    metric?: 'cosine' | 'euclidean' | 'dotproduct';
    // Model configuration (for serverless indexes)
    model?: 'multilingual-e5-large' | 'text-embedding-ada-002' | string;
    // Namespace configuration (optional)
    namespace?: string;
    // Pod configuration (for paid plans)
    podType?: 'p1.x1' | 'p1.x2' | 'p1.x4' | 'p2.x1' | 'p2.x2' | 'p2.x4';
    replicas?: number;
    shards?: number;
    // Metadata configuration
    metadataConfig?: {
        indexed?: string[];
    };
    // Performance settings
    topK?: number;
    includeValues?: boolean;
    includeMetadata?: boolean;
}

export class PineconeVectorDatabase implements VectorDatabase {
    private config: PineconeConfig;
    private client: any = null;
    private index: any = null;
    private isInitialized: boolean = false;

    constructor(config: PineconeConfig) {
        if (!Pinecone) {
            throw new Error('@pinecone-database/pinecone is not available. Please install it with: npm install @pinecone-database/pinecone');
        }

        this.config = {
            metric: 'cosine',
            namespace: '',
            topK: 10,
            includeValues: false,
            includeMetadata: true,
            ...config
        };

        if (!this.config.apiKey) {
            throw new Error('Pinecone API key is required');
        }

        if (!this.config.indexName) {
            throw new Error('Pinecone index name is required');
        }
    }

    async connect(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        console.log(`[PINECONE] Connecting to Pinecone...`);
        
        try {
            // Initialize Pinecone client
            this.client = new Pinecone({
                apiKey: this.config.apiKey,
                ...(this.config.environment && { environment: this.config.environment })
            });

            // Get the index
            this.index = this.client.index(this.config.indexName);
            
            // Verify index exists and get stats
            const stats = await this.index.describeIndexStats();
            console.log(`[PINECONE] Index stats:`, stats);

            this.isInitialized = true;
            console.log(`[PINECONE] ✅ Successfully connected to Pinecone index "${this.config.indexName}"`);
            console.log(`[PINECONE] Total vectors: ${stats.totalVectorCount || 0}, Dimension: ${stats.dimension || 'unknown'}`);
        } catch (error) {
            console.error(`[PINECONE] Failed to connect: ${error}`);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.isInitialized) {
            this.client = null;
            this.index = null;
            this.isInitialized = false;
            console.log(`[PINECONE] Disconnected from database`);
        }
    }

    async createCollection(name: string, dimension: number): Promise<void> {
        console.log(`[PINECONE] Creating index "${name}" with dimension ${dimension}...`);
        
        try {
            // Check if index already exists
            const indexList = await this.client.listIndexes();
            const existingIndex = indexList.indexes?.find((idx: any) => idx.name === name);
            
            if (existingIndex) {
                console.log(`[PINECONE] Index "${name}" already exists`);
                return;
            }

            // Create index configuration
            const indexConfig: any = {
                name: name,
                dimension: dimension,
                metric: this.config.metric,
                spec: {
                    serverless: {
                        cloud: 'aws',
                        region: 'us-east-1'
                    }
                }
            };

            // For pod-based indexes (paid plans)
            if (this.config.podType) {
                indexConfig.spec = {
                    pod: {
                        environment: this.config.environment || 'gcp-starter',
                        podType: this.config.podType,
                        pods: 1,
                        replicas: this.config.replicas || 1,
                        shards: this.config.shards || 1,
                        ...(this.config.metadataConfig && { metadataConfig: this.config.metadataConfig })
                    }
                };
            }

            await this.client.createIndex(indexConfig);
            
            // Wait for index to be ready
            console.log(`[PINECONE] Waiting for index "${name}" to be ready...`);
            await this.waitForIndexReady(name);
            
            console.log(`[PINECONE] ✅ Index "${name}" created successfully`);
        } catch (error) {
            console.error(`[PINECONE] Failed to create index "${name}": ${error}`);
            throw error;
        }
    }

    private async waitForIndexReady(indexName: string, maxWaitTime: number = 60000): Promise<void> {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            try {
                const indexStatus = await this.client.describeIndex(indexName);
                if (indexStatus.status?.ready) {
                    return;
                }
                console.log(`[PINECONE] Index status: ${indexStatus.status?.state || 'unknown'}`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                console.log(`[PINECONE] Waiting for index to be available...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        throw new Error(`Index "${indexName}" did not become ready within ${maxWaitTime}ms`);
    }

    async hasCollection(name: string): Promise<boolean> {
        try {
            const indexList = await this.client.listIndexes();
            return indexList.indexes?.some((idx: any) => idx.name === name) || false;
        } catch (error) {
            console.error(`[PINECONE] Failed to check if index "${name}" exists: ${error}`);
            return false;
        }
    }

    async dropCollection(name: string): Promise<void> {
        console.log(`[PINECONE] Dropping index "${name}"...`);
        
        try {
            await this.client.deleteIndex(name);
            console.log(`[PINECONE] ✅ Index "${name}" dropped successfully`);
        } catch (error) {
            console.error(`[PINECONE] Failed to drop index "${name}": ${error}`);
            throw error;
        }
    }

    async insertDocuments(documents: VectorDocument[]): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        if (documents.length === 0) {
            return;
        }

        console.log(`[PINECONE] Inserting ${documents.length} documents...`);

        try {
            // Convert documents to Pinecone format
            const vectors = documents.map((doc, index) => ({
                id: doc.id || `doc_${Date.now()}_${index}`,
                values: doc.vector,
                metadata: {
                    content: doc.content,
                    source: doc.source,
                    ...(doc.metadata || {})
                }
            }));

            // Batch upsert (Pinecone handles batching automatically)
            const batchSize = 100; // Pinecone recommends batch sizes up to 100
            
            for (let i = 0; i < vectors.length; i += batchSize) {
                const batch = vectors.slice(i, i + batchSize);
                
                await this.index.upsert(
                    batch,
                    { namespace: this.config.namespace }
                );
                
                console.log(`[PINECONE] Uploaded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(vectors.length / batchSize)}`);
                
                // Small delay between batches to avoid rate limits
                if (i + batchSize < vectors.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            console.log(`[PINECONE] ✅ Successfully inserted ${documents.length} documents`);
        } catch (error) {
            console.error(`[PINECONE] Failed to insert documents: ${error}`);
            throw error;
        }
    }

    async search(query: number[], options: SearchOptions = {}): Promise<VectorSearchResult[]> {
        if (!this.isInitialized) {
            await this.connect();
        }

        const topK = options.limit || this.config.topK || 10;
        
        try {
            console.log(`[PINECONE] Searching for top ${topK} similar vectors...`);
            
            const queryRequest: any = {
                vector: query,
                topK: topK,
                includeValues: this.config.includeValues || false,
                includeMetadata: this.config.includeMetadata !== false,
                namespace: this.config.namespace
            };

            // Add metadata filter if provided
            if (options.filter) {
                queryRequest.filter = this.convertFilter(options.filter);
            }

            const response = await this.index.query(queryRequest);

            const searchResults: VectorSearchResult[] = [];

            if (response.matches) {
                for (const match of response.matches) {
                    const document: VectorDocument = {
                        id: match.id,
                        content: match.metadata?.content || '',
                        source: match.metadata?.source || '',
                        relativePath: match.metadata?.relativePath || match.metadata?.source || '',
                        startLine: match.metadata?.startLine || 0,
                        endLine: match.metadata?.endLine || 0,
                        fileExtension: match.metadata?.fileExtension || '',
                        vector: match.values || [],
                        metadata: match.metadata || {}
                    };

                    searchResults.push({
                        document,
                        score: match.score || 0,
                        metadata: {
                            id: match.id,
                            namespace: this.config.namespace
                        }
                    });
                }
            }

            console.log(`[PINECONE] Found ${searchResults.length} results`);
            return searchResults;
        } catch (error) {
            console.error(`[PINECONE] Search failed: ${error}`);
            throw error;
        }
    }

    private convertFilter(filter: Record<string, any>): any {
        // Convert generic filter to Pinecone filter format
        // Pinecone supports various filter operations
        const pineconeFilter: any = {};

        for (const [key, value] of Object.entries(filter)) {
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                pineconeFilter[key] = { '$eq': value };
            } else if (Array.isArray(value)) {
                pineconeFilter[key] = { '$in': value };
            } else if (typeof value === 'object' && value !== null) {
                // Handle complex filter operations
                pineconeFilter[key] = value;
            }
        }

        return pineconeFilter;
    }

    async hybridSearch(request: HybridSearchRequest): Promise<HybridSearchResult> {
        console.warn(`[PINECONE] Pinecone does not support text-based hybrid search. Performing vector search with metadata filtering.`);
        
        const vectorResults = await this.search(request.vector, {
            limit: request.limit,
            filter: request.filter
        });

        return {
            results: vectorResults,
            metadata: {
                searchType: 'vector_only',
                message: 'Pinecone performed vector search with metadata filtering. Text search is not natively supported.'
            }
        };
    }

    async getDocumentCount(): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const stats = await this.index.describeIndexStats();
            return stats.totalVectorCount || 0;
        } catch (error) {
            console.error(`[PINECONE] Failed to get document count: ${error}`);
            return 0;
        }
    }

    async deleteDocuments(filter: Record<string, any>): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[PINECONE] Deleting documents with filter:`, filter);

        try {
            // Pinecone supports deletion by ID or metadata filter
            const deleteRequest: any = {
                namespace: this.config.namespace
            };

            if (filter.id) {
                // Delete by ID(s)
                deleteRequest.ids = Array.isArray(filter.id) ? filter.id : [filter.id];
            } else {
                // Delete by metadata filter
                deleteRequest.filter = this.convertFilter(filter);
            }

            await this.index.deleteMany(deleteRequest);
            console.log(`[PINECONE] ✅ Documents deleted successfully`);
            
            // Pinecone doesn't return the exact count of deleted documents
            return 1; // Return 1 to indicate success
        } catch (error) {
            console.error(`[PINECONE] Failed to delete documents: ${error}`);
            throw error;
        }
    }

    async clearCollection(): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[PINECONE] Clearing all vectors from namespace "${this.config.namespace || 'default'}"...`);

        try {
            await this.index.deleteAll({ namespace: this.config.namespace });
            console.log(`[PINECONE] ✅ Collection cleared successfully`);
        } catch (error) {
            console.error(`[PINECONE] Failed to clear collection: ${error}`);
            throw error;
        }
    }

    // Pinecone-specific utility methods
    async getIndexInfo(): Promise<any> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const [indexStats, indexDescription] = await Promise.all([
                this.index.describeIndexStats(),
                this.client.describeIndex(this.config.indexName)
            ]);

            return {
                name: this.config.indexName,
                dimension: indexStats.dimension,
                totalVectorCount: indexStats.totalVectorCount,
                metric: this.config.metric,
                environment: this.config.environment,
                status: indexDescription.status,
                namespaces: indexStats.namespaces,
                config: this.config
            };
        } catch (error) {
            console.error(`[PINECONE] Failed to get index info: ${error}`);
            throw error;
        }
    }

    async listNamespaces(): Promise<string[]> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const stats = await this.index.describeIndexStats();
            return Object.keys(stats.namespaces || {});
        } catch (error) {
            console.error(`[PINECONE] Failed to list namespaces: ${error}`);
            return [];
        }
    }

    async fetchVectorById(id: string): Promise<VectorDocument | null> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const response = await this.index.fetch({
                ids: [id],
                namespace: this.config.namespace
            });

            if (response.vectors && response.vectors[id]) {
                const vector = response.vectors[id];
                return {
                    id: id,
                    content: vector.metadata?.content || '',
                    source: vector.metadata?.source || '',
                    relativePath: vector.metadata?.relativePath || vector.metadata?.source || '',
                    startLine: vector.metadata?.startLine || 0,
                    endLine: vector.metadata?.endLine || 0,
                    fileExtension: vector.metadata?.fileExtension || '',
                    vector: vector.values || [],
                    metadata: vector.metadata || {}
                };
            }

            return null;
        } catch (error) {
            console.error(`[PINECONE] Failed to fetch vector by ID "${id}": ${error}`);
            return null;
        }
    }
}