import { VectorDatabase, VectorDocument, VectorSearchResult, SearchOptions, HybridSearchResult, HybridSearchRequest } from './types';

// Weaviate client - install with: npm install weaviate-ts-client
let weaviate: any = null;
try {
    weaviate = require('weaviate-ts-client');
} catch (error) {
    console.warn('[WEAVIATE] weaviate-ts-client not available. Please install it with: npm install weaviate-ts-client');
}

export interface WeaviateConfig {
    // Connection configuration
    scheme: 'http' | 'https';
    host: string;
    port?: number;
    // Authentication
    apiKey?: string;
    username?: string;
    password?: string;
    // OIDC authentication
    oidcToken?: string;
    // Headers
    headers?: Record<string, string>;
    // Class configuration
    className: string;
    // Vector configuration
    vectorizer?: 'none' | 'text2vec-openai' | 'text2vec-cohere' | 'text2vec-huggingface' | 'text2vec-transformers';
    // Vectorizer model (when using specific vectorizers)
    vectorizerModel?: string; // e.g., 'text-embedding-3-small' for OpenAI, 'embed-multilingual-v3.0' for Cohere
    // Distance metric
    distanceMetric?: 'cosine' | 'dot' | 'l2-squared' | 'manhattan' | 'hamming';
    // Additional properties to index
    properties?: Array<{
        name: string;
        dataType: string[];
        description?: string;
        tokenization?: 'word' | 'lowercase' | 'whitespace' | 'field';
    }>;
    // Performance settings
    timeout?: number;
    retries?: number;
}

export class WeaviateVectorDatabase implements VectorDatabase {
    private config: WeaviateConfig;
    private client: any = null;
    private isInitialized: boolean = false;

    constructor(config: WeaviateConfig) {
        if (!weaviate) {
            throw new Error('weaviate-ts-client is not available. Please install it with: npm install weaviate-ts-client');
        }

        this.config = {
            port: 8080,
            vectorizer: 'none', // No automatic vectorization, we provide vectors
            distanceMetric: 'cosine',
            timeout: 60000,
            retries: 3,
            properties: [
                {
                    name: 'content',
                    dataType: ['text'],
                    description: 'The content of the document'
                },
                {
                    name: 'source',
                    dataType: ['text'],
                    description: 'The source of the document'
                },
                {
                    name: 'metadata',
                    dataType: ['object'],
                    description: 'Additional metadata'
                }
            ],
            ...config
        };

        if (!this.config.host) {
            throw new Error('Weaviate host is required');
        }

        if (!this.config.className) {
            throw new Error('Weaviate class name is required');
        }
    }

    async connect(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        console.log(`[WEAVIATE] Connecting to Weaviate at ${this.config.scheme}://${this.config.host}:${this.config.port}...`);
        
        try {
            // Create Weaviate client
            const clientConfig: any = {
                scheme: this.config.scheme,
                host: `${this.config.host}:${this.config.port}`,
                headers: this.config.headers || {}
            };

            // Add authentication
            if (this.config.apiKey) {
                clientConfig.authClientSecret = new weaviate.AuthApiKey(this.config.apiKey);
            } else if (this.config.username && this.config.password) {
                clientConfig.authClientSecret = new weaviate.AuthUserPasswordCredentials({
                    username: this.config.username,
                    password: this.config.password
                });
            } else if (this.config.oidcToken) {
                clientConfig.authClientSecret = new weaviate.AuthBearerToken(this.config.oidcToken);
            }

            this.client = weaviate.client(clientConfig);

            // Test connection
            const isReady = await this.client.misc.readyChecker().do();
            if (!isReady) {
                throw new Error('Weaviate is not ready');
            }

            // Get cluster info
            const clusterInfo = await this.client.cluster.nodesStatusGetter().do();
            console.log(`[WEAVIATE] Connected to cluster with ${clusterInfo.nodes?.length || 1} nodes`);

            this.isInitialized = true;
            console.log(`[WEAVIATE] ✅ Successfully connected to Weaviate`);
        } catch (error) {
            console.error(`[WEAVIATE] Failed to connect: ${error}`);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.isInitialized) {
            // Weaviate client doesn't need explicit disconnection
            this.client = null;
            this.isInitialized = false;
            console.log(`[WEAVIATE] Disconnected from database`);
        }
    }

