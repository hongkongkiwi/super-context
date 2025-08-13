import { VectorDatabase, VectorDocument, VectorSearchResult, SearchOptions, HybridSearchResult, HybridSearchRequest } from './types';

// Chroma client - install with: npm install chromadb
let ChromaApi: any = null;
try {
    const chroma = require('chromadb');
    ChromaApi = chroma.ChromaApi;
} catch (error) {
    console.warn('[CHROMA] chromadb not available. Please install it with: npm install chromadb');
}

export interface ChromaConfig {
    // Connection configuration
    host?: string;
    port?: number;
    ssl?: boolean;
    // Authentication (if using Chroma cloud or secured instance)
    apiKey?: string;
    auth?: {
        provider: 'token' | 'basic';
        credentials: string | { username: string; password: string };
    };
    // Collection configuration
    collectionName: string;
    // Distance metric: 'cosine', 'l2', 'ip' (inner product)
    metric?: 'cosine' | 'l2' | 'ip';
    // Embedding model (if using Chroma's built-in embeddings)
    embeddingModel?: 'all-MiniLM-L6-v2' | 'all-mpnet-base-v2' | 'text-embedding-ada-002' | string;
    // Additional headers
    headers?: Record<string, string>;
    // Timeout settings
    timeout?: number;
    // Embedding function (optional - we provide vectors)
    embeddingFunction?: any;
}

export class ChromaVectorDatabase implements VectorDatabase {
    private config: ChromaConfig;
    private client: any = null;
    private collection: any = null;
    private isInitialized: boolean = false;

    constructor(config: ChromaConfig) {
        if (!ChromaApi) {
            throw new Error('chromadb is not available. Please install it with: npm install chromadb');
        }

        this.config = {
            host: 'localhost',
            port: 8000,
            ssl: false,
            metric: 'cosine',
            timeout: 30000,
            ...config
        };

        if (!this.config.collectionName) {
            throw new Error('Chroma collection name is required');
        }
    }

    async connect(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        const url = `${this.config.ssl ? 'https' : 'http'}://${this.config.host}:${this.config.port}`;
        console.log(`[CHROMA] Connecting to Chroma at ${url}...`);
        
        try {
            // Create Chroma client configuration
            const clientConfig: any = {
                path: url
            };

            // Add authentication if provided
            if (this.config.auth) {
                if (this.config.auth.provider === 'token') {
                    clientConfig.auth = {
                        provider: 'token',
                        credentials: this.config.auth.credentials
                    };
                } else if (this.config.auth.provider === 'basic') {
                    clientConfig.auth = this.config.auth;
                }
            }

            // Add headers if provided
            if (this.config.headers) {
                clientConfig.headers = this.config.headers;
            }

            // Create client
            this.client = new ChromaApi(clientConfig);

            // Test connection by getting version
            const version = await this.client.version();
            console.log(`[CHROMA] Connected to Chroma version: ${version}`);

            this.isInitialized = true;
            console.log(`[CHROMA] ✅ Successfully connected to Chroma database`);
        } catch (error) {
            console.error(`[CHROMA] Failed to connect: ${error}`);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.isInitialized) {
            // Chroma client doesn't need explicit disconnection
            this.client = null;
            this.collection = null;
            this.isInitialized = false;
            console.log(`[CHROMA] Disconnected from database`);
        }
    }

