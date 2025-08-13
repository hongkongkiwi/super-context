import { VectorDatabase, VectorDocument, VectorSearchResult, SearchOptions, HybridSearchResult, HybridSearchRequest } from './types';
import * as fs from 'fs';
import * as path from 'path';

// Note: faiss-node is an optional dependency due to compilation complexity
// Users need to install it separately: npm install faiss-node
let FaissNode: any = null;
try {
    FaissNode = require('faiss-node');
} catch (error) {
    console.warn('[FAISS] faiss-node not available. Please install it with: npm install faiss-node');
}

export interface FaissConfig {
    // Index configuration
    dimension: number;
    indexType?: 'IndexFlatL2' | 'IndexFlatIP' | 'IndexIVFFlat' | 'IndexIVFPQ' | 'IndexHNSWFlat' | 'IndexLSH';
    // HNSW specific parameters
    hnswM?: number;
    hnswEfConstruction?: number;
    hnswEfSearch?: number;
    // IVF specific parameters
    ivfNlist?: number;
    ivfNprobe?: number;
    // PQ specific parameters
    pqM?: number;
    pqNbits?: number;
    // Storage configuration
    dataPath?: string;
    indexFileName?: string;
    metadataFileName?: string;
    // Collection configuration
    collectionName?: string;
}

export class FaissVectorDatabase implements VectorDatabase {
    private config: FaissConfig;
    private index: any = null;
    private metadata: Map<number, VectorDocument> = new Map();
    private nextId: number = 0;
    private isInitialized: boolean = false;
    private dataPath: string;
    private indexPath: string;
    private metadataPath: string;

    constructor(config: FaissConfig) {
        if (!FaissNode) {
            throw new Error('faiss-node is not available. Please install it with: npm install faiss-node');
        }

        this.config = {
            indexType: 'IndexHNSWFlat',
            hnswM: 16,
            hnswEfConstruction: 200,
            hnswEfSearch: 64,
            ivfNlist: 100,
            ivfNprobe: 10,
            pqM: 8,
            pqNbits: 8,
            dataPath: './faiss_data',
            indexFileName: 'index.faiss',
            metadataFileName: 'metadata.json',
            collectionName: 'default',
            ...config
        };

        this.dataPath = path.resolve(this.config.dataPath!);
        this.indexPath = path.join(this.dataPath, `${this.config.collectionName}_${this.config.indexFileName}`);
        this.metadataPath = path.join(this.dataPath, `${this.config.collectionName}_${this.config.metadataFileName}`);

        this.ensureDataDirectory();
    }

