import { VectorDatabase, VectorDocument, VectorSearchResult, SearchOptions, HybridSearchResult, HybridSearchRequest } from './types';

// Firebase Vector Store client - install with: npm install firebase firebase-admin
let firebase: any = null;
let admin: any = null;
try {
    firebase = require('firebase/app');
    admin = require('firebase-admin');
    require('firebase/firestore');
} catch (error) {
    console.warn('[FIREBASE] firebase and firebase-admin not available. Please install them with: npm install firebase firebase-admin');
}

export interface FirebaseVectorStoreConfig {
    // Firebase configuration
    projectId: string;
    // Authentication - either service account or API key
    serviceAccountKey?: string | object; // Path to service account key file or key object
    apiKey?: string;
    authDomain?: string;
    // Collection configuration
    collectionName: string;
    // Vector configuration
    dimension: number;
    metric?: 'cosine' | 'euclidean' | 'dot';
    // Performance settings
    batchSize?: number;
    timeout?: number;
    // Firestore settings
    host?: string;
    ssl?: boolean;
    cacheSizeBytes?: number;
}

interface FirebaseDocument {
    id?: string;
    vector: number[];
    content: string;
    source: string;
    relativePath: string;
    startLine: number;
    endLine: number;
    fileExtension: string;
    metadata: Record<string, any>;
    createdAt: any; // Firestore timestamp
    updatedAt: any; // Firestore timestamp
}

export class FirebaseVectorStore implements VectorDatabase {
    private config: FirebaseVectorStoreConfig;
    private db: any = null;
    private collection: any = null;
    private isInitialized: boolean = false;

    constructor(config: FirebaseVectorStoreConfig) {
        if (!firebase || !admin) {
            throw new Error('firebase and firebase-admin are not available. Please install them with: npm install firebase firebase-admin');
        }

        this.config = {
            metric: 'cosine',
            batchSize: 500, // Firestore batch limit
            timeout: 60000,
            host: 'firestore.googleapis.com',
            ssl: true,
            cacheSizeBytes: 100 * 1024 * 1024, // 100MB cache
            ...config
        };

        if (!this.config.projectId) {
            throw new Error('Firebase project ID is required');
        }

        if (!this.config.collectionName) {
            throw new Error('Firebase collection name is required');
        }

        if (!this.config.dimension || this.config.dimension <= 0) {
            throw new Error('Vector dimension must be a positive integer');
        }
    }

    async connect(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        console.log(`[FIREBASE] Connecting to Firebase project ${this.config.projectId}...`);
        
        try {
            // Initialize Firebase Admin SDK
            if (this.config.serviceAccountKey) {
                const credential = typeof this.config.serviceAccountKey === 'string' 
                    ? admin.credential.cert(require(this.config.serviceAccountKey))
                    : admin.credential.cert(this.config.serviceAccountKey);

                if (!admin.apps.length) {
                    admin.initializeApp({
                        credential: credential,
                        projectId: this.config.projectId
                    });
                }
            } else {
                // Use default credentials (e.g., from environment)
                if (!admin.apps.length) {
                    admin.initializeApp({
                        projectId: this.config.projectId
                    });
                }
            }

            // Get Firestore instance
            this.db = admin.firestore();
            
            // Configure Firestore settings
            if (this.config.host !== 'firestore.googleapis.com' || !this.config.ssl) {
                this.db.settings({
                    host: this.config.host,
                    ssl: this.config.ssl
                });
            }

            // Get collection reference
            this.collection = this.db.collection(this.config.collectionName);

            // Test connection by getting collection metadata
            await this.collection.limit(1).get();
            
            this.isInitialized = true;
            console.log(`[FIREBASE] ✅ Successfully connected to Firebase Firestore`);
        } catch (error) {
            console.error(`[FIREBASE] Failed to connect: ${error}`);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.isInitialized) {
            // Firebase Admin SDK doesn't need explicit disconnection
            // But we can terminate the app if needed
            if (admin.apps.length > 0) {
                await Promise.all(admin.apps.map((app: any) => app?.delete()));
            }
            this.db = null;
            this.collection = null;
            this.isInitialized = false;
            console.log(`[FIREBASE] Disconnected from database`);
        }
    }

