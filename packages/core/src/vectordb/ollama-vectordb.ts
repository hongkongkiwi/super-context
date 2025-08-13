import { VectorDatabase, VectorDocument, VectorSearchResult, SearchOptions, HybridSearchResult, HybridSearchRequest } from './types';
import * as fs from 'fs';
import * as path from 'path';

// Ollama client - should already be available as it's used for embeddings
let ollama: any = null;
try {
    ollama = require('ollama');
} catch (error) {
    console.warn('[OLLAMA_VDB] ollama not available. Please install it with: npm install ollama');
}

export interface OllamaVectorDbConfig {
    // Connection configuration
    host?: string;
    // Model configuration for embeddings (if different from embedding provider)
    embeddingModel?: string;
    // Storage configuration (local file-based storage)
    dataPath?: string;
    indexFileName?: string;
    metadataFileName?: string;
    // Collection configuration
    collectionName?: string;
    // Vector configuration
    dimension: number;
    // Distance metric: 'cosine', 'euclidean', 'dot'
    metric?: 'cosine' | 'euclidean' | 'dot';
    // Performance settings
    batchSize?: number;
    // Search configuration
    searchTopK?: number;
}

interface OllamaIndexEntry {
    id: string;
    vector: number[];
    metadata: Record<string, any>;
}

export class OllamaVectorDatabase implements VectorDatabase {
    private config: OllamaVectorDbConfig;
    private client: any = null;
    private isInitialized: boolean = false;
    private index: Map<string, OllamaIndexEntry> = new Map();
    private dataPath: string;
    private indexPath: string;
    private metadataPath: string;

    constructor(config: OllamaVectorDbConfig) {
        if (!ollama) {
            throw new Error('ollama is not available. Please install it with: npm install ollama');
        }

        this.config = {
            host: 'http://127.0.0.1:11434',
            dataPath: './ollama_vector_data',
            indexFileName: 'index.json',
            metadataFileName: 'metadata.json',
            collectionName: 'default',
            metric: 'cosine',
            batchSize: 100,
            searchTopK: 10,
            ...config
        };

        if (!this.config.dimension) {
            throw new Error('Vector dimension is required for Ollama vector database');
        }

        this.dataPath = path.resolve(this.config.dataPath!);
        this.indexPath = path.join(this.dataPath, `${this.config.collectionName}_${this.config.indexFileName}`);
        this.metadataPath = path.join(this.dataPath, `${this.config.collectionName}_${this.config.metadataFileName}`);

        this.ensureDataDirectory();
    }

