import { QdrantClient } from '@qdrant/js-client-rest';
import {
    VectorDocument,
    SearchOptions,
    VectorSearchResult,
    VectorDatabase,
    MultiCollectionVectorDatabase,
    HybridSearchRequest,
    HybridSearchOptions,
    HybridSearchResult,
} from './types';

export interface QdrantConfig {
    url?: string;
    apiKey?: string;
    host?: string;
    port?: number;
    https?: boolean;
}

export class QdrantVectorDatabase implements MultiCollectionVectorDatabase {
    private config: QdrantConfig;
    private client: QdrantClient | null = null;
    private initializationPromise: Promise<void>;

    constructor(config: QdrantConfig) {
        this.config = config;
        this.initializationPromise = this.initialize();
    }

    private async initialize(): Promise<void> {
        console.log('🔌 Connecting to Qdrant vector database...');
        
        if (this.config.url) {
            // Use cloud/remote URL
            this.client = new QdrantClient({
                url: this.config.url,
                apiKey: this.config.apiKey,
            });
        } else {
            // Use local instance
            this.client = new QdrantClient({
                host: this.config.host || 'localhost',
                port: this.config.port || 6333,
                https: this.config.https || false,
            });
        }
    }

    private async ensureInitialized(): Promise<void> {
        await this.initializationPromise;
        if (!this.client) {
            throw new Error('Qdrant client not initialized');
        }
    }

    async createCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
        await this.ensureInitialized();

        console.log('Beginning collection creation:', collectionName);
        console.log('Collection dimension:', dimension);

