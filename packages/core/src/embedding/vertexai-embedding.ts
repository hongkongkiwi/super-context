import { PredictionServiceClient } from '@google-cloud/aiplatform';
import { Embedding, EmbeddingVector } from './base-embedding';

export interface VertexAIEmbeddingConfig {
    projectId: string;
    location: string;
    model: string;
    keyFilename?: string;
    credentials?: any;
}

export class VertexAIEmbedding extends Embedding {
    protected maxTokens: number = 3072; // Vertex AI embedding models typically support larger context
    private client: PredictionServiceClient;
    private projectId: string;
    private location: string;
    private model: string;

    constructor(config: VertexAIEmbeddingConfig) {
        super();
        this.projectId = config.projectId;
        this.location = config.location;
        this.model = config.model;
        
        this.client = new PredictionServiceClient({
            ...(config.keyFilename && { keyFilename: config.keyFilename }),
            ...(config.credentials && { credentials: config.credentials })
        });
    }

    private getEndpoint(): string {
        return `projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}`;
    }

    protected async embedInternal(text: string): Promise<EmbeddingVector> {
        const processedText = this.preprocessText(text);
        try {
            const instances = [
                {
                    content: processedText,
                    task_type: "RETRIEVAL_DOCUMENT"
                }
            ];

            const request = {
                endpoint: this.getEndpoint(),
                instances: instances.map(instance => ({
                    structValue: {
                        fields: {
                            content: { stringValue: instance.content },
                            task_type: { stringValue: instance.task_type }
                        }
                    }
                }))
            };

            const [response] = await this.client.predict(request);
            
            if (!response.predictions || response.predictions.length === 0) {
                throw new Error('No embedding data received from Vertex AI');
            }

            const prediction = response.predictions[0];
            const embeddings = prediction.structValue?.fields?.embeddings;
            
            if (!embeddings?.structValue?.fields?.values?.listValue?.values) {
                throw new Error('Invalid embedding response format from Vertex AI');
            }

            const vector = embeddings.structValue.fields.values.listValue.values.map(
                (v: any) => v.numberValue
            );

            return {
                vector,
                dimension: vector.length
            };
        } catch (error) {
            console.error('Error getting Vertex AI embedding:', error);
            throw error;
        }
    }

    protected async embedBatchInternal(texts: string[]): Promise<EmbeddingVector[]> {
        const processedTexts = this.preprocessTexts(texts);
        try {
            console.log(`🚀 Getting embeddings for ${texts.length} texts using Vertex AI model: ${this.model}`);

            // Process texts in batches to avoid API limits
            const batchSize = 100; // Vertex AI supports larger batches
            const results: EmbeddingVector[] = [];

            for (let i = 0; i < processedTexts.length; i += batchSize) {
                const batch = processedTexts.slice(i, i + batchSize);
                console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(processedTexts.length / batchSize)}`);

                try {
                    const instances = batch.map(text => ({
                        content: text,
                        task_type: "RETRIEVAL_DOCUMENT"
                    }));

                    const request = {
                        endpoint: this.getEndpoint(),
                        instances: instances.map(instance => ({
                            structValue: {
                                fields: {
                                    content: { stringValue: instance.content },
                                    task_type: { stringValue: instance.task_type }
                                }
                            }
                        }))
                    };

                    const [response] = await this.client.predict(request);
                    
                    if (!response.predictions || response.predictions.length === 0) {
                        throw new Error('No embedding data received from Vertex AI');
                    }

                    const batchResults = response.predictions.map((prediction: any) => {
                        const embeddings = prediction.structValue?.fields?.embeddings;
                        
                        if (!embeddings?.structValue?.fields?.values?.listValue?.values) {
                            throw new Error('Invalid embedding response format from Vertex AI');
                        }

                        const vector = embeddings.structValue.fields.values.listValue.values.map(
                            (v: any) => v.numberValue
                        );

                        return {
                            vector,
                            dimension: vector.length
                        };
                    });

                    results.push(...batchResults);

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
            console.error('Error in Vertex AI batch embedding:', error);
            throw error;
        }
    }

    getDimension(): number {
        // Common dimensions for Vertex AI embedding models
        const modelDimensions: Record<string, number> = {
            'textembedding-gecko@001': 768,
            'textembedding-gecko@003': 768,
            'textembedding-gecko-multilingual@001': 768,
            'text-embedding-004': 768,
            'text-multilingual-embedding-002': 768,
            'multimodalembedding@001': 1408,
        };

        const dimension = modelDimensions[this.model];
        if (dimension) {
            return dimension;
        }

        // Try to infer from model name patterns
        if (this.model.includes('gecko')) {
            return 768;
        } else if (this.model.includes('multimodal')) {
            return 1408;
        }

        console.warn(`Unknown dimension for Vertex AI model: ${this.model}. Using default dimension 768.`);
        console.warn('Please verify the correct dimension for your model and update the modelDimensions mapping.');
        return 768; // Default fallback
    }

    getModel(): string {
        return this.model;
    }

    getProvider(): string {
        return 'VertexAI';
    }

    async detectDimension(testText?: string): Promise<number> {
        const text = testText || 'test';
        const result = await this.embed(text);
        return result.dimension;
    }
}