    async createCollection(name: string, dimension: number): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        const className = name;
        console.log(`[WEAVIATE] Creating class "${className}" with vector dimension ${dimension}...`);

        try {
            // Check if class already exists
            const existingClass = await this.client.schema.classGetter().withClassName(className).do();
            if (existingClass) {
                console.log(`[WEAVIATE] Class "${className}" already exists`);
                return;
            }
        } catch (error) {
            // Class doesn't exist, which is expected
        }

        try {
            // Define class schema
            const classSchema = {
                class: className,
                description: `Vector storage class for ${className}`,
                vectorizer: this.config.vectorizer,
                vectorIndexType: 'hnsw',
                vectorIndexConfig: {
                    distance: this.config.distanceMetric,
                    efConstruction: 128,
                    maxConnections: 64
                },
                properties: this.config.properties
            };

            // Create the class
            await this.client.schema.classCreator().withClass(classSchema).do();
            
            console.log(`[WEAVIATE] ✅ Class "${className}" created successfully`);
        } catch (error) {
            console.error(`[WEAVIATE] Failed to create class "${className}": ${error}`);
            throw error;
        }
    }

    async hasCollection(name: string): Promise<boolean> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const existingClass = await this.client.schema.classGetter().withClassName(name).do();
            return existingClass !== null;
        } catch (error) {
            return false;
        }
    }

    async dropCollection(name: string): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[WEAVIATE] Dropping class "${name}"...`);

        try {
            await this.client.schema.classDeleter().withClassName(name).do();
            console.log(`[WEAVIATE] ✅ Class "${name}" dropped successfully`);
        } catch (error) {
            console.error(`[WEAVIATE] Failed to drop class "${name}": ${error}`);
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

        console.log(`[WEAVIATE] Inserting ${documents.length} documents...`);

        try {
            // Batch insert for better performance
            const batchSize = 100;
            
            for (let i = 0; i < documents.length; i += batchSize) {
                const batch = documents.slice(i, i + batchSize);
                const batcher = this.client.batch.objectsBatcher();
                
                for (const doc of batch) {
                    const weaviateObject = {
                        class: this.config.className,
                        id: doc.id || undefined, // Let Weaviate generate UUID if not provided
                        properties: {
                            content: doc.content,
                            source: doc.source,
                            metadata: doc.metadata || {}
                        },
                        vector: doc.vector
                    };
                    
                    batcher.withObject(weaviateObject);
                }

                const result = await batcher.do();
                
                // Check for errors in batch result
                if (result && result.length > 0) {
                    const errors = result.filter((item: any) => item.result?.errors);
                    if (errors.length > 0) {
                        console.warn(`[WEAVIATE] Batch insert had ${errors.length} errors:`, errors[0].result.errors);
                    }
                }

                console.log(`[WEAVIATE] Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)}`);
                
                // Small delay between batches to avoid overwhelming the server
                if (i + batchSize < documents.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            console.log(`[WEAVIATE] ✅ Successfully inserted ${documents.length} documents`);
        } catch (error) {
            console.error(`[WEAVIATE] Failed to insert documents: ${error}`);
            throw error;
        }
    }

    async search(query: number[], options: SearchOptions = {}): Promise<VectorSearchResult[]> {
        if (!this.isInitialized) {
            await this.connect();
        }

        const limit = options.limit || 10;
        
        try {
            console.log(`[WEAVIATE] Searching for top ${limit} similar vectors...`);
            
            let queryBuilder = this.client.graphql.get()
                .withClassName(this.config.className)
                .withFields('content source metadata _additional { id distance }')
                .withNearVector({ vector: query })
                .withLimit(limit);

            // Add where filter if provided
            if (options.filter) {
                const whereFilter = this.convertFilter(options.filter);
                if (whereFilter) {
                    queryBuilder = queryBuilder.withWhere(whereFilter);
                }
            }

            const response = await queryBuilder.do();

            const searchResults: VectorSearchResult[] = [];

            if (response.data?.Get?.[this.config.className]) {
                const objects = response.data.Get[this.config.className];
                
                for (const obj of objects) {
                    const document: VectorDocument = {
                        id: obj._additional?.id || '',
                        content: obj.content || '',
                        source: obj.source || '',
                        relativePath: obj.relativePath || obj.source || '',
                        startLine: obj.startLine || 0,
                        endLine: obj.endLine || 0,
                        fileExtension: obj.fileExtension || '',
                        vector: [], // Weaviate doesn't return vectors by default
                        metadata: obj.metadata || {}
                    };

                    // Convert distance to similarity score
                    const distance = obj._additional?.distance || 0;
                    const score = Math.max(0, 1.0 - distance);

                    searchResults.push({
                        document,
                        score,
                        metadata: {
                            distance: distance,
                            weaviate_id: obj._additional?.id
                        }
                    });
                }
            }

            console.log(`[WEAVIATE] Found ${searchResults.length} results`);
            return searchResults;
        } catch (error) {
            console.error(`[WEAVIATE] Search failed: ${error}`);
            throw error;
        }
    }

    private convertFilter(filter: Record<string, any>): any {
        // Convert generic filter to Weaviate where filter format
        const conditions = [];

        for (const [key, value] of Object.entries(filter)) {
            if (typeof value === 'string') {
                conditions.push({
                    path: [key],
                    operator: 'Equal',
                    valueText: value
                });
            } else if (typeof value === 'number') {
                conditions.push({
                    path: [key],
                    operator: 'Equal',
                    valueNumber: value
                });
            } else if (typeof value === 'boolean') {
                conditions.push({
                    path: [key],
                    operator: 'Equal',
                    valueBoolean: value
                });
            } else if (Array.isArray(value)) {
                // Handle array values - create OR condition
                const orConditions = value.map(v => ({
                    path: [key],
                    operator: 'Equal',
                    valueText: String(v)
                }));
                
                if (orConditions.length > 1) {
                    conditions.push({
                        operator: 'Or',
                        operands: orConditions
                    });
                } else if (orConditions.length === 1) {
                    conditions.push(orConditions[0]);
                }
            }
        }

        if (conditions.length === 0) {
            return null;
        } else if (conditions.length === 1) {
            return conditions[0];
        } else {
            return {
                operator: 'And',
                operands: conditions
            };
        }
    }

    async hybridSearch(request: HybridSearchRequest): Promise<HybridSearchResult> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[WEAVIATE] Performing hybrid search with vector and text query...`);

        try {
            let queryBuilder = this.client.graphql.get()
                .withClassName(this.config.className)
                .withFields('content source metadata _additional { id score }')
                .withLimit(request.limit || 10);

            // Use hybrid search if text query is provided
            if (request.query && request.query.trim()) {
                queryBuilder = queryBuilder.withHybrid({
                    query: request.query,
                    vector: request.vector,
                    alpha: 0.5 // Balance between vector and text search (0=text only, 1=vector only)
                });
            } else {
                // Fall back to vector-only search
                queryBuilder = queryBuilder.withNearVector({ vector: request.vector });
            }

            // Add where filter if provided
            if (request.filter) {
                const whereFilter = this.convertFilter(request.filter);
                if (whereFilter) {
                    queryBuilder = queryBuilder.withWhere(whereFilter);
                }
            }

            const response = await queryBuilder.do();

            const searchResults: VectorSearchResult[] = [];

            if (response.data?.Get?.[this.config.className]) {
                const objects = response.data.Get[this.config.className];
                
                for (const obj of objects) {
                    const document: VectorDocument = {
                        id: obj._additional?.id || '',
                        content: obj.content || '',
                        source: obj.source || '',
                        relativePath: obj.relativePath || obj.source || '',
                        startLine: obj.startLine || 0,
                        endLine: obj.endLine || 0,
                        fileExtension: obj.fileExtension || '',
                        vector: [],
                        metadata: obj.metadata || {}
                    };

                    searchResults.push({
                        document,
                        score: obj._additional?.score || 0,
                        metadata: {
                            weaviate_id: obj._additional?.id,
                            hybrid_score: obj._additional?.score
                        }
                    });
                }
            }

            console.log(`[WEAVIATE] Hybrid search found ${searchResults.length} results`);
            
            return {
                results: searchResults,
                metadata: {
                    searchType: request.query && request.query.trim() ? 'hybrid' : 'vector_only',
                    alpha: 0.5
                }
            };
        } catch (error) {
            console.error(`[WEAVIATE] Hybrid search failed: ${error}`);
            
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

    async getDocumentCount(): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const response = await this.client.graphql.aggregate()
                .withClassName(this.config.className)
                .withFields('meta { count }')
                .do();

            return response.data?.Aggregate?.[this.config.className]?.[0]?.meta?.count || 0;
        } catch (error) {
            console.error(`[WEAVIATE] Failed to get document count: ${error}`);
            return 0;
        }
    }

    async deleteDocuments(filter: Record<string, any>): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[WEAVIATE] Deleting documents with filter:`, filter);

        try {
            if (filter.id) {
                // Delete by ID
                const ids = Array.isArray(filter.id) ? filter.id : [filter.id];
                
                for (const id of ids) {
                    await this.client.data.deleter().withClassName(this.config.className).withId(id).do();
                }
                
                console.log(`[WEAVIATE] ✅ Deleted ${ids.length} documents by ID`);
                return ids.length;
            } else {
                // Delete by where filter
                const whereFilter = this.convertFilter(filter);
                if (whereFilter) {
                    const result = await this.client.batch.objectsBatchDeleter()
                        .withClassName(this.config.className)
                        .withWhere(whereFilter)
                        .do();

                    const deletedCount = result.results?.successful || 0;
                    console.log(`[WEAVIATE] ✅ Deleted ${deletedCount} documents by filter`);
                    return deletedCount;
                } else {
                    console.warn(`[WEAVIATE] No valid filter provided for deletion`);
                    return 0;
                }
            }
        } catch (error) {
            console.error(`[WEAVIATE] Failed to delete documents: ${error}`);
            throw error;
        }
    }

    async clearCollection(): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[WEAVIATE] Clearing all objects from class "${this.config.className}"...`);

        try {
            // Delete all objects in the class
            const result = await this.client.batch.objectsBatchDeleter()
                .withClassName(this.config.className)
                .withWhere({
                    operator: 'Like',
                    path: ['id'],
                    valueText: '*'
                })
                .do();

            console.log(`[WEAVIATE] ✅ Cleared collection. Deleted ${result.results?.successful || 0} objects`);
        } catch (error) {
            console.error(`[WEAVIATE] Failed to clear collection: ${error}`);
            throw error;
        }
    }

    // Weaviate-specific utility methods
    async getClassSchema(): Promise<any> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            return await this.client.schema.classGetter().withClassName(this.config.className).do();
        } catch (error) {
            console.error(`[WEAVIATE] Failed to get class schema: ${error}`);
            throw error;
        }
    }

    async getClusterInfo(): Promise<any> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const [nodesStatus, meta] = await Promise.all([
                this.client.cluster.nodesStatusGetter().do(),
                this.client.misc.metaGetter().do()
            ]);

            return {
                nodes: nodesStatus.nodes,
                version: meta.version,
                modules: meta.modules,
                hostname: meta.hostname
            };
        } catch (error) {
            console.error(`[WEAVIATE] Failed to get cluster info: ${error}`);
            throw error;
        }
    }

    async backupClass(backupId: string): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[WEAVIATE] Creating backup "${backupId}" for class "${this.config.className}"...`);

        try {
            await this.client.backup.creator()
                .withBackend('filesystem')
                .withBackupId(backupId)
                .withIncludeClassNames([this.config.className])
                .do();

            console.log(`[WEAVIATE] ✅ Backup "${backupId}" created successfully`);
        } catch (error) {
            console.error(`[WEAVIATE] Failed to create backup: ${error}`);
            throw error;
        }
    }

    async restoreClass(backupId: string): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[WEAVIATE] Restoring backup "${backupId}" for class "${this.config.className}"...`);

        try {
            await this.client.backup.restorer()
                .withBackend('filesystem')
                .withBackupId(backupId)
                .withIncludeClassNames([this.config.className])
                .do();

            console.log(`[WEAVIATE] ✅ Backup "${backupId}" restored successfully`);
        } catch (error) {
            console.error(`[WEAVIATE] Failed to restore backup: ${error}`);
            throw error;
        }
    }
}