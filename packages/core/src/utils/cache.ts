/**
 * Caching utilities for embeddings and search results
 */

import * as crypto from 'crypto';

export interface CacheOptions {
    maxSize?: number;
    ttlMs?: number;
    cleanupIntervalMs?: number;
}

export interface CacheEntry<T> {
    value: T;
    timestamp: number;
    accessCount: number;
    size?: number;
}

export interface CacheStats {
    hits: number;
    misses: number;
    evictions: number;
    size: number;
    itemCount: number;
}

/**
 * LRU Cache with TTL support
 */
export class LRUCache<T> {
    private cache = new Map<string, CacheEntry<T>>();
    private accessOrder: string[] = [];
    private readonly maxSize: number;
    private readonly ttlMs: number;
    private readonly cleanupIntervalMs: number;
    private cleanupTimer?: NodeJS.Timeout;
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        size: 0,
        itemCount: 0
    };

    constructor(options: CacheOptions = {}) {
        this.maxSize = options.maxSize || 1000;
        this.ttlMs = options.ttlMs || 3600000; // 1 hour default
        this.cleanupIntervalMs = options.cleanupIntervalMs || 300000; // 5 minutes default
        
        // Start cleanup timer
        this.startCleanupTimer();
    }

    /**
     * Get item from cache
     */
    get(key: string): T | null {
        const entry = this.cache.get(key);
        
        if (!entry) {
            this.stats.misses++;
            return null;
        }

        // Check if expired
        if (this.isExpired(entry)) {
            this.delete(key);
            this.stats.misses++;
            return null;
        }

        // Update access order
        this.updateAccessOrder(key);
        entry.accessCount++;
        
        this.stats.hits++;
        return entry.value;
    }

    /**
     * Set item in cache
     */
    set(key: string, value: T, size?: number): void {
        // Remove if exists to update position
        if (this.cache.has(key)) {
            this.delete(key);
        }

        // Evict if at capacity
        while (this.cache.size >= this.maxSize) {
            this.evictLRU();
        }

        // Add new entry
        const entry: CacheEntry<T> = {
            value,
            timestamp: Date.now(),
            accessCount: 0,
            size
        };

        this.cache.set(key, entry);
        this.accessOrder.push(key);
        this.stats.itemCount++;
        
        if (size) {
            this.stats.size += size;
        }
    }

    /**
     * Delete item from cache
     */
    delete(key: string): boolean {
        const entry = this.cache.get(key);
        if (!entry) return false;

        this.cache.delete(key);
        this.accessOrder = this.accessOrder.filter(k => k !== key);
        this.stats.itemCount--;
        
        if (entry.size) {
            this.stats.size -= entry.size;
        }

        return true;
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
        this.accessOrder = [];
        this.stats.size = 0;
        this.stats.itemCount = 0;
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        return { ...this.stats };
    }

    /**
     * Check if entry is expired
     */
    private isExpired(entry: CacheEntry<T>): boolean {
        return Date.now() - entry.timestamp > this.ttlMs;
    }

    /**
     * Update access order for LRU
     */
    private updateAccessOrder(key: string): void {
        this.accessOrder = this.accessOrder.filter(k => k !== key);
        this.accessOrder.push(key);
    }

    /**
     * Evict least recently used item
     */
    private evictLRU(): void {
        if (this.accessOrder.length === 0) return;

        const key = this.accessOrder.shift();
        if (key) {
            this.delete(key);
            this.stats.evictions++;
        }
    }

    /**
     * Cleanup expired entries
     */
    private cleanup(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];

        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.ttlMs) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            this.delete(key);
        }
    }

    /**
     * Start cleanup timer
     */
    private startCleanupTimer(): void {
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.cleanupIntervalMs);
    }

    /**
     * Stop cleanup timer
     */
    dispose(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
        this.clear();
    }
}

/**
 * Embedding cache with content hashing
 */
export class EmbeddingCache {
    private cache: LRUCache<number[]>;

    constructor(options: CacheOptions = {}) {
        this.cache = new LRUCache<number[]>({
            maxSize: options.maxSize || 10000,
            ttlMs: options.ttlMs || 86400000, // 24 hours default
            cleanupIntervalMs: options.cleanupIntervalMs || 600000 // 10 minutes
        });
    }

    /**
     * Generate cache key from text content
     */
    private generateKey(text: string): string {
        return crypto.createHash('sha256').update(text, 'utf-8').digest('hex');
    }

    /**
     * Get embedding from cache
     */
    get(text: string): number[] | null {
        const key = this.generateKey(text);
        return this.cache.get(key);
    }

    /**
     * Store embedding in cache
     */
    set(text: string, embedding: number[]): void {
        const key = this.generateKey(text);
        // Estimate size: 4 bytes per float
        const size = embedding.length * 4;
        this.cache.set(key, embedding, size);
    }

