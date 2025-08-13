import { VectorDatabase, VectorDocument, VectorSearchResult, SearchOptions, HybridSearchResult, HybridSearchRequest } from './types';

// Upstash Vector client - install with: npm install @upstash/vector
let Vector: any = null;
let Index: any = null;
try {
    const upstash = require('@upstash/vector');
    Vector = upstash.Vector;
    Index = upstash.Index;
} catch (error) {
    console.warn('[UPSTASH] @upstash/vector not available. Please install it with: npm install @upstash/vector');
}

export interface UpstashVectorConfig {
    // Upstash Vector credentials
    url: string;
    token: string;
    // Index configuration
    dimension: number;
    metric?: 'COSINE' | 'EUCLIDEAN' | 'DOT_PRODUCT';
    // Namespace configuration (optional)
    namespace?: string;
    // Performance settings
    timeout?: number;
    retries?: number;
    // Batch settings
    batchSize?: number;
}

export class UpstashVectorDatabase implements VectorDatabase {
    private config: UpstashVectorConfig;
    private index: any = null;
    private isInitialized: boolean = false;

    constructor(config: UpstashVectorConfig) {
        if (!Vector || !Index) {
            throw new Error('@upstash/vector is not available. Please install it with: npm install @upstash/vector');
        }

        this.config = {
            metric: 'COSINE',
            timeout: 60000,
            retries: 3,
            batchSize: 1000,
            ...config
        };

        if (!this.config.url || !this.config.token) {
            throw new Error('Upstash Vector URL and token are required');
        }

        if (!this.config.dimension) {
            throw new Error('Vector dimension is required');
        }
    }

    async connect(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        console.log(`[UPSTASH] Connecting to Upstash Vector at ${this.config.url}...`);
        
        try {
            // Create Upstash Vector index
            this.index = new Index({
                url: this.config.url,
                token: this.config.token,
                cache: false // Disable caching for fresh data
            });

            // Test connection by getting index info
            const info = await this.index.info();
            console.log(`[UPSTASH] Index info:`, {
                vectorCount: info.vectorCount,
                dimension: info.dimension,
                similarityFunction: info.similarityFunction
            });

            // Verify dimension matches
            if (info.dimension && info.dimension !== this.config.dimension) {
                console.warn(`[UPSTASH] Warning: Index dimension (${info.dimension}) does not match config dimension (${this.config.dimension})`);
            }

            this.isInitialized = true;
            console.log(`[UPSTASH] ✅ Successfully connected to Upstash Vector index`);
        } catch (error) {
            console.error(`[UPSTASH] Failed to connect: ${error}`);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.isInitialized) {
            // Upstash Vector client doesn't need explicit disconnection
            this.index = null;
            this.isInitialized = false;
            console.log(`[UPSTASH] Disconnected from database`);
        }
    }

    async createCollection(name: string, dimension: number): Promise<void> {
        // Upstash Vector doesn't have collections concept like other databases
        // Each Upstash Vector database is essentially a single index
        // We can simulate collections using namespaces or prefixed IDs
        
        console.log(`[UPSTASH] Note: Upstash Vector uses a single index. Collection "${name}" will be simulated using ID prefixes.`);
        
        if (dimension !== this.config.dimension) {
            throw new Error(`Dimension mismatch: index dimension is ${this.config.dimension}, requested ${dimension}`);
        }

        // Set the namespace if provided
        if (name !== 'default') {
            this.config.namespace = name;
        }

        console.log(`[UPSTASH] ✅ Collection context "${name}" configured`);
    }

    async hasCollection(name: string): Promise<boolean> {
        // Since we simulate collections with namespaces/prefixes, always return true
        // In a real implementation, you might check for vectors with the prefix
        return true;
    }

