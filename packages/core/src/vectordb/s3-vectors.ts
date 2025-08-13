import { VectorDatabase, VectorDocument, VectorSearchResult, SearchOptions, HybridSearchResult, HybridSearchRequest } from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// AWS SDK v3 - install with: npm install @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/credential-providers
let S3Client: any = null;
let GetObjectCommand: any = null;
let PutObjectCommand: any = null;
let DeleteObjectCommand: any = null;
let ListObjectsV2Command: any = null;
let Upload: any = null;
try {
    const s3 = require('@aws-sdk/client-s3');
    const storage = require('@aws-sdk/lib-storage');
    S3Client = s3.S3Client;
    GetObjectCommand = s3.GetObjectCommand;
    PutObjectCommand = s3.PutObjectCommand;
    DeleteObjectCommand = s3.DeleteObjectCommand;
    ListObjectsV2Command = s3.ListObjectsV2Command;
    Upload = storage.Upload;
} catch (error) {
    console.warn('[S3VECTORS] AWS SDK v3 not available. Please install with: npm install @aws-sdk/client-s3 @aws-sdk/lib-storage');
}

export interface S3VectorsConfig {
    // AWS Configuration
    region: string;
    bucketName: string;
    // Authentication (will use AWS credential chain)
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    profile?: string;
    // S3 Configuration
    prefix?: string; // Prefix for all keys (like a folder)
    storageClass?: 'STANDARD' | 'REDUCED_REDUNDANCY' | 'STANDARD_IA' | 'ONEZONE_IA' | 'INTELLIGENT_TIERING' | 'GLACIER' | 'DEEP_ARCHIVE';
    // Collection configuration
    collectionName: string;
    // Vector configuration
    dimension: number;
    metric?: 'cosine' | 'euclidean' | 'dot';
    // Index configuration (for local indexing)
    indexType?: 'flat' | 'hnsw' | 'ivf';
    // Performance settings
    batchSize?: number;
    cacheSize?: number; // Number of vectors to keep in memory
    localCachePath?: string; // Local cache directory
    compressionLevel?: number; // 0-9, 0 = no compression
}

interface S3VectorDocument {
    id: string;
    vector: number[];
    content: string;
    source: string;
    relativePath: string;
    startLine: number;
    endLine: number;
    fileExtension: string;
    metadata: Record<string, any>;
    createdAt: string;
    updatedAt: string;
}

interface S3Index {
    collections: Record<string, {
        dimension: number;
        metric: string;
        documentCount: number;
        createdAt: string;
        updatedAt: string;
        documents: string[]; // List of document IDs
    }>;
    version: string;
}

export class S3VectorDatabase implements VectorDatabase {
    private config: S3VectorsConfig;
    private s3Client: any = null;
    private localCache: Map<string, S3VectorDocument> = new Map();
    private indexCache: S3Index | null = null;
    private isInitialized: boolean = false;

    constructor(config: S3VectorsConfig) {
        if (!S3Client) {
            throw new Error('@aws-sdk/client-s3 is not available. Please install it with: npm install @aws-sdk/client-s3 @aws-sdk/lib-storage');
        }

        this.config = {
            prefix: 'vectors/',
            storageClass: 'STANDARD',
            metric: 'cosine',
            indexType: 'flat',
            batchSize: 100,
            cacheSize: 1000,
            compressionLevel: 6,
            ...config
        };

        if (!this.config.region) {
            throw new Error('AWS region is required');
        }

        if (!this.config.bucketName) {
            throw new Error('S3 bucket name is required');
        }

        if (!this.config.collectionName) {
            throw new Error('Collection name is required');
        }

        if (!this.config.dimension || this.config.dimension <= 0) {
            throw new Error('Vector dimension must be a positive integer');
        }

        // Set up local cache directory
        if (!this.config.localCachePath) {
            this.config.localCachePath = path.join(process.cwd(), '.s3-vector-cache');
        }
    }