    /**
     * Get batch of embeddings
     */
    getBatch(texts: string[]): Map<string, number[] | null> {
        const results = new Map<string, number[] | null>();
        
        for (const text of texts) {
            results.set(text, this.get(text));
        }

        return results;
    }

    /**
     * Set batch of embeddings
     */
    setBatch(embeddings: Map<string, number[]>): void {
        for (const [text, embedding] of embeddings.entries()) {
            this.set(text, embedding);
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        return this.cache.getStats();
    }

    /**
     * Clear cache
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Dispose cache
     */
    dispose(): void {
        this.cache.dispose();
    }
}

/**
 * Search result cache with query hashing
 */
export class SearchCache {
    private cache: LRUCache<any[]>;

    constructor(options: CacheOptions = {}) {
        this.cache = new LRUCache<any[]>({
            maxSize: options.maxSize || 1000,
            ttlMs: options.ttlMs || 1800000, // 30 minutes default
            cleanupIntervalMs: options.cleanupIntervalMs || 300000 // 5 minutes
        });
    }

    /**
     * Generate cache key from search parameters
     */
    private generateKey(
        query: string,
        codebasePath: string,
        topK: number,
        threshold?: number,
        filterExpr?: string
    ): string {
        const keyData = {
            query,
            codebasePath,
            topK,
            threshold,
            filterExpr
        };
        
        return crypto.createHash('sha256')
            .update(JSON.stringify(keyData), 'utf-8')
            .digest('hex');
    }

    /**
     * Get search results from cache
     */
    get(
        query: string,
        codebasePath: string,
        topK: number,
        threshold?: number,
        filterExpr?: string
    ): any[] | null {
        const key = this.generateKey(query, codebasePath, topK, threshold, filterExpr);
        return this.cache.get(key);
    }

    /**
     * Store search results in cache
     */
    set(
        query: string,
        codebasePath: string,
        topK: number,
        results: any[],
        threshold?: number,
        filterExpr?: string
    ): void {
        const key = this.generateKey(query, codebasePath, topK, threshold, filterExpr);
        // Estimate size based on result count and average result size
        const estimatedSize = results.length * 1024; // 1KB per result estimate
        this.cache.set(key, results, estimatedSize);
    }

    /**
     * Invalidate cache for a codebase
     */
    invalidateCodebase(codebasePath: string): void {
        // Since we can't efficiently filter by codebase path in the key,
        // we'll clear the entire cache when a codebase is modified
        // In a production system, you might want to maintain a separate index
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        return this.cache.getStats();
    }

    /**
     * Clear cache
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Dispose cache
     */
    dispose(): void {
        this.cache.dispose();
    }
}

/**
 * Collection metadata cache
 */
export class CollectionCache {
    private cache: LRUCache<any>;

    constructor(options: CacheOptions = {}) {
        this.cache = new LRUCache<any>({
            maxSize: options.maxSize || 100,
            ttlMs: options.ttlMs || 300000, // 5 minutes default
            cleanupIntervalMs: options.cleanupIntervalMs || 60000 // 1 minute
        });
    }

    /**
     * Get collection metadata
     */
    get(collectionName: string): any | null {
        return this.cache.get(collectionName);
    }

    /**
     * Set collection metadata
     */
    set(collectionName: string, metadata: any): void {
        this.cache.set(collectionName, metadata);
    }

    /**
     * Invalidate collection
     */
    invalidate(collectionName: string): void {
        this.cache.delete(collectionName);
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        return this.cache.getStats();
    }

    /**
     * Clear cache
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Dispose cache
     */
    dispose(): void {
        this.cache.dispose();
    }
}

/**
 * Unified cache manager
 */
export class CacheManager {
    private embeddingCache: EmbeddingCache;
    private searchCache: SearchCache;
    private collectionCache: CollectionCache;

    constructor(options: {
        embedding?: CacheOptions;
        search?: CacheOptions;
        collection?: CacheOptions;
    } = {}) {
        this.embeddingCache = new EmbeddingCache(options.embedding);
        this.searchCache = new SearchCache(options.search);
        this.collectionCache = new CollectionCache(options.collection);
    }

    /**
     * Get embedding cache
     */
    getEmbeddingCache(): EmbeddingCache {
        return this.embeddingCache;
    }

    /**
     * Get search cache
     */
    getSearchCache(): SearchCache {
        return this.searchCache;
    }

    /**
     * Get collection cache
     */
    getCollectionCache(): CollectionCache {
        return this.collectionCache;
    }

    /**
     * Get all cache statistics
     */
    getAllStats() {
        return {
            embedding: this.embeddingCache.getStats(),
            search: this.searchCache.getStats(),
            collection: this.collectionCache.getStats()
        };
    }

    /**
     * Clear all caches
     */
    clearAll(): void {
        this.embeddingCache.clear();
        this.searchCache.clear();
        this.collectionCache.clear();
    }

    /**
     * Dispose all caches
     */
    dispose(): void {
        this.embeddingCache.dispose();
        this.searchCache.dispose();
        this.collectionCache.dispose();
    }
}