    async dropCollection(name: string): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[UPSTASH] Dropping collection "${name}" (deleting vectors with prefix)...`);

        try {
            // Since Upstash Vector doesn't have collections, we need to delete vectors by prefix
            // This is a simulated collection deletion
            
            // Query all vectors with the collection prefix to get their IDs
            const queryResults = await this.index.query({
                vector: new Array(this.config.dimension).fill(0), // Dummy vector
                topK: 10000, // Get many results to find all vectors in collection
                includeVectors: false,
                includeMetadata: true
            });

            const vectorsToDelete = queryResults.filter((result: any) => 
                result.id.startsWith(`${name}_`) || 
                (result.metadata && result.metadata.collection === name)
            );

            if (vectorsToDelete.length > 0) {
                const ids = vectorsToDelete.map((v: any) => v.id);
                await this.index.delete(ids);
                console.log(`[UPSTASH] Deleted ${ids.length} vectors from collection "${name}"`);
            }

            console.log(`[UPSTASH] ✅ Collection "${name}" dropped successfully`);
        } catch (error) {
            console.error(`[UPSTASH] Failed to drop collection "${name}": ${error}`);
            throw error;
        }
    }

    private generateId(doc: VectorDocument, index: number): string {
        if (doc.id) {
            return this.config.namespace ? `${this.config.namespace}_${doc.id}` : doc.id;
        }
        const timestamp = Date.now();
        const baseId = `doc_${timestamp}_${index}`;
        return this.config.namespace ? `${this.config.namespace}_${baseId}` : baseId;
    }

    async insertDocuments(documents: VectorDocument[]): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        if (documents.length === 0) {
            return;
        }

        console.log(`[UPSTASH] Inserting ${documents.length} documents...`);

        try {
            // Prepare vectors for Upstash format
            const vectors = documents.map((doc, index) => ({
                id: this.generateId(doc, index),
                vector: doc.vector,
                metadata: {
                    content: doc.content,
                    source: doc.source,
                    collection: this.config.namespace,
                    ...doc.metadata
                }
            }));

            // Insert in batches
            const batchSize = this.config.batchSize || 1000;
            
            for (let i = 0; i < vectors.length; i += batchSize) {
                const batch = vectors.slice(i, i + batchSize);
                
                // Use upsert to handle both insert and update cases
                await this.index.upsert(batch);
                
                console.log(`[UPSTASH] Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(vectors.length / batchSize)}`);
                
                // Small delay between batches to avoid rate limits
                if (i + batchSize < vectors.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            console.log(`[UPSTASH] ✅ Successfully inserted ${documents.length} documents`);
        } catch (error) {
            console.error(`[UPSTASH] Failed to insert documents: ${error}`);
            throw error;
        }
    }

    async search(query: number[], options: SearchOptions = {}): Promise<VectorSearchResult[]> {
        if (!this.isInitialized) {
            await this.connect();
        }

        const limit = options.limit || 10;
        
        try {
            console.log(`[UPSTASH] Searching for top ${limit} similar vectors...`);
            
            const queryParams: any = {
                vector: query,
                topK: limit,
                includeVectors: false,
                includeMetadata: true
            };

            // Add metadata filter if provided
            if (options.filter) {
                queryParams.filter = this.convertFilter(options.filter);
            }

            const response = await this.index.query(queryParams);

            const searchResults: VectorSearchResult[] = [];

            if (response && Array.isArray(response)) {
                for (const match of response) {
                    // Filter by namespace/collection if specified
                    if (this.config.namespace && 
                        match.metadata?.collection !== this.config.namespace) {
                        continue;
                    }

                    const document: VectorDocument = {
                        id: match.id.replace(`${this.config.namespace}_`, ''), // Remove namespace prefix
                        content: match.metadata?.content || '',
                        source: match.metadata?.source || '',
                        relativePath: match.metadata?.relativePath || match.metadata?.source || '',
                        startLine: match.metadata?.startLine || 0,
                        endLine: match.metadata?.endLine || 0,
                        fileExtension: match.metadata?.fileExtension || '',
                        vector: match.vector || [],
                        metadata: {
                            ...match.metadata,
                            collection: undefined // Remove internal collection metadata
                        }
                    };

                    searchResults.push({
                        document,
                        score: match.score || 0,
                        metadata: {
                            upstash_id: match.id,
                            namespace: this.config.namespace
                        }
                    });
                }
            }

            console.log(`[UPSTASH] Found ${searchResults.length} results`);
            return searchResults;
        } catch (error) {
            console.error(`[UPSTASH] Search failed: ${error}`);
            throw error;
        }
    }

    private convertFilter(filter: Record<string, any>): string {
        // Upstash Vector uses simple string-based filters
        // Format: "metadata.field = 'value'" or "metadata.field in ['value1', 'value2']"
        const conditions: string[] = [];

        for (const [key, value] of Object.entries(filter)) {
            if (key === 'collection') {
                // Skip collection filter as it's handled separately
                continue;
            }

            if (typeof value === 'string') {
                conditions.push(`metadata.${key} = '${value}'`);
            } else if (typeof value === 'number') {
                conditions.push(`metadata.${key} = ${value}`);
            } else if (typeof value === 'boolean') {
                conditions.push(`metadata.${key} = ${value}`);
            } else if (Array.isArray(value)) {
                const valueList = value.map(v => typeof v === 'string' ? `'${v}'` : v).join(', ');
                conditions.push(`metadata.${key} in [${valueList}]`);
            } else if (typeof value === 'object' && value !== null) {
                // Handle range queries
                if (value.gte !== undefined) {
                    conditions.push(`metadata.${key} >= ${value.gte}`);
                }
                if (value.gt !== undefined) {
                    conditions.push(`metadata.${key} > ${value.gt}`);
                }
                if (value.lte !== undefined) {
                    conditions.push(`metadata.${key} <= ${value.lte}`);
                }
                if (value.lt !== undefined) {
                    conditions.push(`metadata.${key} < ${value.lt}`);
                }
            }
        }

        return conditions.join(' AND ');
    }

    async hybridSearch(request: HybridSearchRequest): Promise<HybridSearchResult> {
        console.warn(`[UPSTASH] Upstash Vector does not support text-based hybrid search. Performing vector search with metadata filtering.`);
        
        const vectorResults = await this.search(request.vector, {
            limit: request.limit,
            filter: request.filter
        });

        return {
            results: vectorResults,
            metadata: {
                searchType: 'vector_only',
                message: 'Upstash Vector performed vector search with metadata filtering. Text search is not supported.'
            }
        };
    }

    async getDocumentCount(): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const info = await this.index.info();
            return info.vectorCount || 0;
        } catch (error) {
            console.error(`[UPSTASH] Failed to get document count: ${error}`);
            return 0;
        }
    }

    async deleteDocuments(filter: Record<string, any>): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[UPSTASH] Deleting documents with filter:`, filter);

        try {
            if (filter.id) {
                // Delete by ID(s)
                let ids = Array.isArray(filter.id) ? filter.id : [filter.id];
                
                // Add namespace prefix if needed
                if (this.config.namespace) {
                    ids = ids.map(id => id.startsWith(`${this.config.namespace}_`) ? id : `${this.config.namespace}_${id}`);
                }
                
                await this.index.delete(ids);
                console.log(`[UPSTASH] ✅ Deleted ${ids.length} documents by ID`);
                return ids.length;
            } else {
                // Delete by metadata filter - requires querying first
                const queryResults = await this.index.query({
                    vector: new Array(this.config.dimension).fill(0), // Dummy vector
                    topK: 10000, // Get many results
                    includeVectors: false,
                    includeMetadata: true,
                    ...(this.convertFilter(filter) && { filter: this.convertFilter(filter) })
                });

                if (queryResults && queryResults.length > 0) {
                    const ids = queryResults.map((result: any) => result.id);
                    await this.index.delete(ids);
                    console.log(`[UPSTASH] ✅ Deleted ${ids.length} documents by filter`);
                    return ids.length;
                } else {
                    console.log(`[UPSTASH] No documents found matching filter`);
                    return 0;
                }
            }
        } catch (error) {
            console.error(`[UPSTASH] Failed to delete documents: ${error}`);
            throw error;
        }
    }

    async clearCollection(): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[UPSTASH] Clearing all vectors from index...`);

        try {
            // Reset the entire index (this will delete all vectors)
            await this.index.reset();
            console.log(`[UPSTASH] ✅ Collection cleared successfully`);
        } catch (error) {
            console.error(`[UPSTASH] Failed to clear collection: ${error}`);
            throw error;
        }
    }

    // Upstash Vector specific utility methods
    async getIndexInfo(): Promise<any> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const info = await this.index.info();
            return {
                vectorCount: info.vectorCount,
                dimension: info.dimension,
                similarityFunction: info.similarityFunction,
                namespace: this.config.namespace,
                config: this.config
            };
        } catch (error) {
            console.error(`[UPSTASH] Failed to get index info: ${error}`);
            throw error;
        }
    }

    async getStats(): Promise<any> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const info = await this.index.info();
            
            return {
                totalVectors: info.vectorCount,
                dimension: info.dimension,
                metric: info.similarityFunction,
                namespace: this.config.namespace,
                indexSize: info.vectorCount * info.dimension * 4, // Rough estimate (4 bytes per float)
            };
        } catch (error) {
            console.error(`[UPSTASH] Failed to get stats: ${error}`);
            throw error;
        }
    }

    async fetchVectorById(id: string): Promise<VectorDocument | null> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            // Add namespace prefix if needed
            const fullId = this.config.namespace && !id.startsWith(`${this.config.namespace}_`) 
                ? `${this.config.namespace}_${id}` 
                : id;

            const response = await this.index.fetch([fullId]);

            if (response && response.length > 0) {
                const vector = response[0];
                return {
                    id: vector.id.replace(`${this.config.namespace}_`, ''), // Remove namespace prefix
                    content: vector.metadata?.content || '',
                    source: vector.metadata?.source || '',
                    relativePath: vector.metadata?.relativePath || vector.metadata?.source || '',
                    startLine: vector.metadata?.startLine || 0,
                    endLine: vector.metadata?.endLine || 0,
                    fileExtension: vector.metadata?.fileExtension || '',
                    vector: vector.vector || [],
                    metadata: {
                        ...vector.metadata,
                        collection: undefined // Remove internal collection metadata
                    }
                };
            }

            return null;
        } catch (error) {
            console.error(`[UPSTASH] Failed to fetch vector by ID "${id}": ${error}`);
            return null;
        }
    }

    async listVectors(limit: number = 100, cursor?: string): Promise<{vectors: any[], nextCursor?: string}> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            // Use query with a dummy vector to list vectors
            const queryParams: any = {
                vector: new Array(this.config.dimension).fill(0),
                topK: limit,
                includeVectors: true,
                includeMetadata: true
            };

            if (cursor) {
                queryParams.cursor = cursor;
            }

            const response = await this.index.query(queryParams);

            return {
                vectors: response || [],
                nextCursor: undefined // Upstash Vector doesn't provide cursor pagination in query
            };
        } catch (error) {
            console.error(`[UPSTASH] Failed to list vectors: ${error}`);
            return { vectors: [] };
        }
    }
}