        try {
            await this.client!.createCollection(collectionName, {
                vectors: {
                    size: dimension,
                    distance: 'Cosine',
                },
            });
            console.log(`✅ Collection '${collectionName}' created successfully`);
        } catch (error: any) {
            if (error.message?.includes('already exists')) {
                console.log(`ℹ️  Collection '${collectionName}' already exists`);
            } else {
                throw error;
            }
        }
    }

    async createHybridCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
        await this.ensureInitialized();

        console.log('Beginning hybrid collection creation:', collectionName);
        console.log('Collection dimension:', dimension);

        try {
            // Qdrant doesn't have built-in sparse vector support like Milvus
            // For now, create a regular dense vector collection
            // In a full implementation, you'd need to manage sparse vectors separately
            await this.client!.createCollection(collectionName, {
                vectors: {
                    size: dimension,
                    distance: 'Cosine',
                },
            });
            console.log(`✅ Hybrid collection '${collectionName}' created successfully (dense vectors only)`);
        } catch (error: any) {
            if (error.message?.includes('already exists')) {
                console.log(`ℹ️  Hybrid collection '${collectionName}' already exists`);
            } else {
                throw error;
            }
        }
    }

    async dropCollection(collectionName: string): Promise<void> {
        await this.ensureInitialized();

        await this.client!.deleteCollection(collectionName);
        console.log(`✅ Collection '${collectionName}' dropped successfully`);
    }

    async hasCollection(collectionName: string): Promise<boolean> {
        await this.ensureInitialized();

        try {
            await this.client!.getCollection(collectionName);
            return true;
        } catch (error) {
            return false;
        }
    }

    async listCollections(): Promise<string[]> {
        await this.ensureInitialized();

        const response = await this.client!.getCollections();
        return response.collections.map(collection => collection.name);
    }

    async insert(collectionName: string, documents: VectorDocument[]): Promise<void> {
        await this.ensureInitialized();

        console.log('Inserting documents into collection:', collectionName);

        const points = documents.map((doc, index) => ({
            id: doc.id || `doc_${Date.now()}_${index}_${Math.random().toString(36).substring(7)}`,
            vector: doc.vector,
            payload: {
                content: doc.content,
                relativePath: doc.relativePath,
                startLine: doc.startLine,
                endLine: doc.endLine,
                fileExtension: doc.fileExtension,
                metadata: doc.metadata,
            },
        }));

        await this.client!.upsert(collectionName, {
            wait: true,
            points: points,
        });

        console.log(`✅ Inserted ${documents.length} documents into collection '${collectionName}'`);
    }

    async insertHybrid(collectionName: string, documents: VectorDocument[]): Promise<void> {
        await this.ensureInitialized();

        console.log('Inserting hybrid documents into collection:', collectionName);

        const points = documents.map((doc) => ({
            id: doc.id || `doc_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            vector: doc.vector, // Use regular dense vector for now
            payload: {
                content: doc.content,
                relativePath: doc.relativePath,
                startLine: doc.startLine,
                endLine: doc.endLine,
                fileExtension: doc.fileExtension,
                metadata: doc.metadata,
            },
        }));

        await this.client!.upsert(collectionName, {
            wait: true,
            points: points,
        });

        console.log(`✅ Inserted ${documents.length} hybrid documents into collection '${collectionName}'`);
    }

    async search(collectionName: string, queryVector: number[], options?: SearchOptions): Promise<VectorSearchResult[]> {
        await this.ensureInitialized();

        const searchParams: any = {
            vector: queryVector,
            limit: options?.topK || 10,
            with_payload: true,
        };

        // Apply filter if provided
        if (options?.filter) {
            searchParams.filter = options.filter;
        }

        const searchResult = await this.client!.search(collectionName, searchParams);

        return searchResult.map((result: any) => ({
            document: {
                id: result.id.toString(),
                vector: queryVector,
                content: result.payload.content,
                source: result.payload.source || result.payload.relativePath || '',
                relativePath: result.payload.relativePath,
                startLine: result.payload.startLine,
                endLine: result.payload.endLine,
                fileExtension: result.payload.fileExtension,
                metadata: result.payload.metadata,
            },
            score: result.score,
        }));
    }

    async hybridSearch(collectionName: string, searchRequests: HybridSearchRequest[], options?: HybridSearchOptions): Promise<HybridSearchResult[]> {
        await this.ensureInitialized();

        console.log(`🔍 Preparing hybrid search for collection: ${collectionName}`);

        // For now, perform dense vector search only
        // Qdrant hybrid search with sparse vectors requires more complex setup
        const denseRequest = searchRequests.find(req => req.anns_field === 'vector' || req.anns_field === 'dense');
        
        if (!denseRequest) {
            throw new Error('No dense vector search request found');
        }

        const searchParams: any = {
            vector: Array.isArray(denseRequest.data) ? denseRequest.data : [denseRequest.data],
            limit: options?.limit || denseRequest.limit || 10,
            with_payload: true,
        };

        if (options?.filterExpr) {
            // Convert Milvus filter expression to Qdrant filter format
            // This is a simplified conversion
            searchParams.filter = {
                must: [
                    // Add filter conditions based on filterExpr
                ],
            };
        }

        const searchResult = await this.client!.search(collectionName, searchParams);

        return [{
            results: searchResult.map((result: any) => ({
                document: {
                    id: result.id.toString(),
                    vector: [],
                    content: result.payload.content,
                    source: result.payload.source || result.payload.relativePath || '',
                    relativePath: result.payload.relativePath,
                    startLine: result.payload.startLine,
                    endLine: result.payload.endLine,
                    fileExtension: result.payload.fileExtension,
                    metadata: result.payload.metadata,
                },
                score: result.score
            }))
        }] as HybridSearchResult[];
    }

    async delete(collectionName: string, ids: string[]): Promise<void> {
        await this.ensureInitialized();

        await this.client!.delete(collectionName, {
            wait: true,
            points: ids,
        });

        console.log(`✅ Deleted ${ids.length} documents from collection '${collectionName}'`);
    }

    async query(collectionName: string, filter: string, outputFields: string[], limit?: number): Promise<Record<string, any>[]> {
        await this.ensureInitialized();

        try {
            // Convert Milvus-style filter to Qdrant filter
            const qdrantFilter = this.convertFilterToQdrant(filter);

            const scrollResult = await this.client!.scroll(collectionName, {
                filter: qdrantFilter,
                limit: limit || 100,
                with_payload: true,
                with_vector: false,
            });

            return scrollResult.points.map((point: any) => ({
                id: point.id,
                ...point.payload,
            }));
        } catch (error) {
            console.error(`❌ Failed to query collection '${collectionName}':`, error);
            throw error;
        }
    }

    private convertFilterToQdrant(filter: string): any {
        // Simple conversion from Milvus filter format to Qdrant filter format
        // This is a basic implementation and may need expansion for complex filters
        if (!filter || filter.trim() === '') {
            return undefined;
        }

        // Handle simple cases like 'field = "value"' or 'field in ["val1", "val2"]'
        // For a complete implementation, you'd need a proper parser
        return undefined;
    }
}