    async connect(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        console.log(`[S3VECTORS] Connecting to S3 bucket ${this.config.bucketName} in region ${this.config.region}...`);
        
        try {
            // Create S3 client with credential chain
            const clientConfig: any = {
                region: this.config.region
            };

            // Add explicit credentials if provided
            if (this.config.accessKeyId && this.config.secretAccessKey) {
                clientConfig.credentials = {
                    accessKeyId: this.config.accessKeyId,
                    secretAccessKey: this.config.secretAccessKey,
                    ...(this.config.sessionToken && { sessionToken: this.config.sessionToken })
                };
            }

            this.s3Client = new S3Client(clientConfig);

            // Test connection by listing objects
            await this.s3Client.send(new ListObjectsV2Command({
                Bucket: this.config.bucketName,
                Prefix: this.config.prefix,
                MaxKeys: 1
            }));

            // Ensure local cache directory exists
            if (this.config.localCachePath && !fs.existsSync(this.config.localCachePath)) {
                fs.mkdirSync(this.config.localCachePath, { recursive: true });
            }

            // Load index
            await this.loadIndex();

            this.isInitialized = true;
            console.log(`[S3VECTORS] ✅ Successfully connected to S3`);
        } catch (error) {
            console.error(`[S3VECTORS] Failed to connect: ${error}`);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.isInitialized) {
            // Save any pending changes
            await this.saveIndex();
            
            // Clear caches
            this.localCache.clear();
            this.indexCache = null;
            this.s3Client = null;
            this.isInitialized = false;
            console.log(`[S3VECTORS] Disconnected from S3`);
        }
    }

    private getIndexKey(): string {
        return `${this.config.prefix}index.json`;
    }

    private getDocumentKey(documentId: string): string {
        return `${this.config.prefix}${this.config.collectionName}/${documentId}.json`;
    }

