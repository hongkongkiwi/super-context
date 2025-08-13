import { EmbeddingCache, ResilienceHandler, RateLimiterOptions, CircuitBreakerOptions } from '../utils';

// Interface definitions
export interface EmbeddingVector {
    vector: number[];
    dimension: number;
}

export interface EmbeddingOptions {
    enableCache?: boolean;
    cacheOptions?: {
        maxSize?: number;
        ttlMs?: number;
    };
    rateLimiterOptions?: RateLimiterOptions;
    circuitBreakerOptions?: CircuitBreakerOptions;
}

/**
 * Abstract base class for embedding implementations with caching and resilience
 */
export abstract class Embedding {
    protected abstract maxTokens: number;
    protected cache?: EmbeddingCache;
    protected resilienceHandler?: ResilienceHandler;
    private cacheHits = 0;
    private cacheMisses = 0;

    constructor(options: EmbeddingOptions = {}) {
        // Initialize cache if enabled
        if (options.enableCache !== false) {
            this.cache = new EmbeddingCache(options.cacheOptions);
        }

        // Initialize resilience handler if options provided
        if (options.rateLimiterOptions || options.circuitBreakerOptions) {
            this.resilienceHandler = new ResilienceHandler(
                options.rateLimiterOptions,
                options.circuitBreakerOptions
            );
        }
    }

    /**
     * Preprocess text to ensure it's valid for embedding
     * @param text Input text
     * @returns Processed text
     */
    protected preprocessText(text: string): string {
        // Replace empty string with single space
        if (text === '') {
            return ' ';
        }

        // Simple character-based truncation (approximation)
        // Each token is roughly 4 characters on average for English text
        const maxChars = this.maxTokens * 4;
        if (text.length > maxChars) {
            return text.substring(0, maxChars);
        }

        return text;
    }

    /**
     * Detect embedding dimension 
     * @param testText Test text for dimension detection
     * @returns Embedding dimension
     */
    abstract detectDimension(testText?: string): Promise<number>;

    /**
     * Preprocess array of texts
     * @param texts Array of input texts
     * @returns Array of processed texts
     */
    protected preprocessTexts(texts: string[]): string[] {
        return texts.map(text => this.preprocessText(text));
    }

    // Abstract methods that must be implemented by subclasses
    /**
     * Generate text embedding vector with caching
     * @param text Text content
     * @returns Embedding vector
     */
    async embed(text: string): Promise<EmbeddingVector> {
        // Check cache first
        if (this.cache) {
            const cached = this.cache.get(text);
            if (cached) {
                this.cacheHits++;
                return {
                    vector: cached,
                    dimension: cached.length
                };
            }
            this.cacheMisses++;
        }

        // Generate embedding with resilience
        const embedding = await this.executeWithResilience(() => 
            this.embedInternal(text)
        );

        // Store in cache
        if (this.cache) {
            this.cache.set(text, embedding.vector);
        }

        return embedding;
    }

    /**
     * Internal embed method to be implemented by subclasses
     */
    protected abstract embedInternal(text: string): Promise<EmbeddingVector>;

    /**
     * Generate text embedding vectors in batch with caching
     * @param texts Text array
     * @returns Embedding vector array
     */
    async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
        const results: EmbeddingVector[] = [];
        const uncachedTexts: string[] = [];
        const uncachedIndices: number[] = [];

        // Check cache for each text
        if (this.cache) {
            for (let i = 0; i < texts.length; i++) {
                const cached = this.cache.get(texts[i]);
                if (cached) {
                    this.cacheHits++;
                    results[i] = {
                        vector: cached,
                        dimension: cached.length
                    };
                } else {
                    this.cacheMisses++;
                    uncachedTexts.push(texts[i]);
                    uncachedIndices.push(i);
                }
            }
        } else {
            uncachedTexts.push(...texts);
            uncachedIndices.push(...texts.map((_, i) => i));
        }

        // Generate embeddings for uncached texts
        if (uncachedTexts.length > 0) {
            const embeddings = await this.executeWithResilience(() =>
                this.embedBatchInternal(uncachedTexts)
            );

            // Store in cache and results
            for (let i = 0; i < embeddings.length; i++) {
                const index = uncachedIndices[i];
                results[index] = embeddings[i];
                
                if (this.cache) {
                    this.cache.set(uncachedTexts[i], embeddings[i].vector);
                }
            }
        }

        return results;
    }

    /**
     * Internal batch embed method to be implemented by subclasses
     */
    protected abstract embedBatchInternal(texts: string[]): Promise<EmbeddingVector[]>;

    /**
     * Get embedding vector dimension
     * @returns Vector dimension
     */
    abstract getDimension(): number;

    /**
     * Get service provider name
     * @returns Provider name
     */
    abstract getProvider(): string;

    /**
     * Execute operation with resilience patterns
     */
    protected async executeWithResilience<T>(operation: () => Promise<T>): Promise<T> {
        if (this.resilienceHandler) {
            return await this.resilienceHandler.execute(operation);
        }
        return await operation();
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            hits: this.cacheHits,
            misses: this.cacheMisses,
            hitRate: this.cacheHits / (this.cacheHits + this.cacheMisses || 1),
            ...(this.cache ? this.cache.getStats() : {})
        };
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        if (this.cache) {
            this.cache.clear();
        }
        this.cacheHits = 0;
        this.cacheMisses = 0;
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        if (this.cache) {
            this.cache.dispose();
        }
    }
} 