    async createCollection(name: string, dimension: number, description?: string): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[FIREBASE] Creating collection "${name}" with dimension ${dimension}...`);

        try {
            // Firestore creates collections automatically when first document is added
            // But we can create a metadata document for the collection
            const metadataRef = this.db.collection('_metadata').doc(name);
            
            const existingMetadata = await metadataRef.get();
            if (existingMetadata.exists) {
                console.log(`[FIREBASE] Collection "${name}" already exists`);
                return;
            }

            await metadataRef.set({
                name,
                dimension,
                description: description || `Vector collection for ${name}`,
                metric: this.config.metric,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                documentCount: 0,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });

            // Update collection reference if this is the target collection
            if (name === this.config.collectionName) {
                this.collection = this.db.collection(name);
            }

            console.log(`[FIREBASE] ✅ Collection "${name}" created successfully`);
        } catch (error) {
            console.error(`[FIREBASE] Failed to create collection "${name}": ${error}`);
            throw error;
        }
    }

    async hasCollection(name: string): Promise<boolean> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const metadataRef = this.db.collection('_metadata').doc(name);
            const doc = await metadataRef.get();
            return doc.exists;
        } catch (error) {
            console.error(`[FIREBASE] Failed to check collection "${name}": ${error}`);
            return false;
        }
    }

    async dropCollection(name: string): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[FIREBASE] Dropping collection "${name}"...`);

        try {
            // Delete all documents in the collection in batches
            const collectionRef = this.db.collection(name);
            await this.deleteCollectionInBatches(collectionRef);

            // Delete metadata document
            await this.db.collection('_metadata').doc(name).delete();
            
            if (name === this.config.collectionName) {
                this.collection = null;
            }
            
            console.log(`[FIREBASE] ✅ Collection "${name}" dropped successfully`);
        } catch (error) {
            console.error(`[FIREBASE] Failed to drop collection "${name}": ${error}`);
            throw error;
        }
    }

    private async deleteCollectionInBatches(collectionRef: any, batchSize: number = 100): Promise<void> {
        let query = collectionRef.limit(batchSize);
        
        return new Promise<void>((resolve, reject) => {
            this.deleteQueryBatch(query, resolve, reject);
        });
    }

    private deleteQueryBatch(query: any, resolve: () => void, reject: (error: any) => void): void {
        query.get()
            .then((snapshot: any) => {
                if (snapshot.size === 0) {
                    return 0;
                }

                const batch = this.db.batch();
                snapshot.docs.forEach((doc: any) => {
                    batch.delete(doc.ref);
                });

                return batch.commit().then(() => {
                    return snapshot.size;
                });
            })
            .then((numDeleted: number) => {
                if (numDeleted === 0) {
                    resolve();
                    return;
                }

                // Recurse on the next process tick to avoid deep stacks
                process.nextTick(() => {
                    this.deleteQueryBatch(query, resolve, reject);
                });
            })
            .catch(reject);
    }

    async listCollections(): Promise<string[]> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const metadataCollection = await this.db.collection('_metadata').get();
            return metadataCollection.docs.map((doc: any) => doc.id);
        } catch (error) {
            console.error(`[FIREBASE] Failed to list collections: ${error}`);
            return [];
        }
    }

    async insertDocuments(documents: VectorDocument[]): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        if (documents.length === 0) {
            return;
        }

        console.log(`[FIREBASE] Inserting ${documents.length} documents...`);

        try {
            // Convert to Firebase document format
            const firebaseDocuments: FirebaseDocument[] = documents.map(doc => ({
                id: doc.id || this.db.collection(this.config.collectionName).doc().id,
                vector: doc.vector,
                content: doc.content,
                source: doc.source,
                relativePath: doc.relativePath,
                startLine: doc.startLine,
                endLine: doc.endLine,
                fileExtension: doc.fileExtension,
                metadata: doc.metadata || {},
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }));

            // Insert in batches (Firestore batch limit is 500 operations)
            const batchSize = this.config.batchSize!;
            const batches = [];
            
            for (let i = 0; i < firebaseDocuments.length; i += batchSize) {
                const batch = this.db.batch();
                const batchDocuments = firebaseDocuments.slice(i, i + batchSize);
                
                batchDocuments.forEach(doc => {
                    const docRef = this.collection.doc(doc.id);
                    batch.set(docRef, doc);
                });
                
                batches.push(batch.commit());
                
                console.log(`[FIREBASE] Prepared batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(firebaseDocuments.length / batchSize)}`);
            }

            // Execute all batches
            await Promise.all(batches);

            // Update collection metadata
            await this.updateCollectionMetadata(firebaseDocuments.length);

            console.log(`[FIREBASE] ✅ Successfully inserted ${documents.length} documents`);
        } catch (error) {
            console.error(`[FIREBASE] Failed to insert documents: ${error}`);
            throw error;
        }
    }

    private async updateCollectionMetadata(addedCount: number): Promise<void> {
        try {
            const metadataRef = this.db.collection('_metadata').doc(this.config.collectionName);
            await metadataRef.update({
                documentCount: admin.firestore.FieldValue.increment(addedCount),
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.warn(`[FIREBASE] Failed to update collection metadata: ${error}`);
        }
    }

    async search(query: number[], options: SearchOptions = {}): Promise<VectorSearchResult[]> {
        if (!this.isInitialized) {
            await this.connect();
        }

        const limit = options.limit || options.topK || 10;
        
        try {
            console.log(`[FIREBASE] Searching for top ${limit} similar vectors...`);
            
            // Since Firestore doesn't have native vector search, we need to:
            // 1. Get all documents (with optional filtering)
            // 2. Compute similarity in memory
            // 3. Sort and return top results
            
            let firestoreQuery = this.collection as any;
            
            // Apply metadata filters first to reduce data transfer
            if (options.filter) {
                firestoreQuery = this.applyFilters(firestoreQuery, options.filter);
            }

            // Get documents (we may need to paginate for large collections)
            const snapshot = await firestoreQuery.get();
            const documents = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
            
            console.log(`[FIREBASE] Retrieved ${documents.length} documents for similarity computation`);

            // Compute similarities
            const similarities = documents.map((doc: any) => {
                const similarity = this.computeSimilarity(query, doc.vector, this.config.metric!);
                return {
                    document: this.convertToVectorDocument(doc),
                    score: similarity,
                    metadata: {
                        firebase_id: doc.id
                    }
                };
            }).filter((result: any) => {
                // Apply threshold filter if provided
                return !options.threshold || result.score >= options.threshold;
            });

            // Sort by similarity score (descending) and take top results
            similarities.sort((a: any, b: any) => b.score - a.score);
            const topResults = similarities.slice(0, limit);

            console.log(`[FIREBASE] Found ${topResults.length} results`);
            return topResults;
        } catch (error) {
            console.error(`[FIREBASE] Search failed: ${error}`);
            throw error;
        }
    }

    private applyFilters(query: any, filter: Record<string, any>): any {
        for (const [key, value] of Object.entries(filter)) {
            if (key === 'id') {
                // Skip ID filter for Firestore query, handle separately
                continue;
            }
            
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                query = query.where(`metadata.${key}`, '==', value);
            } else if (Array.isArray(value)) {
                query = query.where(`metadata.${key}`, 'in', value);
            } else if (typeof value === 'object' && value !== null) {
                // Handle range queries
                if (value.gte !== undefined) query = query.where(`metadata.${key}`, '>=', value.gte);
                if (value.gt !== undefined) query = query.where(`metadata.${key}`, '>', value.gt);
                if (value.lte !== undefined) query = query.where(`metadata.${key}`, '<=', value.lte);
                if (value.lt !== undefined) query = query.where(`metadata.${key}`, '<', value.lt);
            }
        }
        
        return query;
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
                return 1.0 / (1.0 + distance); // Convert distance to similarity
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

    private convertToVectorDocument(firebaseDoc: any): VectorDocument {
        return {
            id: firebaseDoc.id,
            vector: firebaseDoc.vector || [],
            content: firebaseDoc.content || '',
            source: firebaseDoc.source || '',
            relativePath: firebaseDoc.relativePath || '',
            startLine: firebaseDoc.startLine || 0,
            endLine: firebaseDoc.endLine || 0,
            fileExtension: firebaseDoc.fileExtension || '',
            metadata: firebaseDoc.metadata || {}
        };
    }

    async hybridSearch(request: HybridSearchRequest): Promise<HybridSearchResult> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[FIREBASE] Performing hybrid search...`);

        try {
            // Firebase doesn't have native text search, so we'll do vector search
            // and text matching in memory
            const vectorResults = await this.search(request.vector, {
                limit: (request.limit || 10) * 3, // Get more results for text filtering
                filter: request.filter
            });

            let searchResults = vectorResults;

            // Apply text query filtering if provided
            if (request.query && request.query.trim()) {
                const textQuery = request.query.toLowerCase().trim();
                const textResults = vectorResults.filter(result => 
                    result.document.content.toLowerCase().includes(textQuery) ||
                    result.document.source.toLowerCase().includes(textQuery) ||
                    result.document.relativePath.toLowerCase().includes(textQuery)
                );

                // Combine vector and text results with adjusted scoring
                const hybridResults = textResults.map(result => ({
                    ...result,
                    score: result.score * 1.2 // Boost score for text matches
                }));

                // Merge with vector-only results
                const vectorOnlyResults = vectorResults.filter(vr => 
                    !textResults.some(tr => tr.document.id === vr.document.id)
                );

                searchResults = [...hybridResults, ...vectorOnlyResults]
                    .sort((a, b) => b.score - a.score)
                    .slice(0, request.limit || 10);
            }

            console.log(`[FIREBASE] Hybrid search found ${searchResults.length} results`);
            
            return {
                results: searchResults,
                metadata: {
                    searchType: request.query && request.query.trim() ? 'hybrid' : 'vector_only',
                    textBoost: 1.2
                }
            };
        } catch (error) {
            console.error(`[FIREBASE] Hybrid search failed: ${error}`);
            
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

    async deleteDocuments(filter: Record<string, any>): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[FIREBASE] Deleting documents with filter:`, filter);

        try {
            if (filter.id) {
                // Delete by ID(s)
                const ids = Array.isArray(filter.id) ? filter.id : [filter.id];
                
                const batch = this.db.batch();
                ids.forEach((id: string) => {
                    batch.delete(this.collection.doc(id));
                });
                
                await batch.commit();
                await this.updateCollectionMetadata(-ids.length);
                
                console.log(`[FIREBASE] ✅ Deleted ${ids.length} documents by ID`);
                return ids.length;
            } else {
                // Delete by query (Firestore requires getting documents first)
                let query = this.collection as any;
                query = this.applyFilters(query, filter);
                
                const snapshot = await query.get();
                const docsToDelete = snapshot.docs;
                
                if (docsToDelete.length === 0) {
                    console.log(`[FIREBASE] No documents found matching filter`);
                    return 0;
                }

                // Delete in batches
                const batchSize = 500;
                let deletedCount = 0;
                
                for (let i = 0; i < docsToDelete.length; i += batchSize) {
                    const batch = this.db.batch();
                    const batchDocs = docsToDelete.slice(i, i + batchSize);
                    
                    batchDocs.forEach((doc: any) => {
                        batch.delete(doc.ref);
                    });
                    
                    await batch.commit();
                    deletedCount += batchDocs.length;
                }
                
                await this.updateCollectionMetadata(-deletedCount);
                
                console.log(`[FIREBASE] ✅ Deleted ${deletedCount} documents by filter`);
                return deletedCount;
            }
        } catch (error) {
            console.error(`[FIREBASE] Failed to delete documents: ${error}`);
            throw error;
        }
    }

    async clearCollection(): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[FIREBASE] Clearing all documents from collection "${this.config.collectionName}"...`);

        try {
            await this.deleteCollectionInBatches(this.collection);
            
            // Reset collection metadata
            const metadataRef = this.db.collection('_metadata').doc(this.config.collectionName);
            await metadataRef.update({
                documentCount: 0,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
            
            console.log(`[FIREBASE] ✅ Collection cleared successfully`);
        } catch (error) {
            console.error(`[FIREBASE] Failed to clear collection: ${error}`);
            throw error;
        }
    }

    async getDocumentCount(): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const metadataRef = this.db.collection('_metadata').doc(this.config.collectionName);
            const doc = await metadataRef.get();
            
            if (doc.exists) {
                return doc.data()?.documentCount || 0;
            }
            
            // Fallback: count documents directly (expensive operation)
            const snapshot = await this.collection.get();
            return snapshot.size;
        } catch (error) {
            console.error(`[FIREBASE] Failed to get document count: ${error}`);
            return 0;
        }
    }

    // Firebase-specific utility methods
    async getCollectionInfo(): Promise<any> {
        if (!this.isInitialized) {
            await this.connect();
        }

        try {
            const metadataRef = this.db.collection('_metadata').doc(this.config.collectionName);
            const doc = await metadataRef.get();
            
            if (doc.exists) {
                return {
                    ...doc.data(),
                    config: this.config
                };
            }
            
            return {
                name: this.config.collectionName,
                dimension: this.config.dimension,
                metric: this.config.metric,
                documentCount: await this.getDocumentCount(),
                config: this.config
            };
        } catch (error) {
            console.error(`[FIREBASE] Failed to get collection info: ${error}`);
            throw error;
        }
    }

    async createIndex(fields: string[]): Promise<void> {
        console.log(`[FIREBASE] Firebase Firestore automatically creates indexes. Consider creating composite indexes in the Firebase Console for fields: ${fields.join(', ')}`);
        console.log(`[FIREBASE] Visit: https://console.firebase.google.com/project/${this.config.projectId}/firestore/indexes`);
    }
}