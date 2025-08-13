import OpenAI from 'openai';
import { Embedding, EmbeddingVector } from './base-embedding';

export interface OpenRouterEmbeddingConfig {
    apiKey: string;
    model: string;
    baseUrl?: string;
}

export class OpenRouterEmbedding extends Embedding {
    protected maxTokens: number = 8192; // OpenRouter typically supports larger context windows
    private client: OpenAI;
    private model: string;

    constructor(config: OpenRouterEmbeddingConfig) {
        super();
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseUrl || 'https://openrouter.ai/api/v1',
        });
        this.model = config.model;
    }

    protected async embedInternal(text: string): Promise<EmbeddingVector> {
        const processedText = this.preprocessText(text);
        try {
            const response = await this.client.embeddings.create({
                model: this.model,
                input: processedText,
                encoding_format: 'float',
            });

            if (!response.data || response.data.length === 0) {
                throw new Error('No embedding data received from OpenRouter');
            }

            const vector = response.data[0].embedding;
            return {
                vector,
                dimension: vector.length
            };
        } catch (error) {
            console.error('Error getting OpenRouter embedding:', error);
            throw error;
        }
    }

    protected async embedBatchInternal(texts: string[]): Promise<EmbeddingVector[]> {
        const processedTexts = this.preprocessTexts(texts);
        try {
            console.log(`🚀 Getting embeddings for ${texts.length} texts using OpenRouter model: ${this.model}`);

            // Process texts in batches to avoid API limits
            const batchSize = 100; // OpenRouter typically supports larger batches
            const results: EmbeddingVector[] = [];

            for (let i = 0; i < processedTexts.length; i += batchSize) {
                const batch = processedTexts.slice(i, i + batchSize);
                console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(processedTexts.length / batchSize)}`);

                try {
                    const response = await this.client.embeddings.create({
                        model: this.model,
                        input: batch,
                        encoding_format: 'float',
                    });

                    if (!response.data || response.data.length === 0) {
                        throw new Error('No embedding data received from OpenRouter');
                    }

                    // Extract embeddings and maintain order
                    const batchEmbeddings = response.data.map(item => ({
                        vector: item.embedding,
                        dimension: item.embedding.length
                    }));
                    results.push(...batchEmbeddings);

                    // Add small delay between batches to respect rate limits
                    if (i + batchSize < processedTexts.length) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                } catch (error) {
                    console.error(`Error processing batch ${Math.floor(i / batchSize) + 1}:`, error);
                    throw error;
                }
            }

            console.log(`✅ Successfully generated ${results.length} embeddings`);
            return results;
        } catch (error) {
            console.error('Error in OpenRouter batch embedding:', error);
            throw error;
        }
    }

    getDimension(): number {
        // Common dimensions for OpenRouter embedding models
        const modelDimensions: Record<string, number> = {
            // OpenAI models available through OpenRouter
            'openai/text-embedding-3-small': 1536,
            'openai/text-embedding-3-large': 3072,
            'openai/text-embedding-ada-002': 1536,
            
            // Cohere models
            'cohere/embed-english-v3.0': 1024,
            'cohere/embed-multilingual-v3.0': 1024,
            
            // Other models that might be available
            'voyage/voyage-large-2-instruct': 1024,
            'voyage/voyage-code-2': 1536,
        };

        const dimension = modelDimensions[this.model];
        if (dimension) {
            return dimension;
        }

        // Try to infer from model name patterns
        if (this.model.includes('3-large')) {
            return 3072;
        } else if (this.model.includes('3-small') || this.model.includes('ada-002')) {
            return 1536;
        } else if (this.model.includes('cohere')) {
            return 1024;
        }

        console.warn(`Unknown dimension for OpenRouter model: ${this.model}. Using default dimension 1536.`);
        console.warn('Please verify the correct dimension for your model and update the modelDimensions mapping.');
        return 1536; // Default fallback (common for many embedding models)
    }

    getModel(): string {
        return this.model;
    }

    getProvider(): string {
        return 'OpenRouter';
    }

    async detectDimension(testText?: string): Promise<number> {
        const text = testText || 'test';
        const result = await this.embed(text);
        return result.dimension;
    }
}