import { OpenAIEmbedding, VoyageAIEmbedding, GeminiEmbedding, OllamaEmbedding, HuggingFaceEmbedding, OpenRouterEmbedding, VertexAIEmbedding, BedrockEmbedding } from "@hongkongkiwi/super-context-core";
import { ContextMcpConfig } from "./config.js";

// Helper function to create embedding instance based on provider
export function createEmbeddingInstance(config: ContextMcpConfig): OpenAIEmbedding | VoyageAIEmbedding | GeminiEmbedding | OllamaEmbedding | HuggingFaceEmbedding | OpenRouterEmbedding | VertexAIEmbedding | BedrockEmbedding {
    console.log(`[EMBEDDING] Creating ${config.embeddingProvider} embedding instance...`);

    switch (config.embeddingProvider) {
        case 'OpenAI':
            if (!config.openaiApiKey) {
                console.error(`[EMBEDDING] ❌ OpenAI API key is required but not provided`);
                throw new Error('OPENAI_API_KEY is required for OpenAI embedding provider');
            }
            console.log(`[EMBEDDING] 🔧 Configuring OpenAI with model: ${config.embeddingModel}`);
            const openaiEmbedding = new OpenAIEmbedding({
                apiKey: config.openaiApiKey,
                model: config.embeddingModel,
                ...(config.openaiBaseUrl && { baseURL: config.openaiBaseUrl })
            });
            console.log(`[EMBEDDING] ✅ OpenAI embedding instance created successfully`);
            return openaiEmbedding;

        case 'VoyageAI':
            if (!config.voyageaiApiKey) {
                console.error(`[EMBEDDING] ❌ VoyageAI API key is required but not provided`);
                throw new Error('VOYAGEAI_API_KEY is required for VoyageAI embedding provider');
            }
            console.log(`[EMBEDDING] 🔧 Configuring VoyageAI with model: ${config.embeddingModel}`);
            const voyageEmbedding = new VoyageAIEmbedding({
                apiKey: config.voyageaiApiKey,
                model: config.embeddingModel
            });
            console.log(`[EMBEDDING] ✅ VoyageAI embedding instance created successfully`);
            return voyageEmbedding;

        case 'Gemini':
            if (!config.geminiApiKey) {
                console.error(`[EMBEDDING] ❌ Gemini API key is required but not provided`);
                throw new Error('GEMINI_API_KEY is required for Gemini embedding provider');
            }
            console.log(`[EMBEDDING] 🔧 Configuring Gemini with model: ${config.embeddingModel}`);
            const geminiEmbedding = new GeminiEmbedding({
                apiKey: config.geminiApiKey,
                model: config.embeddingModel
            });
            console.log(`[EMBEDDING] ✅ Gemini embedding instance created successfully`);
            return geminiEmbedding;

        case 'Ollama':
            const ollamaHost = config.ollamaHost || 'http://127.0.0.1:11434';
            console.log(`[EMBEDDING] 🔧 Configuring Ollama with model: ${config.embeddingModel}, host: ${ollamaHost}`);
            const ollamaEmbedding = new OllamaEmbedding({
                model: config.embeddingModel,
                host: config.ollamaHost
            });
            console.log(`[EMBEDDING] ✅ Ollama embedding instance created successfully`);
            return ollamaEmbedding;

        case 'HuggingFace':
            if (!config.huggingfaceApiKey) {
                console.error(`[EMBEDDING] ❌ HuggingFace API key is required but not provided`);
                throw new Error('HUGGINGFACE_API_KEY is required for HuggingFace embedding provider');
            }
            console.log(`[EMBEDDING] 🔧 Configuring HuggingFace with model: ${config.embeddingModel}`);
            const hfEmbedding = new HuggingFaceEmbedding({
                apiKey: config.huggingfaceApiKey,
                model: config.embeddingModel,
                ...(config.huggingfaceBaseUrl && { baseUrl: config.huggingfaceBaseUrl })
            });
            console.log(`[EMBEDDING] ✅ HuggingFace embedding instance created successfully`);
            return hfEmbedding;

        case 'OpenRouter':
            if (!config.openrouterApiKey) {
                console.error(`[EMBEDDING] ❌ OpenRouter API key is required but not provided`);
                throw new Error('OPENROUTER_API_KEY is required for OpenRouter embedding provider');
            }
            console.log(`[EMBEDDING] 🔧 Configuring OpenRouter with model: ${config.embeddingModel}`);
            const orEmbedding = new OpenRouterEmbedding({
                apiKey: config.openrouterApiKey,
                model: config.embeddingModel,
                ...(config.openrouterBaseUrl && { baseUrl: config.openrouterBaseUrl })
            });
            console.log(`[EMBEDDING] ✅ OpenRouter embedding instance created successfully`);
            return orEmbedding;

        case 'VertexAI':
            if (!config.vertexaiProjectId || !config.vertexaiLocation) {
                console.error(`[EMBEDDING] ❌ VertexAI project ID and location are required but not provided`);
                throw new Error('VERTEXAI_PROJECT_ID and VERTEXAI_LOCATION are required for VertexAI embedding provider');
            }
            console.log(`[EMBEDDING] 🔧 Configuring VertexAI with model: ${config.embeddingModel}`);
            const vertexEmbedding = new VertexAIEmbedding({
                projectId: config.vertexaiProjectId,
                location: config.vertexaiLocation,
                model: config.embeddingModel,
                ...(config.vertexaiKeyFilename && { keyFilename: config.vertexaiKeyFilename })
            });
            console.log(`[EMBEDDING] ✅ VertexAI embedding instance created successfully`);
            return vertexEmbedding;

        case 'Bedrock':
            if (!config.bedrockRegion) {
                console.error(`[EMBEDDING] ❌ Bedrock region is required but not provided`);
                throw new Error('BEDROCK_REGION is required for Bedrock embedding provider');
            }
            console.log(`[EMBEDDING] 🔧 Configuring Bedrock with model: ${config.embeddingModel}`);
            const bedrockEmbedding = new BedrockEmbedding({
                region: config.bedrockRegion,
                model: config.embeddingModel,
                ...(config.bedrockAccessKeyId && { accessKeyId: config.bedrockAccessKeyId }),
                ...(config.bedrockSecretAccessKey && { secretAccessKey: config.bedrockSecretAccessKey }),
                ...(config.bedrockSessionToken && { sessionToken: config.bedrockSessionToken }),
                ...(config.bedrockProfile && { profile: config.bedrockProfile })
            });
            console.log(`[EMBEDDING] ✅ Bedrock embedding instance created successfully`);
            return bedrockEmbedding;

        default:
            console.error(`[EMBEDDING] ❌ Unsupported embedding provider: ${config.embeddingProvider}`);
            throw new Error(`Unsupported embedding provider: ${config.embeddingProvider}`);
    }
}

