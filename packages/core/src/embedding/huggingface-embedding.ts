// Lazy import holder for test-time mocking
let HfInferenceImport: any | null = null;
import { Embedding, EmbeddingVector } from './base-embedding';

export interface HuggingFaceEmbeddingConfig {
    apiKey: string;
    model: string;
    baseUrl?: string;
}

export class HuggingFaceEmbedding extends Embedding {
    protected maxTokens: number = 512; // HuggingFace models typically have smaller context windows
    private client: any;
    private model: string;
    private apiKey: string;

    constructor(config: HuggingFaceEmbeddingConfig) {
        super();
        if (!config.apiKey || config.apiKey.trim() === '') {
            throw new Error('HuggingFace API key is required');
        }
        this.client = null;
        this.model = config.model;
        this.apiKey = config.apiKey;
    }

    private async getClient(): Promise<any> {
        if (this.client) return this.client;
        if (!HfInferenceImport) {
            const mod = await import('@huggingface/inference');
            HfInferenceImport = (mod as any).HfInference || (mod as any).default || mod;
        }
        this.client = new HfInferenceImport(this.getApiKey());
        return this.client;
    }

    private getApiKey(): string { return this.apiKey; }

    protected async embedInternal(text: string): Promise<EmbeddingVector> {
        const processedText = this.preprocessText(text);
        try {
            const client = await this.getClient();
            const response = await client.featureExtraction({
                model: this.model,
                inputs: processedText,
            });

            // Handle different response formats from HuggingFace
            let vector: number[];
            if (Array.isArray(response)) {
                // If response is a 2D array, take the first row
                if (Array.isArray(response[0])) {
                    vector = response[0] as number[];
                } else {
                    // If response is a 1D array of numbers
                    vector = response as number[];
                }
            } else {
                throw new Error('Unexpected response format from HuggingFace API');
            }

            return {
                vector,
                dimension: vector.length
            };
        } catch (error) {
            console.error('Error getting HuggingFace embedding:', error);
            throw error;
        }
    }

    protected async embedBatchInternal(texts: string[]): Promise<EmbeddingVector[]> {
        const processedTexts = this.preprocessTexts(texts);
        try {
            console.log(`🚀 Getting embeddings for ${texts.length} texts using HuggingFace model: ${this.model}`);

            // Process texts in batches to avoid API limits
            const batchSize = 10;
            const results: EmbeddingVector[] = [];

            for (let i = 0; i < processedTexts.length; i += batchSize) {
                const batch = processedTexts.slice(i, i + batchSize);
                console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(processedTexts.length / batchSize)}`);

                const batchPromises = batch.map(async (text) => {
                    try {
                        const client = await this.getClient();
                        const response = await client.featureExtraction({
                            model: this.model,
                            inputs: text,
                        });

                        // Handle different response formats from HuggingFace
                        let vector: number[];
                        if (Array.isArray(response)) {
                            // If response is a 2D array, take the first row
                            if (Array.isArray(response[0])) {
                                vector = response[0] as number[];
                            } else {
                                // If response is a 1D array of numbers
                                vector = response as number[];
                            }
                        } else {
                            throw new Error('Unexpected response format from HuggingFace API');
                        }

                        return {
                            vector,
                            dimension: vector.length
                        };
                    } catch (error) {
                        console.error(`Error processing text: ${text.slice(0, 100)}...`, error);
                        throw error;
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);

                // Add small delay between batches to respect rate limits
                if (i + batchSize < processedTexts.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            console.log(`✅ Successfully generated ${results.length} embeddings`);
            return results;
        } catch (error) {
            console.error('Error in HuggingFace batch embedding:', error);
            throw error;
        }
    }

    getDimension(): number {
        // Common dimensions for popular HuggingFace embedding models
        const modelDimensions: Record<string, number> = {
            'sentence-transformers/all-MiniLM-L6-v2': 384,
            'sentence-transformers/all-MiniLM-L12-v2': 384,
            'sentence-transformers/all-mpnet-base-v2': 768,
            'sentence-transformers/all-distilroberta-v1': 768,
            'BAAI/bge-small-en-v1.5': 384,
            'BAAI/bge-base-en-v1.5': 768,
            'BAAI/bge-large-en-v1.5': 1024,
            'thenlper/gte-small': 384,
            'thenlper/gte-base': 768,
            'thenlper/gte-large': 1024,
            'intfloat/e5-small-v2': 384,
            'intfloat/e5-base-v2': 768,
            'intfloat/e5-large-v2': 1024,
            'intfloat/multilingual-e5-small': 384,
            'intfloat/multilingual-e5-base': 768,
            'intfloat/multilingual-e5-large': 1024,
        };

        const dimension = modelDimensions[this.model];
        if (dimension) {
            return dimension;
        }

        console.warn(`Unknown dimension for HuggingFace model: ${this.model}. Using default dimension 768.`);
        console.warn('Please verify the correct dimension for your model and update the modelDimensions mapping.');
        return 768; // Default fallback
    }

    getModel(): string {
        return this.model;
    }

    getProvider(): string {
        return 'huggingface';
    }

    async detectDimension(testText?: string): Promise<number> {
        const text = testText || 'test';
        const result = await this.embed(text);
        return result.dimension;
    }
}