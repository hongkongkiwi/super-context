import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromIni, fromNodeProviderChain, fromEnv } from '@aws-sdk/credential-providers';
import { Embedding, EmbeddingVector } from './base-embedding';

export interface BedrockEmbeddingConfig {
    region: string;
    model: string;
    // Explicit credentials (optional - will use AWS credential chain if not provided)
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    // AWS profile (optional)
    profile?: string;
    // Additional AWS client configuration
    roleArn?: string;
    roleSessionName?: string;
    externalId?: string;
}

export class BedrockEmbedding extends Embedding {
    protected maxTokens: number = 8192; // AWS Bedrock models typically support larger context
    private client: BedrockRuntimeClient;
    private model: string;

    constructor(config: BedrockEmbeddingConfig) {
        super();
        this.model = config.model;
        
        // Create client configuration
        const clientConfig: any = {
            region: config.region,
        };

        // Configure credentials based on what's available
        if (config.accessKeyId && config.secretAccessKey) {
            // Use explicit credentials
            console.log(`[BEDROCK] Using explicit AWS credentials`);
            clientConfig.credentials = {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
                ...(config.sessionToken && { sessionToken: config.sessionToken })
            };
        } else if (config.profile) {
            // Use specific AWS profile
            console.log(`[BEDROCK] Using AWS profile: ${config.profile}`);
            clientConfig.credentials = fromIni({ profile: config.profile });
        } else {
            // Use default AWS credential provider chain which automatically handles:
            // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
            // 2. AWS_PROFILE environment variable
            // 3. Web identity token from AWS_WEB_IDENTITY_TOKEN_FILE
            // 4. Shared credentials file (~/.aws/credentials)
            // 5. Shared config file (~/.aws/config)
            // 6. ECS container credentials
            // 7. EC2 instance metadata credentials
            // 8. SSO credentials
            console.log(`[BEDROCK] Using default AWS credential provider chain`);
            clientConfig.credentials = fromNodeProviderChain();
        }

        this.client = new BedrockRuntimeClient(clientConfig);
    }

    private async invokeModel(inputText: string | string[]): Promise<any> {
        let body: any;
        
        // Different models have different input formats
        if (this.model.includes('amazon.titan-embed')) {
            body = {
                inputText: Array.isArray(inputText) ? inputText[0] : inputText
            };
        } else if (this.model.includes('cohere.embed')) {
            body = {
                texts: Array.isArray(inputText) ? inputText : [inputText],
                input_type: "search_document"
            };
        } else {
            // Default format for most models
            body = {
                input: Array.isArray(inputText) ? inputText : [inputText]
            };
        }

        const command = new InvokeModelCommand({
            modelId: this.model,
            body: JSON.stringify(body),
            contentType: 'application/json',
            accept: 'application/json'
        });

        const response = await this.client.send(command);
        
        if (!response.body) {
            throw new Error('No response body received from Bedrock');
        }

        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        return responseBody;
    }

    protected async embedInternal(text: string): Promise<EmbeddingVector> {
        const processedText = this.preprocessText(text);
        try {
            const response = await this.invokeModel(processedText);
            
            let vector: number[];
            
            // Handle different response formats based on model
            if (this.model.includes('amazon.titan-embed')) {
                if (!response.embedding) {
                    throw new Error('No embedding data received from Titan model');
                }
                vector = response.embedding;
            } else if (this.model.includes('cohere.embed')) {
                if (!response.embeddings || response.embeddings.length === 0) {
                    throw new Error('No embedding data received from Cohere model');
                }
                vector = response.embeddings[0];
            } else {
                // Default format
                if (!response.embedding && !response.embeddings) {
                    throw new Error('No embedding data received from Bedrock model');
                }
                vector = response.embedding || response.embeddings[0];
            }

            return {
                vector,
                dimension: vector.length
            };
        } catch (error) {
            console.error('Error getting Bedrock embedding:', error);
            throw error;
        }
    }

    protected async embedBatchInternal(texts: string[]): Promise<EmbeddingVector[]> {
        const processedTexts = this.preprocessTexts(texts);
        try {
            console.log(`🚀 Getting embeddings for ${texts.length} texts using Bedrock model: ${this.model}`);

            const results: EmbeddingVector[] = [];

            // Most Bedrock models process one text at a time for embeddings
            // Cohere models can handle batches
            if (this.model.includes('cohere.embed')) {
                // Process in batches for Cohere
                const batchSize = 96; // Cohere supports up to 96 texts per request
                
                for (let i = 0; i < processedTexts.length; i += batchSize) {
                    const batch = processedTexts.slice(i, i + batchSize);
                    console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(processedTexts.length / batchSize)}`);

                    try {
                        const response = await this.invokeModel(batch);
                        
                        if (!response.embeddings || response.embeddings.length === 0) {
                            throw new Error('No embedding data received from Cohere model');
                        }

                        const batchResults = response.embeddings.map((embedding: number[]) => ({
                            vector: embedding,
                            dimension: embedding.length
                        }));

                        results.push(...batchResults);

                        // Add small delay between batches
                        if (i + batchSize < processedTexts.length) {
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    } catch (error) {
                        console.error(`Error processing batch ${Math.floor(i / batchSize) + 1}:`, error);
                        throw error;
                    }
                }
            } else {
                // Process one by one for other models (Titan, etc.)
                for (let i = 0; i < processedTexts.length; i++) {
                    if (i % 10 === 0) {
                        console.log(`📦 Processing ${i + 1}/${processedTexts.length} texts`);
                    }

                    try {
                        const result = await this.embed(processedTexts[i]);
                        results.push(result);

                        // Add small delay to respect rate limits
                        if (i < processedTexts.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 50));
                        }
                    } catch (error) {
                        console.error(`Error processing text ${i + 1}:`, error);
                        throw error;
                    }
                }
            }

            console.log(`✅ Successfully generated ${results.length} embeddings`);
            return results;
        } catch (error) {
            console.error('Error in Bedrock batch embedding:', error);
            throw error;
        }
    }

    getDimension(): number {
        // Common dimensions for AWS Bedrock embedding models
        const modelDimensions: Record<string, number> = {
            'amazon.titan-embed-text-v1': 1536,
            'amazon.titan-embed-text-v2:0': 1024,
            'cohere.embed-english-v3': 1024,
            'cohere.embed-multilingual-v3': 1024,
        };

        const dimension = modelDimensions[this.model];
        if (dimension) {
            return dimension;
        }

        // Try to infer from model name patterns
        if (this.model.includes('titan-embed-text-v1')) {
            return 1536;
        } else if (this.model.includes('titan-embed-text-v2')) {
            return 1024;
        } else if (this.model.includes('cohere.embed')) {
            return 1024;
        }

        console.warn(`Unknown dimension for Bedrock model: ${this.model}. Using default dimension 1536.`);
        console.warn('Please verify the correct dimension for your model and update the modelDimensions mapping.');
        return 1536; // Default fallback
    }

    getModel(): string {
        return this.model;
    }

    getProvider(): string {
        return 'Bedrock';
    }

    async detectDimension(testText?: string): Promise<number> {
        const text = testText || 'test';
        const result = await this.embed(text);
        return result.dimension;
    }
}