export function logEmbeddingProviderInfo(config: ContextMcpConfig, embedding: OpenAIEmbedding | VoyageAIEmbedding | GeminiEmbedding | OllamaEmbedding | HuggingFaceEmbedding | OpenRouterEmbedding | VertexAIEmbedding | BedrockEmbedding): void {
    console.log(`[EMBEDDING] ✅ Successfully initialized ${config.embeddingProvider} embedding provider`);
    console.log(`[EMBEDDING] Provider details - Model: ${config.embeddingModel}, Dimension: ${embedding.getDimension()}`);

    // Log provider-specific configuration details
    switch (config.embeddingProvider) {
        case 'OpenAI':
            console.log(`[EMBEDDING] OpenAI configuration - API Key: ${config.openaiApiKey ? '✅ Provided' : '❌ Missing'}, Base URL: ${config.openaiBaseUrl || 'Default'}`);
            break;
        case 'VoyageAI':
            console.log(`[EMBEDDING] VoyageAI configuration - API Key: ${config.voyageaiApiKey ? '✅ Provided' : '❌ Missing'}`);
            break;
        case 'Gemini':
            console.log(`[EMBEDDING] Gemini configuration - API Key: ${config.geminiApiKey ? '✅ Provided' : '❌ Missing'}`);
            break;
        case 'Ollama':
            console.log(`[EMBEDDING] Ollama configuration - Host: ${config.ollamaHost || 'http://127.0.0.1:11434'}, Model: ${config.embeddingModel}`);
            break;
        case 'HuggingFace':
            console.log(`[EMBEDDING] HuggingFace configuration - API Key: ${config.huggingfaceApiKey ? '✅ Provided' : '❌ Missing'}, Base URL: ${config.huggingfaceBaseUrl || 'Default'}, Model: ${config.embeddingModel}`);
            break;
        case 'OpenRouter':
            console.log(`[EMBEDDING] OpenRouter configuration - API Key: ${config.openrouterApiKey ? '✅ Provided' : '❌ Missing'}, Base URL: ${config.openrouterBaseUrl || 'https://openrouter.ai/api/v1'}, Model: ${config.embeddingModel}`);
            break;
        case 'VertexAI':
            console.log(`[EMBEDDING] VertexAI configuration - Project: ${config.vertexaiProjectId}, Location: ${config.vertexaiLocation}, Key File: ${config.vertexaiKeyFilename || 'Service Account'}, Model: ${config.embeddingModel}`);
            break;
        case 'Bedrock':
            console.log(`[EMBEDDING] Bedrock configuration - Region: ${config.bedrockRegion}, Profile: ${config.bedrockProfile || 'Credentials'}, Model: ${config.embeddingModel}`);
            break;
    }
} 