    private async loadIndex(): Promise<void> {
        try {
            const response = await this.s3Client.send(new GetObjectCommand({
                Bucket: this.config.bucketName,
                Key: this.getIndexKey()
            }));

            const indexData = await this.streamToString(response.Body);
            this.indexCache = JSON.parse(indexData);
            console.log(`[S3VECTORS] Loaded index with ${Object.keys(this.indexCache?.collections || {}).length} collections`);
        } catch (error: any) {
            if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
                // Index doesn't exist yet, create new one
                this.indexCache = {
                    collections: {},
                    version: '1.0.0'
                };
                console.log(`[S3VECTORS] Created new index`);
            } else {
                console.error(`[S3VECTORS] Failed to load index: ${error}`);
                throw error;
            }
        }
    }

    private async saveIndex(): Promise<void> {
        if (!this.indexCache) return;

        try {
            const indexData = JSON.stringify(this.indexCache, null, 2);
            
            await this.s3Client.send(new PutObjectCommand({
                Bucket: this.config.bucketName,
                Key: this.getIndexKey(),
                Body: indexData,
                ContentType: 'application/json',
                StorageClass: this.config.storageClass
            }));

            console.log(`[S3VECTORS] Index saved successfully`);
        } catch (error) {
            console.error(`[S3VECTORS] Failed to save index: ${error}`);
            throw error;
        }
    }

    private async streamToString(stream: any): Promise<string> {
        const chunks: Buffer[] = [];
        return new Promise((resolve, reject) => {
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('error', reject);
            stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        });
    }

    async createCollection(name: string, dimension: number, description?: string): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[S3VECTORS] Creating collection "${name}" with dimension ${dimension}...`);

        try {
            if (!this.indexCache) {
                throw new Error('Index not loaded');
            }

            if (this.indexCache.collections[name]) {
                console.log(`[S3VECTORS] Collection "${name}" already exists`);
                return;
            }

            // Create collection metadata
            this.indexCache.collections[name] = {
                dimension,
                metric: this.config.metric!,
                documentCount: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                documents: []
            };

            await this.saveIndex();
            console.log(`[S3VECTORS] ✅ Collection "${name}" created successfully`);
        } catch (error) {
            console.error(`[S3VECTORS] Failed to create collection "${name}": ${error}`);
            throw error;
        }
    }

    async hasCollection(name: string): Promise<boolean> {
        if (!this.isInitialized) {
            await this.connect();
        }

        return !!(this.indexCache?.collections[name]);
    }

    async dropCollection(name: string): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[S3VECTORS] Dropping collection "${name}"...`);

        try {
            if (!this.indexCache?.collections[name]) {
                console.log(`[S3VECTORS] Collection "${name}" does not exist`);
                return;
            }

            const collection = this.indexCache.collections[name];
            
            // Delete all documents in the collection
            const deletePromises = collection.documents.map(docId => 
                this.s3Client.send(new DeleteObjectCommand({
                    Bucket: this.config.bucketName,
                    Key: this.getDocumentKey(docId)
                }))
            );

            await Promise.all(deletePromises);

            // Remove collection from index
            delete this.indexCache.collections[name];
            await this.saveIndex();

            // Clear local cache for this collection
            for (const [key, doc] of this.localCache.entries()) {
                if (key.startsWith(`${name}:`)) {
                    this.localCache.delete(key);
                }
            }
            
            console.log(`[S3VECTORS] ✅ Collection "${name}" dropped successfully`);
        } catch (error) {
            console.error(`[S3VECTORS] Failed to drop collection "${name}": ${error}`);
            throw error;
        }
    }

    async listCollections(): Promise<string[]> {
        if (!this.isInitialized) {
            await this.connect();
        }

        return Object.keys(this.indexCache?.collections || {});
    }

    async insertDocuments(documents: VectorDocument[]): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        if (documents.length === 0) {
            return;
        }

        console.log(`[S3VECTORS] Inserting ${documents.length} documents...`);

        try {
            if (!this.indexCache?.collections[this.config.collectionName]) {
                throw new Error(`Collection "${this.config.collectionName}" does not exist. Create it first.`);
            }

            const collection = this.indexCache.collections[this.config.collectionName];
            const s3Documents: S3VectorDocument[] = documents.map(doc => ({
                id: doc.id || this.generateDocumentId(),
                vector: doc.vector,
                content: doc.content,
                source: doc.source,
                relativePath: doc.relativePath,
                startLine: doc.startLine,
                endLine: doc.endLine,
                fileExtension: doc.fileExtension,
                metadata: doc.metadata || {},
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }));

            // Upload documents in batches
            const batchSize = this.config.batchSize!;
            const uploadPromises: Promise<any>[] = [];

            for (let i = 0; i < s3Documents.length; i += batchSize) {
                const batch = s3Documents.slice(i, i + batchSize);
                
                const batchPromises = batch.map(async (doc) => {
                    const docData = this.config.compressionLevel && this.config.compressionLevel > 0
                        ? await this.compressData(JSON.stringify(doc))
                        : JSON.stringify(doc);

                    const contentType = this.config.compressionLevel && this.config.compressionLevel > 0
                        ? 'application/gzip'
                        : 'application/json';

                    return this.s3Client.send(new PutObjectCommand({
                        Bucket: this.config.bucketName,
                        Key: this.getDocumentKey(doc.id),
                        Body: docData,
                        ContentType: contentType,
                        StorageClass: this.config.storageClass,
                        Metadata: {
                            'vector-dimension': doc.vector.length.toString(),
                            'collection': this.config.collectionName
                        }
                    }));
                });

                uploadPromises.push(...batchPromises);
                
                console.log(`[S3VECTORS] Prepared batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(s3Documents.length / batchSize)}`);
            }

            // Wait for all uploads to complete
            await Promise.all(uploadPromises);

            // Update index
            const newDocIds = s3Documents.map(doc => doc.id);
            collection.documents.push(...newDocIds);
            collection.documentCount += s3Documents.length;
            collection.updatedAt = new Date().toISOString();

            await this.saveIndex();

            // Update local cache
            s3Documents.forEach(doc => {
                const cacheKey = `${this.config.collectionName}:${doc.id}`;
                this.localCache.set(cacheKey, doc);
                
                // Maintain cache size limit
                if (this.localCache.size > this.config.cacheSize!) {
                    const firstKey = this.localCache.keys().next().value;
                    if (firstKey) {
                        this.localCache.delete(firstKey);
                    }
                }
            });

            console.log(`[S3VECTORS] ✅ Successfully inserted ${documents.length} documents`);
        } catch (error) {
            console.error(`[S3VECTORS] Failed to insert documents: ${error}`);
            throw error;
        }
    }

    private generateDocumentId(): string {
        return crypto.randomBytes(16).toString('hex');
    }

    private async compressData(data: string): Promise<Buffer> {
        const zlib = require('zlib');
        return new Promise((resolve, reject) => {
            zlib.gzip(data, { level: this.config.compressionLevel }, (error: any, result: Buffer) => {
                if (error) reject(error);
                else resolve(result);
            });
        });
    }

    private async decompressData(data: Buffer): Promise<string> {
        const zlib = require('zlib');
        return new Promise((resolve, reject) => {
            zlib.gunzip(data, (error: any, result: Buffer) => {
                if (error) reject(error);
                else resolve(result.toString('utf-8'));
            });
        });
    }

    async search(query: number[], options: SearchOptions = {}): Promise<VectorSearchResult[]> {
        if (!this.isInitialized) {
            await this.connect();
        }

        const limit = options.limit || options.topK || 10;
        
        try {
            console.log(`[S3VECTORS] Searching for top ${limit} similar vectors...`);
            
            if (!this.indexCache?.collections[this.config.collectionName]) {
                throw new Error(`Collection "${this.config.collectionName}" does not exist`);
            }

            const collection = this.indexCache.collections[this.config.collectionName];
            const allDocuments: S3VectorDocument[] = [];

            // Load documents from cache and S3
            for (const docId of collection.documents) {
                const cacheKey = `${this.config.collectionName}:${docId}`;
                let doc = this.localCache.get(cacheKey);

                if (!doc) {
                    // Load from S3
                    try {
                        const response = await this.s3Client.send(new GetObjectCommand({
                            Bucket: this.config.bucketName,
                            Key: this.getDocumentKey(docId)
                        }));

                        let docData: string;
                        const isCompressed = response.ContentType === 'application/gzip';
                        
                        if (isCompressed) {
                            const buffer = await this.streamToBuffer(response.Body);
                            docData = await this.decompressData(buffer);
                        } else {
                            docData = await this.streamToString(response.Body);
                        }

                        doc = JSON.parse(docData);
                        
                        // Add to cache
                        this.localCache.set(cacheKey, doc!);
                        
                        // Maintain cache size
                        if (this.localCache.size > this.config.cacheSize!) {
                            const firstKey = this.localCache.keys().next().value;
                            if (firstKey) {
                        this.localCache.delete(firstKey);
                    }
                        }
                    } catch (error) {
                        console.warn(`[S3VECTORS] Failed to load document ${docId}: ${error}`);
                        continue;
                    }
                }

                if (doc && this.matchesFilter(doc, options.filter)) {
                    allDocuments.push(doc);
                }
            }

            console.log(`[S3VECTORS] Loaded ${allDocuments.length} documents for similarity computation`);

            // Compute similarities
            const similarities = allDocuments.map(doc => {
                const similarity = this.computeSimilarity(query, doc.vector, collection.metric);
                return {
                    document: this.convertToVectorDocument(doc),
                    score: similarity,
                    metadata: {
                        s3_key: this.getDocumentKey(doc.id)
                    }
                };
            }).filter(result => {
                return !options.threshold || result.score >= options.threshold;
            });

            // Sort and return top results
            similarities.sort((a, b) => b.score - a.score);
            const topResults = similarities.slice(0, limit);

            console.log(`[S3VECTORS] Found ${topResults.length} results`);
            return topResults;
        } catch (error) {
            console.error(`[S3VECTORS] Search failed: ${error}`);
            throw error;
        }
    }

    private async streamToBuffer(stream: any): Promise<Buffer> {
        const chunks: Buffer[] = [];
        return new Promise((resolve, reject) => {
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('error', reject);
            stream.on('end', () => resolve(Buffer.concat(chunks)));
        });
    }

    private matchesFilter(doc: S3VectorDocument, filter?: Record<string, any>): boolean {
        if (!filter) return true;

        for (const [key, value] of Object.entries(filter)) {
            if (key === 'id') {
                if (doc.id !== value) return false;
                continue;
            }

            const docValue = doc.metadata[key];
            
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                if (docValue !== value) return false;
            } else if (Array.isArray(value)) {
                if (!value.includes(docValue)) return false;
            } else if (typeof value === 'object' && value !== null) {
                if (value.gte !== undefined && docValue < value.gte) return false;
                if (value.gt !== undefined && docValue <= value.gt) return false;
                if (value.lte !== undefined && docValue > value.lte) return false;
                if (value.lt !== undefined && docValue >= value.lt) return false;
            }
        }

        return true;
    }

    private computeSimilarity(vector1: number[], vector2: number[], metric: string): number {
        if (vector1.length !== vector2.length) {
            throw new Error(`Vector dimension mismatch: ${vector1.length} vs ${vector2.length}`);
        }

        switch (metric) {
            case 'cosine':
                return this.cosineSimilarity(vector1, vector2);
            case 'euclidean':
                const distance = this.euclideanDistance(vector1, vector2);
                return 1.0 / (1.0 + distance);
            case 'dot':
                return this.dotProduct(vector1, vector2);
            default:
                return this.cosineSimilarity(vector1, vector2);
        }
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
        const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
        const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
        
        if (magnitudeA === 0 || magnitudeB === 0) return 0;
        return dotProduct / (magnitudeA * magnitudeB);
    }

    private euclideanDistance(a: number[], b: number[]): number {
        return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
    }

    private dotProduct(a: number[], b: number[]): number {
        return a.reduce((sum, val, i) => sum + val * b[i], 0);
    }

    private convertToVectorDocument(s3Doc: S3VectorDocument): VectorDocument {
        return {
            id: s3Doc.id,
            vector: s3Doc.vector,
            content: s3Doc.content,
            source: s3Doc.source,
            relativePath: s3Doc.relativePath,
            startLine: s3Doc.startLine,
            endLine: s3Doc.endLine,
            fileExtension: s3Doc.fileExtension,
            metadata: s3Doc.metadata
        };
    }

    async hybridSearch(request: HybridSearchRequest): Promise<HybridSearchResult> {
        console.log(`[S3VECTORS] Performing hybrid search...`);

        try {
            // Get vector search results
            const vectorResults = await this.search(request.vector, {
                limit: (request.limit || 10) * 2,
                filter: request.filter
            });

            let searchResults = vectorResults;

            // Apply text filtering if provided
            if (request.query && request.query.trim()) {
                const textQuery = request.query.toLowerCase().trim();
                const textResults = vectorResults.filter(result => 
                    result.document.content.toLowerCase().includes(textQuery) ||
                    result.document.source.toLowerCase().includes(textQuery)
                );

                // Combine results with boosted scores for text matches
                const hybridResults = textResults.map(result => ({
                    ...result,
                    score: result.score * 1.2
                }));

                const vectorOnlyResults = vectorResults.filter(vr => 
                    !textResults.some(tr => tr.document.id === vr.document.id)
                );

                searchResults = [...hybridResults, ...vectorOnlyResults]
                    .sort((a, b) => b.score - a.score)
                    .slice(0, request.limit || 10);
            }

            console.log(`[S3VECTORS] Hybrid search found ${searchResults.length} results`);
            
            return {
                results: searchResults,
                metadata: {
                    searchType: request.query && request.query.trim() ? 'hybrid' : 'vector_only',
                    textBoost: 1.2
                }
            };
        } catch (error) {
            console.error(`[S3VECTORS] Hybrid search failed: ${error}`);
            
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

    async deleteDocuments(filter: Record<string, any>): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[S3VECTORS] Deleting documents with filter:`, filter);

        try {
            if (!this.indexCache?.collections[this.config.collectionName]) {
                throw new Error(`Collection "${this.config.collectionName}" does not exist`);
            }

            const collection = this.indexCache.collections[this.config.collectionName];
            let documentsToDelete: string[] = [];

            if (filter.id) {
                // Delete by ID(s)
                documentsToDelete = Array.isArray(filter.id) ? filter.id : [filter.id];
            } else {
                // Delete by filter - need to load and check each document
                for (const docId of collection.documents) {
                    const cacheKey = `${this.config.collectionName}:${docId}`;
                    let doc = this.localCache.get(cacheKey);

                    if (!doc) {
                        // Load from S3 to check filter
                        try {
                            const response = await this.s3Client.send(new GetObjectCommand({
                                Bucket: this.config.bucketName,
                                Key: this.getDocumentKey(docId)
                            }));

                            const docData = await this.streamToString(response.Body);
                            doc = JSON.parse(docData);
                        } catch (error) {
                            continue;
                        }
                    }

                    if (doc && this.matchesFilter(doc, filter)) {
                        documentsToDelete.push(docId);
                    }
                }
            }

            // Delete documents from S3
            const deletePromises = documentsToDelete.map(docId => 
                this.s3Client.send(new DeleteObjectCommand({
                    Bucket: this.config.bucketName,
                    Key: this.getDocumentKey(docId)
                }))
            );

            await Promise.all(deletePromises);

            // Update index
            collection.documents = collection.documents.filter(id => !documentsToDelete.includes(id));
            collection.documentCount -= documentsToDelete.length;
            collection.updatedAt = new Date().toISOString();

            await this.saveIndex();

            // Clear from local cache
            documentsToDelete.forEach(docId => {
                const cacheKey = `${this.config.collectionName}:${docId}`;
                this.localCache.delete(cacheKey);
            });

            console.log(`[S3VECTORS] ✅ Deleted ${documentsToDelete.length} documents`);
            return documentsToDelete.length;
        } catch (error) {
            console.error(`[S3VECTORS] Failed to delete documents: ${error}`);
            throw error;
        }
    }

    async clearCollection(): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[S3VECTORS] Clearing all documents from collection "${this.config.collectionName}"...`);

        try {
            if (!this.indexCache?.collections[this.config.collectionName]) {
                console.log(`[S3VECTORS] Collection "${this.config.collectionName}" does not exist`);
                return;
            }

            const collection = this.indexCache.collections[this.config.collectionName];
            
            // Delete all documents
            const deletePromises = collection.documents.map(docId => 
                this.s3Client.send(new DeleteObjectCommand({
                    Bucket: this.config.bucketName,
                    Key: this.getDocumentKey(docId)
                }))
            );

            await Promise.all(deletePromises);

            // Clear collection metadata
            collection.documents = [];
            collection.documentCount = 0;
            collection.updatedAt = new Date().toISOString();

            await this.saveIndex();

            // Clear local cache
            for (const key of this.localCache.keys()) {
                if (key.startsWith(`${this.config.collectionName}:`)) {
                    this.localCache.delete(key);
                }
            }

            console.log(`[S3VECTORS] ✅ Collection cleared successfully`);
        } catch (error) {
            console.error(`[S3VECTORS] Failed to clear collection: ${error}`);
            throw error;
        }
    }

    async getDocumentCount(): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        const collection = this.indexCache?.collections[this.config.collectionName];
        return collection?.documentCount || 0;
    }

    // S3 Vectors specific utility methods
    async getCollectionInfo(): Promise<any> {
        if (!this.isInitialized) {
            await this.connect();
        }

        const collection = this.indexCache?.collections[this.config.collectionName];
        
        if (!collection) {
            throw new Error(`Collection "${this.config.collectionName}" does not exist`);
        }

        return {
            name: this.config.collectionName,
            dimension: collection.dimension,
            metric: collection.metric,
            documentCount: collection.documentCount,
            createdAt: collection.createdAt,
            updatedAt: collection.updatedAt,
            storageInfo: {
                bucket: this.config.bucketName,
                region: this.config.region,
                prefix: this.config.prefix,
                storageClass: this.config.storageClass,
                compressionLevel: this.config.compressionLevel
            }
        };
    }

    async getCacheStats(): Promise<any> {
        return {
            cacheSize: this.localCache.size,
            maxCacheSize: this.config.cacheSize,
            cacheHitRate: this.localCache.size / Math.max(await this.getDocumentCount(), 1),
            localCachePath: this.config.localCachePath
        };
    }

    async exportCollection(exportPath: string): Promise<void> {
        console.log(`[S3VECTORS] Exporting collection to ${exportPath}...`);
        
        if (!this.indexCache?.collections[this.config.collectionName]) {
            throw new Error(`Collection "${this.config.collectionName}" does not exist`);
        }

        const collection = this.indexCache.collections[this.config.collectionName];
        const allDocuments: S3VectorDocument[] = [];

        // Load all documents
        for (const docId of collection.documents) {
            try {
                const response = await this.s3Client.send(new GetObjectCommand({
                    Bucket: this.config.bucketName,
                    Key: this.getDocumentKey(docId)
                }));

                const docData = await this.streamToString(response.Body);
                allDocuments.push(JSON.parse(docData));
            } catch (error) {
                console.warn(`[S3VECTORS] Failed to export document ${docId}: ${error}`);
            }
        }

        // Write to file
        fs.writeFileSync(exportPath, JSON.stringify({
            collection: this.config.collectionName,
            metadata: collection,
            documents: allDocuments
        }, null, 2));

        console.log(`[S3VECTORS] ✅ Exported ${allDocuments.length} documents to ${exportPath}`);
    }
}