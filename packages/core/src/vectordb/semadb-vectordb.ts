import { VectorDatabase, VectorDocument, VectorSearchResult, SearchOptions, HybridSearchResult, HybridSearchRequest } from './types';

// SemaDB client - install with: npm install semadb-client
let SemaDB: any = null;
try {
    SemaDB = require('semadb-client');
} catch (error) {
    console.warn('[SEMADB] semadb-client not available. Please install it with: npm install semadb-client');
}

export interface SemaDBConfig {
    // Connection configuration
    apiKey: string;
    endpoint?: string;
    // Collection configuration
    collectionName: string;
    // Vector configuration
    dimension: number;
    metric?: 'cosine' | 'euclidean' | 'dot';
    // Index configuration
    indexType?: 'hnsw' | 'ivf' | 'flat';
    // HNSW parameters
    m?: number; // Number of connections for HNSW
    efConstruction?: number; // Size of the dynamic candidate list for HNSW construction
    efSearch?: number; // Size of the dynamic candidate list for HNSW search
    // Performance settings
    timeout?: number;
    retries?: number;
    batchSize?: number;
}

export class SemaDBVectorDatabase implements VectorDatabase {
    private config: SemaDBConfig;
    private client: any = null;
    private collection: any = null;
    private isInitialized: boolean = false;

    constructor(config: SemaDBConfig) {
        if (!SemaDB) {
            throw new Error('semadb-client is not available. Please install it with: npm install semadb-client');
        }

        this.config = {
            endpoint: 'https://api.semadb.com',
            metric: 'cosine',
            indexType: 'hnsw',
            m: 16,
            efConstruction: 200,
            efSearch: 100,
            timeout: 60000,
            retries: 3,
            batchSize: 100,
            ...config
        };

        if (!this.config.apiKey) {
            throw new Error('SemaDB API key is required');
        }

        if (!this.config.collectionName) {
            throw new Error('SemaDB collection name is required');
        }

        if (!this.config.dimension || this.config.dimension <= 0) {
            throw new Error('SemaDB vector dimension must be a positive integer');
        }
    }

    async connect(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        console.log(`[SEMADB] Connecting to SemaDB at ${this.config.endpoint}...`);
        
        try {
            // Create SemaDB client
            this.client = new SemaDB({
                apiKey: this.config.apiKey,
                endpoint: this.config.endpoint,
                timeout: this.config.timeout,
                retries: this.config.retries
            });

            // Test connection by getting server info
            const serverInfo = await this.client.getInfo();
            console.log(`[SEMADB] Connected to SemaDB version: ${serverInfo.version}`);

            this.isInitialized = true;
            console.log(`[SEMADB] ✅ Successfully connected to SemaDB`);
        } catch (error) {
            console.error(`[SEMADB] Failed to connect: ${error}`);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.isInitialized) {
            // SemaDB client doesn't need explicit disconnection
            this.client = null;
            this.collection = null;
            this.isInitialized = false;
            console.log(`[SEMADB] Disconnected from database`);
        }
    }