    private ensureDataDirectory(): void {
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true });
            console.log(`[FAISS] Created data directory: ${this.dataPath}`);
        }
    }

    private createIndex(): any {
        console.log(`[FAISS] Creating ${this.config.indexType} index with dimension ${this.config.dimension}`);

        switch (this.config.indexType) {
            case 'IndexFlatL2':
                return new FaissNode.IndexFlatL2(this.config.dimension);
            
            case 'IndexFlatIP':
                return new FaissNode.IndexFlatIP(this.config.dimension);
            
            case 'IndexHNSWFlat':
                const hnswIndex = new FaissNode.IndexHNSWFlat(this.config.dimension, this.config.hnswM!);
                hnswIndex.hnsw.efConstruction = this.config.hnswEfConstruction!;
                hnswIndex.hnsw.efSearch = this.config.hnswEfSearch!;
                return hnswIndex;
            
            case 'IndexIVFFlat':
                const quantizer = new FaissNode.IndexFlatL2(this.config.dimension);
                const ivfIndex = new FaissNode.IndexIVFFlat(quantizer, this.config.dimension, this.config.ivfNlist!);
                ivfIndex.nprobe = this.config.ivfNprobe!;
                return ivfIndex;
            
            case 'IndexIVFPQ':
                const pqQuantizer = new FaissNode.IndexFlatL2(this.config.dimension);
                const ivfPQIndex = new FaissNode.IndexIVFPQ(
                    pqQuantizer, 
                    this.config.dimension, 
                    this.config.ivfNlist!, 
                    this.config.pqM!, 
                    this.config.pqNbits!
                );
                ivfPQIndex.nprobe = this.config.ivfNprobe!;
                return ivfPQIndex;
            
            case 'IndexLSH':
                return new FaissNode.IndexLSH(this.config.dimension, this.config.pqNbits! || 8);
            
            default:
                throw new Error(`Unsupported index type: ${this.config.indexType}`);
        }
    }

    private loadMetadata(): void {
        if (fs.existsSync(this.metadataPath)) {
            try {
                const metadataJson = fs.readFileSync(this.metadataPath, 'utf-8');
                const metadataObj = JSON.parse(metadataJson);
                
                this.metadata.clear();
                this.nextId = 0;
                
                for (const [key, doc] of Object.entries(metadataObj.documents || {})) {
                    const id = parseInt(key);
                    this.metadata.set(id, doc as VectorDocument);
                    this.nextId = Math.max(this.nextId, id + 1);
                }
                
                this.nextId = metadataObj.nextId || this.nextId;
                console.log(`[FAISS] Loaded ${this.metadata.size} documents from metadata`);
            } catch (error) {
                console.warn(`[FAISS] Failed to load metadata: ${error}`);
                this.metadata.clear();
                this.nextId = 0;
            }
        }
    }

    private saveMetadata(): void {
        try {
            const metadataObj = {
                nextId: this.nextId,
                documents: Object.fromEntries(this.metadata.entries())
            };
            
            fs.writeFileSync(this.metadataPath, JSON.stringify(metadataObj, null, 2));
            console.log(`[FAISS] Saved metadata for ${this.metadata.size} documents`);
        } catch (error) {
            console.error(`[FAISS] Failed to save metadata: ${error}`);
            throw error;
        }
    }

    async connect(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        console.log(`[FAISS] Connecting to Faiss database...`);
        
        try {
            // Load existing index if it exists
            if (fs.existsSync(this.indexPath)) {
                console.log(`[FAISS] Loading existing index from ${this.indexPath}`);
                this.index = FaissNode.read_index(this.indexPath);
                this.loadMetadata();
            } else {
                console.log(`[FAISS] Creating new index`);
                this.index = this.createIndex();
                
                // Train the index if necessary (for IVF indices)
                if (this.config.indexType?.includes('IVF') && !this.index.is_trained) {
                    console.log(`[FAISS] Index requires training but no training data available. Will train when first vectors are added.`);
                }
            }

            this.isInitialized = true;
            console.log(`[FAISS] ✅ Successfully connected to Faiss database`);
            console.log(`[FAISS] Index type: ${this.config.indexType}, Dimension: ${this.config.dimension}, Total vectors: ${this.index.ntotal}`);
        } catch (error) {
            console.error(`[FAISS] Failed to connect: ${error}`);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.isInitialized) {
            await this.saveIndex();
            this.isInitialized = false;
            console.log(`[FAISS] Disconnected from database`);
        }
    }

    private async saveIndex(): Promise<void> {
        if (this.index && this.index.ntotal > 0) {
            try {
                FaissNode.write_index(this.index, this.indexPath);
                this.saveMetadata();
                console.log(`[FAISS] Saved index with ${this.index.ntotal} vectors to ${this.indexPath}`);
            } catch (error) {
                console.error(`[FAISS] Failed to save index: ${error}`);
                throw error;
            }
        }
    }

    async createCollection(name: string, dimension: number): Promise<void> {
        console.log(`[FAISS] Creating collection "${name}" with dimension ${dimension}`);
        
        if (this.config.dimension !== dimension) {
            throw new Error(`Dimension mismatch: expected ${this.config.dimension}, got ${dimension}`);
        }

        // Collections in Faiss are handled by different index files
        this.config.collectionName = name;
        this.indexPath = path.join(this.dataPath, `${name}_${this.config.indexFileName}`);
        this.metadataPath = path.join(this.dataPath, `${name}_${this.config.metadataFileName}`);
        
        // Reset the index for new collection
        this.index = this.createIndex();
        this.metadata.clear();
        this.nextId = 0;
        
        console.log(`[FAISS] ✅ Collection "${name}" created successfully`);
    }

    async hasCollection(name: string): Promise<boolean> {
        const indexPath = path.join(this.dataPath, `${name}_${this.config.indexFileName}`);
        return fs.existsSync(indexPath);
    }

    async dropCollection(name: string): Promise<void> {
        console.log(`[FAISS] Dropping collection "${name}"`);
        
        const indexPath = path.join(this.dataPath, `${name}_${this.config.indexFileName}`);
        const metadataPath = path.join(this.dataPath, `${name}_${this.config.metadataFileName}`);
        
        try {
            if (fs.existsSync(indexPath)) {
                fs.unlinkSync(indexPath);
            }
            if (fs.existsSync(metadataPath)) {
                fs.unlinkSync(metadataPath);
            }
            
            // If this is the current collection, reset
            if (this.config.collectionName === name) {
                this.index = this.createIndex();
                this.metadata.clear();
                this.nextId = 0;
            }
            
            console.log(`[FAISS] ✅ Collection "${name}" dropped successfully`);
        } catch (error) {
            console.error(`[FAISS] Failed to drop collection "${name}": ${error}`);
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

        console.log(`[FAISS] Inserting ${documents.length} documents...`);

        try {
            const vectors = documents.map(doc => doc.vector);
            const vectorArray = new Float32Array(vectors.flat());

            // Train index if necessary
            if (this.config.indexType?.includes('IVF') && !this.index.is_trained) {
                console.log(`[FAISS] Training index with ${documents.length} vectors...`);
                this.index.train(vectorArray);
                console.log(`[FAISS] Index training completed`);
            }

            // Add vectors to index
            this.index.add(vectorArray);

            // Store metadata
            for (let i = 0; i < documents.length; i++) {
                const doc = { ...documents[i] };
                (doc as any).vector = undefined; // Don't store vectors in metadata
                this.metadata.set(this.nextId + i, doc as VectorDocument);
            }

            this.nextId += documents.length;

            // Auto-save after large insertions
            if (documents.length > 100 || this.index.ntotal % 1000 === 0) {
                await this.saveIndex();
            }

            console.log(`[FAISS] ✅ Successfully inserted ${documents.length} documents. Total: ${this.index.ntotal}`);
        } catch (error) {
            console.error(`[FAISS] Failed to insert documents: ${error}`);
            throw error;
        }
    }

    async search(query: number[], options: SearchOptions = {}): Promise<VectorSearchResult[]> {
        if (!this.isInitialized) {
            await this.connect();
        }

        if (this.index.ntotal === 0) {
            console.log(`[FAISS] Index is empty, returning no results`);
            return [];
        }

        const k = options.limit || 10;
        
        try {
            console.log(`[FAISS] Searching for top ${k} similar vectors...`);
            
            const queryArray = new Float32Array(query);
            const results = this.index.search(queryArray, k);

            const searchResults: VectorSearchResult[] = [];

            for (let i = 0; i < results.labels.length; i++) {
                const label = results.labels[i];
                const distance = results.distances[i];
                
                if (label >= 0 && this.metadata.has(label)) {
                    const document = this.metadata.get(label)!;
                    
                    // Convert distance to similarity score
                    // For L2 distance, similarity = 1 / (1 + distance)
                    // For IP (Inner Product), distance is already similarity-like
                    let score = distance;
                    if (this.config.indexType === 'IndexFlatL2' || this.config.indexType === 'IndexHNSWFlat') {
                        score = 1.0 / (1.0 + distance);
                    }
                    
                    searchResults.push({
                        document,
                        score,
                        metadata: {
                            distance,
                            index_id: label
                        }
                    });
                }
            }

            console.log(`[FAISS] Found ${searchResults.length} results`);
            return searchResults;
        } catch (error) {
            console.error(`[FAISS] Search failed: ${error}`);
            throw error;
        }
    }

    async hybridSearch(request: HybridSearchRequest): Promise<HybridSearchResult> {
        console.warn(`[FAISS] Hybrid search not supported. Falling back to vector search only.`);
        
        const vectorResults = await this.search(request.vector, {
            limit: request.limit,
            filter: request.filter
        });

        return {
            results: vectorResults,
            metadata: {
                searchType: 'vector_only',
                message: 'Faiss does not support hybrid search. Only vector search was performed.'
            }
        };
    }

    async getDocumentCount(): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }
        return this.index ? this.index.ntotal : 0;
    }

    async deleteDocuments(filter: Record<string, any>): Promise<number> {
        console.warn(`[FAISS] Delete operations are not efficiently supported. Consider rebuilding the index.`);
        
        // Faiss doesn't support efficient deletion
        // This is a limitation of the Faiss library
        // Users would need to rebuild the index without the deleted documents
        
        return 0;
    }

    async clearCollection(): Promise<void> {
        console.log(`[FAISS] Clearing collection...`);
        
        // Create a new index and clear metadata
        this.index = this.createIndex();
        this.metadata.clear();
        this.nextId = 0;

        // Remove saved files
        try {
            if (fs.existsSync(this.indexPath)) {
                fs.unlinkSync(this.indexPath);
            }
            if (fs.existsSync(this.metadataPath)) {
                fs.unlinkSync(this.metadataPath);
            }
            
            console.log(`[FAISS] ✅ Collection cleared successfully`);
        } catch (error) {
            console.warn(`[FAISS] Warning: Could not remove saved files: ${error}`);
        }
    }

    // Utility methods for index management
    async getIndexInfo(): Promise<any> {
        if (!this.isInitialized) {
            await this.connect();
        }

        return {
            indexType: this.config.indexType,
            dimension: this.config.dimension,
            totalVectors: this.index ? this.index.ntotal : 0,
            isTrained: this.index ? this.index.is_trained : false,
            indexPath: this.indexPath,
            metadataPath: this.metadataPath,
            config: this.config
        };
    }

    async optimizeIndex(): Promise<void> {
        console.log(`[FAISS] Optimizing index...`);
        
        // For HNSW indices, we can adjust ef_search parameter
        if (this.config.indexType === 'IndexHNSWFlat' && this.index) {
            this.index.hnsw.efSearch = this.config.hnswEfSearch!;
            console.log(`[FAISS] Set HNSW ef_search to ${this.config.hnswEfSearch}`);
        }

        // Save the optimized index
        await this.saveIndex();
        console.log(`[FAISS] ✅ Index optimization completed`);
    }
}