    async createCollection(name: string, dimension: number): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[CHROMA] Creating collection "${name}" with dimension ${dimension}...`);

        try {
            // Check if collection already exists
            try {
                this.collection = await this.client.getCollection({ name });
                console.log(`[CHROMA] Collection "${name}" already exists`);
                return;
            } catch (error) {
                // Collection doesn't exist, which is expected
            }

            // Create collection with metadata
            const collectionMetadata = {
                dimension: dimension,
                metric: this.config.metric,
                created_at: new Date().toISOString()
            };

            this.collection = await this.client.createCollection({
                name,
                metadata: collectionMetadata,
                embeddingFunction: this.config.embeddingFunction
            });

            console.log(`[CHROMA] ✅ Collection "${name}" created successfully`);
        } catch (error) {
            console.error(`[CHROMA] Failed to create collection "${name}": ${error}`);
            throw error;
        }
    }

    async hasCollection(name: string): Promise<boolean> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            await this.client.getCollection({ name });
            return true;
        } catch (error) {
            return false;
        }
    }

    async dropCollection(name: string): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[CHROMA] Dropping collection "${name}"...`);

        try {
            await this.client.deleteCollection({ name });
            
            if (this.collection && this.collection.name === name) {
                this.collection = null;
            }
            
            console.log(`[CHROMA] ✅ Collection "${name}" dropped successfully`);
        } catch (error) {
            console.error(`[CHROMA] Failed to drop collection "${name}": ${error}`);
            throw error;
        }
    }

    private async ensureCollection(): Promise<void> {
        if (!this.collection) {
            try {
                this.collection = await this.client.getCollection({ 
                    name: this.config.collectionName 
                });
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

        console.log(`[CHROMA] Inserting ${documents.length} documents...`);

        try {
            // Prepare data for Chroma
            const ids = documents.map(doc => doc.id || `doc_${Date.now()}_${Math.random()}`);
            const embeddings = documents.map(doc => doc.vector);
            const metadatas = documents.map(doc => ({
                source: doc.source,
                ...(doc.metadata || {})
            }));
            const documents_text = documents.map(doc => doc.content);

            // Insert in batches to avoid memory issues
            const batchSize = 1000;
            
            for (let i = 0; i < documents.length; i += batchSize) {
                const batchEnd = Math.min(i + batchSize, documents.length);
                
                await this.collection.add({
                    ids: ids.slice(i, batchEnd),
                    embeddings: embeddings.slice(i, batchEnd),
                    metadatas: metadatas.slice(i, batchEnd),
                    documents: documents_text.slice(i, batchEnd)
                });

                console.log(`[CHROMA] Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)}`);
                
                // Small delay between batches
                if (batchEnd < documents.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            console.log(`[CHROMA] ✅ Successfully inserted ${documents.length} documents`);
        } catch (error) {
            console.error(`[CHROMA] Failed to insert documents: ${error}`);
            throw error;
        }
    }

    async search(query: number[], options: SearchOptions = {}): Promise<VectorSearchResult[]> {
        if (!this.isInitialized) {
            await this.connect();
        }

        await this.ensureCollection();

        const limit = options.limit || 10;
        
        try {
            console.log(`[CHROMA] Searching for top ${limit} similar vectors...`);
            
            const queryParams: any = {
                queryEmbeddings: [query],
                nResults: limit,
                include: ['documents', 'metadatas', 'distances']
            };

            // Add metadata filter if provided
            if (options.filter) {
                queryParams.where = this.convertFilter(options.filter);
            }

            const response = await this.collection.query(queryParams);

            const searchResults: VectorSearchResult[] = [];

            if (response.ids && response.ids[0]) {
                const ids = response.ids[0];
                const documents = response.documents?.[0] || [];
                const metadatas = response.metadatas?.[0] || [];
                const distances = response.distances?.[0] || [];

                for (let i = 0; i < ids.length; i++) {
                    const metadata = metadatas[i] || {};
                    const document: VectorDocument = {
                        id: ids[i],
                        content: documents[i] || '',
                        source: metadata.source || '',
                        relativePath: metadata.relativePath || metadata.source || '',
                        startLine: metadata.startLine || 0,
                        endLine: metadata.endLine || 0,
                        fileExtension: metadata.fileExtension || '',
                        vector: [], // Chroma doesn't return vectors by default
                        metadata: metadata
                    };

                    // Convert distance to similarity score
                    // For cosine distance: similarity = 1 - distance
                    // For L2 distance: similarity = 1 / (1 + distance)
                    const distance = distances[i] || 0;
                    let score = 0;
                    
                    if (this.config.metric === 'cosine') {
                        score = Math.max(0, 1 - distance);
                    } else if (this.config.metric === 'l2') {
                        score = 1.0 / (1.0 + distance);
                    } else if (this.config.metric === 'ip') {
                        // Inner product - higher is better (already similarity-like)
                        score = Math.max(0, distance);
                    }

                    searchResults.push({
                        document,
                        score,
                        metadata: {
                            distance: distance,
                            metric: this.config.metric
                        }
                    });
                }
            }

            console.log(`[CHROMA] Found ${searchResults.length} results`);
            return searchResults;
        } catch (error) {
            console.error(`[CHROMA] Search failed: ${error}`);
            throw error;
        }
    }

    private convertFilter(filter: Record<string, any>): any {
        // Convert generic filter to Chroma where filter format
        const chromaFilter: any = {};

        for (const [key, value] of Object.entries(filter)) {
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                chromaFilter[key] = { '$eq': value };
            } else if (Array.isArray(value)) {
                chromaFilter[key] = { '$in': value };
            } else if (typeof value === 'object' && value !== null) {
                // Handle complex filter operations like range queries
                if (value.gte !== undefined || value.gt !== undefined || 
                    value.lte !== undefined || value.lt !== undefined) {
                    chromaFilter[key] = {};
                    if (value.gte !== undefined) chromaFilter[key]['$gte'] = value.gte;
                    if (value.gt !== undefined) chromaFilter[key]['$gt'] = value.gt;
                    if (value.lte !== undefined) chromaFilter[key]['$lte'] = value.lte;
                    if (value.lt !== undefined) chromaFilter[key]['$lt'] = value.lt;
                } else {
                    chromaFilter[key] = value;
                }
            }
        }

        return chromaFilter;
    }

    async hybridSearch(request: HybridSearchRequest): Promise<HybridSearchResult> {
        if (!this.isInitialized) {
            await this.connect();
        }

        await this.ensureCollection();

        console.log(`[CHROMA] Performing hybrid search...`);

        try {
            const queryParams: any = {
                nResults: request.limit || 10,
                include: ['documents', 'metadatas', 'distances']
            };

            // Add metadata filter if provided
            if (request.filter) {
                queryParams.where = this.convertFilter(request.filter);
            }

            let searchResults: VectorSearchResult[] = [];

            if (request.query && request.query.trim()) {
                // Use text query for document search
                queryParams.queryTexts = [request.query];
                
                const textResponse = await this.collection.query(queryParams);
                
                // Also perform vector search
                queryParams.queryEmbeddings = [request.vector];
                delete queryParams.queryTexts;
                
                const vectorResponse = await this.collection.query(queryParams);
                
                // Combine and deduplicate results
                const textResults = this.processQueryResponse(textResponse, 'text');
                const vectorResults = this.processQueryResponse(vectorResponse, 'vector');
                
                // Merge results with combined scoring
                const resultMap = new Map<string, VectorSearchResult>();
                
                // Add text results
                textResults.forEach(result => {
                    resultMap.set(result.document.id!, {
                        ...result,
                        score: result.score * 0.5, // Weight text search
                        metadata: { ...result.metadata, search_type: 'text' }
                    });
                });
                
                // Add vector results and combine scores if document exists
                vectorResults.forEach(result => {
                    const existing = resultMap.get(result.document.id!);
                    if (existing) {
                        // Combine scores
                        existing.score += result.score * 0.5;
                        existing.metadata = { 
                            ...existing.metadata, 
                            search_type: 'hybrid',
                            text_score: existing.score - (result.score * 0.5),
                            vector_score: result.score
                        };
                    } else {
                        resultMap.set(result.document.id!, {
                            ...result,
                            score: result.score * 0.5, // Weight vector search
                            metadata: { ...result.metadata, search_type: 'vector' }
                        });
                    }
                });
                
                searchResults = Array.from(resultMap.values())
                    .sort((a, b) => b.score - a.score)
                    .slice(0, request.limit || 10);
                    
            } else {
                // Vector search only
                queryParams.queryEmbeddings = [request.vector];
                const response = await this.collection.query(queryParams);
                searchResults = this.processQueryResponse(response, 'vector');
            }

            console.log(`[CHROMA] Hybrid search found ${searchResults.length} results`);
            
            return {
                results: searchResults,
                metadata: {
                    searchType: request.query && request.query.trim() ? 'hybrid' : 'vector_only',
                    textWeight: 0.5,
                    vectorWeight: 0.5
                }
            };
        } catch (error) {
            console.error(`[CHROMA] Hybrid search failed: ${error}`);
            
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

    private processQueryResponse(response: any, searchType: string): VectorSearchResult[] {
        const results: VectorSearchResult[] = [];

        if (response.ids && response.ids[0]) {
            const ids = response.ids[0];
            const documents = response.documents?.[0] || [];
            const metadatas = response.metadatas?.[0] || [];
            const distances = response.distances?.[0] || [];

            for (let i = 0; i < ids.length; i++) {
                const metadata = metadatas[i] || {};
                const document: VectorDocument = {
                    id: ids[i],
                    content: documents[i] || '',
                    source: metadata.source || '',
                    relativePath: metadata.relativePath || metadata.source || '',
                    startLine: metadata.startLine || 0,
                    endLine: metadata.endLine || 0,
                    fileExtension: metadata.fileExtension || '',
                    vector: [],
                    metadata: metadata
                };

                const distance = distances[i] || 0;
                let score = 0;
                
                if (this.config.metric === 'cosine') {
                    score = Math.max(0, 1 - distance);
                } else if (this.config.metric === 'l2') {
                    score = 1.0 / (1.0 + distance);
                } else if (this.config.metric === 'ip') {
                    score = Math.max(0, distance);
                }

                results.push({
                    document,
                    score,
                    metadata: {
                        distance: distance,
                        metric: this.config.metric,
                        search_type: searchType
                    }
                });
            }
        }

        return results;
    }

    async getDocumentCount(): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        await this.ensureCollection();

        try {
            const count = await this.collection.count();
            return count;
        } catch (error) {
            console.error(`[CHROMA] Failed to get document count: ${error}`);
            return 0;
        }
    }

    async deleteDocuments(filter: Record<string, any>): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        await this.ensureCollection();

        console.log(`[CHROMA] Deleting documents with filter:`, filter);

        try {
            if (filter.id) {
                // Delete by ID(s)
                const ids = Array.isArray(filter.id) ? filter.id : [filter.id];
                
                await this.collection.delete({
                    ids: ids
                });
                
                console.log(`[CHROMA] ✅ Deleted ${ids.length} documents by ID`);
                return ids.length;
            } else {
                // Delete by metadata filter
                const whereFilter = this.convertFilter(filter);
                
                await this.collection.delete({
                    where: whereFilter
                });
                
                console.log(`[CHROMA] ✅ Documents deleted by filter`);
                // Chroma doesn't return exact count, so return 1 to indicate success
                return 1;
            }
        } catch (error) {
            console.error(`[CHROMA] Failed to delete documents: ${error}`);
            throw error;
        }
    }

    async clearCollection(): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[CHROMA] Clearing all documents from collection "${this.config.collectionName}"...`);

        try {
            // Delete the collection and recreate it
            await this.client.deleteCollection({ name: this.config.collectionName });
            
            // Recreate the collection
            this.collection = await this.client.createCollection({
                name: this.config.collectionName,
                metadata: {
                    metric: this.config.metric,
                    cleared_at: new Date().toISOString()
                },
                embeddingFunction: this.config.embeddingFunction
            });
            
            console.log(`[CHROMA] ✅ Collection cleared successfully`);
        } catch (error) {
            console.error(`[CHROMA] Failed to clear collection: ${error}`);
            throw error;
        }
    }

    // Chroma-specific utility methods
    async getCollectionInfo(): Promise<any> {
        if (!this.isInitialized) {
            await this.connect();
        }

        await this.ensureCollection();

        try {
            const [count, metadata] = await Promise.all([
                this.collection.count(),
                this.collection.metadata || {}
            ]);

            return {
                name: this.config.collectionName,
                count: count,
                metadata: metadata,
                metric: this.config.metric,
                config: this.config
            };
        } catch (error) {
            console.error(`[CHROMA] Failed to get collection info: ${error}`);
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
            console.error(`[CHROMA] Failed to list collections: ${error}`);
            return [];
        }
    }

    async peek(limit: number = 10): Promise<any> {
        if (!this.isInitialized) {
            await this.connect();
        }

        await this.ensureCollection();

        try {
            return await this.collection.peek({ limit });
        } catch (error) {
            console.error(`[CHROMA] Failed to peek collection: ${error}`);
            throw error;
        }
    }

    async updateDocuments(ids: string[], embeddings?: number[][], metadatas?: Record<string, any>[], documents?: string[]): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        await this.ensureCollection();

        console.log(`[CHROMA] Updating ${ids.length} documents...`);

        try {
            const updateParams: any = { ids };
            
            if (embeddings) updateParams.embeddings = embeddings;
            if (metadatas) updateParams.metadatas = metadatas;
            if (documents) updateParams.documents = documents;

            await this.collection.update(updateParams);
            
            console.log(`[CHROMA] ✅ Successfully updated ${ids.length} documents`);
        } catch (error) {
            console.error(`[CHROMA] Failed to update documents: ${error}`);
            throw error;
        }
    }
}