    async createCollection(name: string, dimension: number, description?: string): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[SEMADB] Creating collection "${name}" with dimension ${dimension}...`);

        try {
            // Check if collection already exists
            const collections = await this.client.listCollections();
            const existingCollection = collections.find((col: any) => col.name === name);
            
            if (existingCollection) {
                console.log(`[SEMADB] Collection "${name}" already exists`);
                this.collection = await this.client.getCollection(name);
                return;
            }

            // Create collection with index configuration
            const collectionConfig = {
                name,
                dimension,
                description: description || `Vector collection for ${name}`,
                metric: this.config.metric,
                indexConfig: {
                    type: this.config.indexType,
                    ...(this.config.indexType === 'hnsw' && {
                        m: this.config.m,
                        efConstruction: this.config.efConstruction
                    })
                }
            };

            this.collection = await this.client.createCollection(collectionConfig);
            console.log(`[SEMADB] ✅ Collection "${name}" created successfully`);
        } catch (error) {
            console.error(`[SEMADB] Failed to create collection "${name}": ${error}`);
            throw error;
        }
    }

    async hasCollection(name: string): Promise<boolean> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const collections = await this.client.listCollections();
            return collections.some((col: any) => col.name === name);
        } catch (error) {
            console.error(`[SEMADB] Failed to check collection "${name}": ${error}`);
            return false;
        }
    }

    async dropCollection(name: string): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[SEMADB] Dropping collection "${name}"...`);

        try {
            await this.client.deleteCollection(name);
            
            if (this.collection && this.collection.name === name) {
                this.collection = null;
            }
            
            console.log(`[SEMADB] ✅ Collection "${name}" dropped successfully`);
        } catch (error) {
            console.error(`[SEMADB] Failed to drop collection "${name}": ${error}`);
            throw error;
        }
    }

    async listCollections(): Promise<string[]> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const collections = await this.client.listCollections();
            return collections.map((col: any) => col.name);
        } catch (error) {
            console.error(`[SEMADB] Failed to list collections: ${error}`);
            return [];
        }
    }

    private async ensureCollection(): Promise<void> {
        if (!this.collection) {
            try {
                this.collection = await this.client.getCollection(this.config.collectionName);
            } catch (error) {
                throw new Error(`Collection "${this.config.collectionName}" does not exist. Create it first.`);
            }
        }
    }

    async insertDocuments(documents: VectorDocument[]): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        await this.ensureCollection();

        if (documents.length === 0) {
            return;
        }

        console.log(`[SEMADB] Inserting ${documents.length} documents...`);

        try {
            // Prepare documents for SemaDB format
            const semaDbDocuments = documents.map(doc => ({
                id: doc.id || `doc_${Date.now()}_${Math.random()}`,
                vector: doc.vector,
                metadata: {
                    content: doc.content,
                    source: doc.source,
                    relativePath: doc.relativePath,
                    startLine: doc.startLine,
                    endLine: doc.endLine,
                    fileExtension: doc.fileExtension,
                    ...(doc.metadata || {})
                }
            }));

            // Insert in batches
            const batchSize = this.config.batchSize!;
            
            for (let i = 0; i < semaDbDocuments.length; i += batchSize) {
                const batch = semaDbDocuments.slice(i, i + batchSize);
                
                await this.collection.insert(batch);
                
                console.log(`[SEMADB] Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(semaDbDocuments.length / batchSize)}`);
                
                // Small delay between batches to avoid rate limits
                if (i + batchSize < semaDbDocuments.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            console.log(`[SEMADB] ✅ Successfully inserted ${documents.length} documents`);
        } catch (error) {
            console.error(`[SEMADB] Failed to insert documents: ${error}`);
            throw error;
        }
    }

    async search(query: number[], options: SearchOptions = {}): Promise<VectorSearchResult[]> {
        if (!this.isInitialized) {
            await this.connect();
        }

        await this.ensureCollection();

        const limit = options.limit || options.topK || 10;
        
        try {
            console.log(`[SEMADB] Searching for top ${limit} similar vectors...`);
            
            const searchParams: any = {
                vector: query,
                limit: limit,
                efSearch: this.config.efSearch
            };

            // Add metadata filter if provided
            if (options.filter) {
                searchParams.filter = this.convertFilter(options.filter);
            }

            // Add score threshold if provided
            if (options.threshold) {
                searchParams.threshold = options.threshold;
            }

            const response = await this.collection.search(searchParams);

            const searchResults: VectorSearchResult[] = response.results.map((result: any) => {
                const metadata = result.metadata || {};
                
                const document: VectorDocument = {
                    id: result.id,
                    content: metadata.content || '',
                    source: metadata.source || '',
                    relativePath: metadata.relativePath || '',
                    startLine: metadata.startLine || 0,
                    endLine: metadata.endLine || 0,
                    fileExtension: metadata.fileExtension || '',
                    vector: result.vector || [],
                    metadata: {
                        ...metadata,
                        content: undefined,
                        source: undefined,
                        relativePath: undefined,
                        startLine: undefined,
                        endLine: undefined,
                        fileExtension: undefined
                    }
                };

                return {
                    document,
                    score: result.score,
                    metadata: {
                        semadb_id: result.id,
                        distance: result.distance || (1.0 - result.score)
                    }
                };
            });

            console.log(`[SEMADB] Found ${searchResults.length} results`);
            return searchResults;
        } catch (error) {
            console.error(`[SEMADB] Search failed: ${error}`);
            throw error;
        }
    }

    private convertFilter(filter: Record<string, any>): any {
        // Convert generic filter to SemaDB filter format
        const semaDbFilter: any = {};

        for (const [key, value] of Object.entries(filter)) {
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                semaDbFilter[key] = { eq: value };
            } else if (Array.isArray(value)) {
                semaDbFilter[key] = { in: value };
            } else if (typeof value === 'object' && value !== null) {
                // Handle range queries
                const rangeFilter: any = {};
                if (value.gte !== undefined) rangeFilter.gte = value.gte;
                if (value.gt !== undefined) rangeFilter.gt = value.gt;
                if (value.lte !== undefined) rangeFilter.lte = value.lte;
                if (value.lt !== undefined) rangeFilter.lt = value.lt;
                if (Object.keys(rangeFilter).length > 0) {
                    semaDbFilter[key] = rangeFilter;
                }
            }
        }

        return semaDbFilter;
    }

    async hybridSearch(request: HybridSearchRequest): Promise<HybridSearchResult> {
        if (!this.isInitialized) {
            await this.connect();
        }

        await this.ensureCollection();

        console.log(`[SEMADB] Performing hybrid search...`);

        try {
            // SemaDB hybrid search with text and vector
            const searchParams: any = {
                limit: request.limit || 10,
                efSearch: this.config.efSearch
            };

            if (request.filter) {
                searchParams.filter = this.convertFilter(request.filter);
            }

            let searchResults: VectorSearchResult[] = [];

            if (request.query && request.query.trim()) {
                // Hybrid search with text query and vector
                searchParams.vector = request.vector;
                searchParams.query = request.query;
                searchParams.hybrid = {
                    alpha: 0.5 // Balance between vector and text search
                };
                
                const response = await this.collection.hybridSearch(searchParams);
                searchResults = this.processSearchResponse(response);
            } else {
                // Vector search only
                searchParams.vector = request.vector;
                const response = await this.collection.search(searchParams);
                searchResults = this.processSearchResponse(response);
            }

            console.log(`[SEMADB] Hybrid search found ${searchResults.length} results`);
            
            return {
                results: searchResults,
                metadata: {
                    searchType: request.query && request.query.trim() ? 'hybrid' : 'vector_only',
                    alpha: 0.5
                }
            };
        } catch (error) {
            console.error(`[SEMADB] Hybrid search failed: ${error}`);
            
            // Fallback to vector search
            const vectorResults = await this.search(request.vector, {
                limit: request.limit,
                filter: request.filter
            });

            return {
                results: vectorResults,
                metadata: {
                    searchType: 'vector_only',
                    message: 'Hybrid search failed, performed vector search only'
                }
            };
        }
    }

    private processSearchResponse(response: any): VectorSearchResult[] {
        return response.results.map((result: any) => {
            const metadata = result.metadata || {};
            
            const document: VectorDocument = {
                id: result.id,
                content: metadata.content || '',
                source: metadata.source || '',
                relativePath: metadata.relativePath || '',
                startLine: metadata.startLine || 0,
                endLine: metadata.endLine || 0,
                fileExtension: metadata.fileExtension || '',
                vector: result.vector || [],
                metadata: {
                    ...metadata,
                    content: undefined,
                    source: undefined,
                    relativePath: undefined,
                    startLine: undefined,
                    endLine: undefined,
                    fileExtension: undefined
                }
            };

            return {
                document,
                score: result.score,
                metadata: {
                    semadb_id: result.id,
                    distance: result.distance || (1.0 - result.score)
                }
            };
        });
    }

    async deleteDocuments(filter: Record<string, any>): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        await this.ensureCollection();

        console.log(`[SEMADB] Deleting documents with filter:`, filter);

        try {
            if (filter.id) {
                // Delete by ID(s)
                const ids = Array.isArray(filter.id) ? filter.id : [filter.id];
                
                const result = await this.collection.delete({ ids });
                
                console.log(`[SEMADB] ✅ Deleted ${result.deletedCount || ids.length} documents by ID`);
                return result.deletedCount || ids.length;
            } else {
                // Delete by metadata filter
                const semaDbFilter = this.convertFilter(filter);
                
                const result = await this.collection.delete({ filter: semaDbFilter });
                
                console.log(`[SEMADB] ✅ Deleted ${result.deletedCount || 0} documents by filter`);
                return result.deletedCount || 0;
            }
        } catch (error) {
            console.error(`[SEMADB] Failed to delete documents: ${error}`);
            throw error;
        }
    }

    async clearCollection(): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[SEMADB] Clearing all documents from collection "${this.config.collectionName}"...`);

        try {
            // Delete all documents in the collection
            const result = await this.collection.deleteAll();
            
            console.log(`[SEMADB] ✅ Cleared collection. Deleted ${result.deletedCount || 'all'} documents`);
        } catch (error) {
            console.error(`[SEMADB] Failed to clear collection: ${error}`);
            throw error;
        }
    }

    async getDocumentCount(): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        await this.ensureCollection();

        try {
            const stats = await this.collection.getStats();
            return stats.documentCount || 0;
        } catch (error) {
            console.error(`[SEMADB] Failed to get document count: ${error}`);
            return 0;
        }
    }

    // SemaDB-specific utility methods
    async getCollectionInfo(): Promise<any> {
        if (!this.isInitialized) {
            await this.connect();
        }

        await this.ensureCollection();

        try {
            const [stats, schema] = await Promise.all([
                this.collection.getStats(),
                this.collection.getSchema()
            ]);

            return {
                name: this.config.collectionName,
                dimension: this.config.dimension,
                documentCount: stats.documentCount,
                indexType: this.config.indexType,
                metric: this.config.metric,
                schema: schema,
                stats: stats
            };
        } catch (error) {
            console.error(`[SEMADB] Failed to get collection info: ${error}`);
            throw error;
        }
    }

    async optimizeIndex(): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        await this.ensureCollection();

        console.log(`[SEMADB] Optimizing index for collection "${this.config.collectionName}"...`);

        try {
            await this.collection.optimizeIndex();
            console.log(`[SEMADB] ✅ Index optimization completed`);
        } catch (error) {
            console.error(`[SEMADB] Failed to optimize index: ${error}`);
            throw error;
        }
    }
}