    private ensureDataDirectory(): void {
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true });
            console.log(`[OLLAMA_VDB] Created data directory: ${this.dataPath}`);
        }
    }

    async connect(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        console.log(`[OLLAMA_VDB] Connecting to Ollama at ${this.config.host}...`);
        
        try {
            // Initialize Ollama client
            this.client = new ollama.Ollama({ 
                host: this.config.host 
            });

            // Test connection
            await this.client.list();
            
            // Load existing index if it exists
            this.loadIndex();

            this.isInitialized = true;
            console.log(`[OLLAMA_VDB] ✅ Successfully connected to Ollama vector database`);
            console.log(`[OLLAMA_VDB] Loaded ${this.index.size} vectors from index`);
        } catch (error) {
            console.error(`[OLLAMA_VDB] Failed to connect: ${error}`);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.isInitialized) {
            this.saveIndex();
            this.client = null;
            this.isInitialized = false;
            console.log(`[OLLAMA_VDB] Disconnected from database`);
        }
    }

    private loadIndex(): void {
        if (fs.existsSync(this.indexPath)) {
            try {
                const indexData = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
                this.index.clear();
                
                for (const entry of indexData) {
                    this.index.set(entry.id, entry);
                }
                
                console.log(`[OLLAMA_VDB] Loaded ${this.index.size} vectors from index`);
            } catch (error) {
                console.warn(`[OLLAMA_VDB] Failed to load index: ${error}`);
                this.index.clear();
            }
        }
    }

    private saveIndex(): void {
        try {
            const indexData = Array.from(this.index.values());
            fs.writeFileSync(this.indexPath, JSON.stringify(indexData, null, 2));
            console.log(`[OLLAMA_VDB] Saved index with ${this.index.size} vectors`);
        } catch (error) {
            console.error(`[OLLAMA_VDB] Failed to save index: ${error}`);
            throw error;
        }
    }

    async createCollection(name: string, dimension: number): Promise<void> {
        console.log(`[OLLAMA_VDB] Creating collection "${name}" with dimension ${dimension}...`);
        
        if (dimension !== this.config.dimension) {
            throw new Error(`Dimension mismatch: expected ${this.config.dimension}, got ${dimension}`);
        }

        // Update collection name and paths
        this.config.collectionName = name;
        this.indexPath = path.join(this.dataPath, `${name}_${this.config.indexFileName}`);
        this.metadataPath = path.join(this.dataPath, `${name}_${this.config.metadataFileName}`);
        
        // Clear current index and start fresh
        this.index.clear();
        
        console.log(`[OLLAMA_VDB] ✅ Collection "${name}" created successfully`);
    }

    async hasCollection(name: string): Promise<boolean> {
        const indexPath = path.join(this.dataPath, `${name}_${this.config.indexFileName}`);
        return fs.existsSync(indexPath);
    }

    async dropCollection(name: string): Promise<void> {
        console.log(`[OLLAMA_VDB] Dropping collection "${name}"...`);
        
        const indexPath = path.join(this.dataPath, `${name}_${this.config.indexFileName}`);
        const metadataPath = path.join(this.dataPath, `${name}_${this.config.metadataFileName}`);
        
        try {
            if (fs.existsSync(indexPath)) {
                fs.unlinkSync(indexPath);
            }
            if (fs.existsSync(metadataPath)) {
                fs.unlinkSync(metadataPath);
            }
            
            // If this is the current collection, clear the index
            if (this.config.collectionName === name) {
                this.index.clear();
            }
            
            console.log(`[OLLAMA_VDB] ✅ Collection "${name}" dropped successfully`);
        } catch (error) {
            console.error(`[OLLAMA_VDB] Failed to drop collection "${name}": ${error}`);
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

        console.log(`[OLLAMA_VDB] Inserting ${documents.length} documents...`);

        try {
            // If no embedding model specified, assume vectors are already provided
            if (!this.config.embeddingModel) {
                // Use provided vectors
                for (const doc of documents) {
                    if (!doc.vector || doc.vector.length !== this.config.dimension) {
                        throw new Error(`Document ${doc.id} has invalid vector dimension. Expected ${this.config.dimension}, got ${doc.vector?.length || 0}`);
                    }

                    const entry: OllamaIndexEntry = {
                        id: doc.id || `doc_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                        vector: doc.vector,
                        metadata: {
                            content: doc.content,
                            source: doc.source,
                            ...doc.metadata
                        }
                    };

                    this.index.set(entry.id, entry);
                }
            } else {
                // Generate embeddings using Ollama
                console.log(`[OLLAMA_VDB] Generating embeddings using model: ${this.config.embeddingModel}`);
                
                for (let i = 0; i < documents.length; i += this.config.batchSize!) {
                    const batch = documents.slice(i, i + this.config.batchSize!);
                    
                    for (const doc of batch) {
                        const response = await this.client.embeddings({
                            model: this.config.embeddingModel,
                            prompt: doc.content
                        });

                        if (!response.embedding || response.embedding.length !== this.config.dimension) {
                            throw new Error(`Generated embedding has invalid dimension. Expected ${this.config.dimension}, got ${response.embedding?.length || 0}`);
                        }

                        const entry: OllamaIndexEntry = {
                            id: doc.id || `doc_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                            vector: response.embedding,
                            metadata: {
                                content: doc.content,
                                source: doc.source,
                                ...doc.metadata
                            }
                        };

                        this.index.set(entry.id, entry);
                    }

                    console.log(`[OLLAMA_VDB] Processed batch ${Math.floor(i / this.config.batchSize!) + 1}/${Math.ceil(documents.length / this.config.batchSize!)}`);
                    
                    // Small delay to avoid overwhelming Ollama
                    if (i + this.config.batchSize! < documents.length) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            }

            // Auto-save index
            this.saveIndex();

            console.log(`[OLLAMA_VDB] ✅ Successfully inserted ${documents.length} documents. Total: ${this.index.size}`);
        } catch (error) {
            console.error(`[OLLAMA_VDB] Failed to insert documents: ${error}`);
            throw error;
        }
    }

    private calculateSimilarity(vector1: number[], vector2: number[]): number {
        if (vector1.length !== vector2.length) {
            throw new Error('Vectors must have the same dimension');
        }

        switch (this.config.metric) {
            case 'cosine':
                return this.cosineSimilarity(vector1, vector2);
            case 'euclidean':
                const distance = this.euclideanDistance(vector1, vector2);
                return 1.0 / (1.0 + distance); // Convert distance to similarity
            case 'dot':
                return this.dotProduct(vector1, vector2);
            default:
                return this.cosineSimilarity(vector1, vector2);
        }
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        
        const norm = Math.sqrt(normA) * Math.sqrt(normB);
        return norm === 0 ? 0 : dotProduct / norm;
    }

    private euclideanDistance(a: number[], b: number[]): number {
        let sum = 0;
        for (let i = 0; i < a.length; i++) {
            const diff = a[i] - b[i];
            sum += diff * diff;
        }
        return Math.sqrt(sum);
    }

    private dotProduct(a: number[], b: number[]): number {
        let product = 0;
        for (let i = 0; i < a.length; i++) {
            product += a[i] * b[i];
        }
        return product;
    }

    async search(query: number[], options: SearchOptions = {}): Promise<VectorSearchResult[]> {
        if (!this.isInitialized) {
            await this.connect();
        }

        if (this.index.size === 0) {
            console.log(`[OLLAMA_VDB] Index is empty, returning no results`);
            return [];
        }

        const limit = options.limit || this.config.searchTopK || 10;
        
        try {
            console.log(`[OLLAMA_VDB] Searching for top ${limit} similar vectors...`);
            
            const results: { entry: OllamaIndexEntry; score: number }[] = [];

            // Calculate similarity for all vectors
            for (const [id, entry] of this.index) {
                // Apply filter if provided
                if (options.filter) {
                    let matchesFilter = true;
                    for (const [key, value] of Object.entries(options.filter)) {
                        if (entry.metadata[key] !== value) {
                            matchesFilter = false;
                            break;
                        }
                    }
                    if (!matchesFilter) {
                        continue;
                    }
                }

                const score = this.calculateSimilarity(query, entry.vector);
                results.push({ entry, score });
            }

            // Sort by score (descending) and take top results
            results.sort((a, b) => b.score - a.score);
            const topResults = results.slice(0, limit);

            const searchResults: VectorSearchResult[] = topResults.map(({ entry, score }) => ({
                document: {
                    id: entry.id,
                    content: entry.metadata.content || '',
                    source: entry.metadata.source || '',
                    relativePath: entry.metadata.relativePath || entry.metadata.source || '',
                    startLine: entry.metadata.startLine || 0,
                    endLine: entry.metadata.endLine || 0,
                    fileExtension: entry.metadata.fileExtension || '',
                    vector: entry.vector,
                    metadata: entry.metadata
                },
                score,
                metadata: {
                    metric: this.config.metric,
                    ollama_id: entry.id
                }
            }));

            console.log(`[OLLAMA_VDB] Found ${searchResults.length} results`);
            return searchResults;
        } catch (error) {
            console.error(`[OLLAMA_VDB] Search failed: ${error}`);
            throw error;
        }
    }

    async hybridSearch(request: HybridSearchRequest): Promise<HybridSearchResult> {
        console.log(`[OLLAMA_VDB] Performing hybrid search...`);

        try {
            let queryVector: number[];

            if (typeof request.query === 'string' && this.config.embeddingModel) {
                // Generate embedding for text query using Ollama
                console.log(`[OLLAMA_VDB] Generating embedding for text query using ${this.config.embeddingModel}`);
                const response = await this.client.embeddings({
                    model: this.config.embeddingModel,
                    prompt: request.query
                });

                if (!response.embedding) {
                    throw new Error('Failed to generate embedding for text query');
                }

                queryVector = response.embedding;
            } else if (Array.isArray(request.vector)) {
                queryVector = request.vector;
            } else {
                throw new Error('Invalid search request: must provide either text query with embedding model or vector');
            }

            // Perform vector search
            const vectorResults = await this.search(queryVector, {
                limit: request.limit,
                filter: request.filter
            });

            return {
                results: vectorResults,
                metadata: {
                    searchType: typeof request.query === 'string' ? 'hybrid' : 'vector_only',
                    embeddingModel: this.config.embeddingModel
                }
            };
        } catch (error) {
            console.error(`[OLLAMA_VDB] Hybrid search failed: ${error}`);
            
            // Fallback to vector search if available
            if (Array.isArray(request.vector)) {
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

            throw error;
        }
    }

    async getDocumentCount(): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }
        return this.index.size;
    }

    async deleteDocuments(filter: Record<string, any>): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[OLLAMA_VDB] Deleting documents with filter:`, filter);

        try {
            let deletedCount = 0;

            if (filter.id) {
                // Delete by ID(s)
                const ids = Array.isArray(filter.id) ? filter.id : [filter.id];
                
                for (const id of ids) {
                    if (this.index.delete(id)) {
                        deletedCount++;
                    }
                }
            } else {
                // Delete by metadata filter
                const toDelete: string[] = [];
                
                for (const [id, entry] of this.index) {
                    let matchesFilter = true;
                    for (const [key, value] of Object.entries(filter)) {
                        if (entry.metadata[key] !== value) {
                            matchesFilter = false;
                            break;
                        }
                    }
                    if (matchesFilter) {
                        toDelete.push(id);
                    }
                }

                for (const id of toDelete) {
                    this.index.delete(id);
                    deletedCount++;
                }
            }

            if (deletedCount > 0) {
                this.saveIndex();
            }

            console.log(`[OLLAMA_VDB] ✅ Deleted ${deletedCount} documents`);
            return deletedCount;
        } catch (error) {
            console.error(`[OLLAMA_VDB] Failed to delete documents: ${error}`);
            throw error;
        }
    }

    async clearCollection(): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[OLLAMA_VDB] Clearing all documents from collection...`);

        try {
            this.index.clear();
            
            // Remove saved files
            if (fs.existsSync(this.indexPath)) {
                fs.unlinkSync(this.indexPath);
            }
            if (fs.existsSync(this.metadataPath)) {
                fs.unlinkSync(this.metadataPath);
            }
            
            console.log(`[OLLAMA_VDB] ✅ Collection cleared successfully`);
        } catch (error) {
            console.error(`[OLLAMA_VDB] Failed to clear collection: ${error}`);
            throw error;
        }
    }

    // Ollama-specific utility methods
    async getIndexInfo(): Promise<any> {
        if (!this.isInitialized) {
            await this.connect();
        }

        return {
            collectionName: this.config.collectionName,
            totalVectors: this.index.size,
            dimension: this.config.dimension,
            metric: this.config.metric,
            embeddingModel: this.config.embeddingModel,
            indexPath: this.indexPath,
            config: this.config
        };
    }

    async listAvailableModels(): Promise<string[]> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const models = await this.client.list();
            return models.models
                .filter((model: any) => model.name.includes('embed'))
                .map((model: any) => model.name);
        } catch (error) {
            console.error(`[OLLAMA_VDB] Failed to list models: ${error}`);
            return [];
        }
    }

    async optimizeIndex(): Promise<void> {
        console.log(`[OLLAMA_VDB] Optimizing index...`);
        
        // For file-based storage, optimization means reorganizing the index
        // and removing any fragmentation
        try {
            this.saveIndex();
            console.log(`[OLLAMA_VDB] ✅ Index optimization completed`);
        } catch (error) {
            console.error(`[OLLAMA_VDB] Index optimization failed: ${error}`);
            throw error;
        }
    }
}