import { envManager } from "@hongkongkiwi/super-context-core";

export interface ContextMcpConfig {
    name: string;
    version: string;
    // Embedding provider configuration
    embeddingProvider: 'OpenAI' | 'VoyageAI' | 'Gemini' | 'Ollama' | 'HuggingFace' | 'OpenRouter' | 'VertexAI' | 'Bedrock';
    embeddingModel: string;
    // Provider-specific API keys
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    voyageaiApiKey?: string;
    geminiApiKey?: string;
    // Ollama configuration
    ollamaModel?: string;
    ollamaHost?: string;
    // HuggingFace configuration
    huggingfaceApiKey?: string;
    huggingfaceBaseUrl?: string;
    // OpenRouter configuration
    openrouterApiKey?: string;
    openrouterBaseUrl?: string;
    // VertexAI configuration
    vertexaiProjectId?: string;
    vertexaiLocation?: string;
    vertexaiKeyFilename?: string;
    // Bedrock configuration
    bedrockRegion?: string;
    bedrockAccessKeyId?: string;
    bedrockSecretAccessKey?: string;
    bedrockSessionToken?: string;
    bedrockProfile?: string;
    // Vector database configuration
    vectorDatabase: 'milvus' | 'qdrant';
    // Milvus configuration
    milvusAddress?: string; // Optional, can be auto-resolved from token
    milvusToken?: string;
    // Qdrant configuration
    qdrantUrl?: string;
    qdrantApiKey?: string;
    qdrantHost?: string;
    qdrantPort?: number;
    qdrantHttps?: boolean;
}

export interface CodebaseSnapshot {
    indexedCodebases: string[];
    indexingCodebases: string[] | Record<string, number>;  // Array (legacy) or Map of codebase path to progress percentage
    lastUpdated: string;
}

// Helper function to get default model for each provider
export function getDefaultModelForProvider(provider: string): string {
    switch (provider) {
        case 'OpenAI':
            return 'text-embedding-3-small';
        case 'VoyageAI':
            return 'voyage-code-3';
        case 'Gemini':
            return 'gemini-embedding-001';
        case 'Ollama':
            return 'nomic-embed-text';
        case 'HuggingFace':
            return 'sentence-transformers/all-MiniLM-L6-v2';
        case 'OpenRouter':
            return 'openai/text-embedding-3-small';
        case 'VertexAI':
            return 'textembedding-gecko@003';
        case 'Bedrock':
            return 'amazon.titan-embed-text-v2:0';
        default:
            return 'text-embedding-3-small';
    }
}

// Helper function to get embedding model with provider-specific environment variable priority
export function getEmbeddingModelForProvider(provider: string): string {
    switch (provider) {
        case 'Ollama':
            // For Ollama, prioritize OLLAMA_MODEL over EMBEDDING_MODEL
            const ollamaModel = envManager.get('OLLAMA_MODEL') || envManager.get('EMBEDDING_MODEL') || getDefaultModelForProvider(provider);
            console.log(`[DEBUG] 🎯 Ollama model selection: OLLAMA_MODEL=${envManager.get('OLLAMA_MODEL') || 'NOT SET'}, EMBEDDING_MODEL=${envManager.get('EMBEDDING_MODEL') || 'NOT SET'}, selected=${ollamaModel}`);
            return ollamaModel;
        case 'HuggingFace':
            // For HuggingFace, prioritize HUGGINGFACE_MODEL over EMBEDDING_MODEL
            const hfModel = envManager.get('HUGGINGFACE_MODEL') || envManager.get('EMBEDDING_MODEL') || getDefaultModelForProvider(provider);
            console.log(`[DEBUG] 🎯 HuggingFace model selection: HUGGINGFACE_MODEL=${envManager.get('HUGGINGFACE_MODEL') || 'NOT SET'}, EMBEDDING_MODEL=${envManager.get('EMBEDDING_MODEL') || 'NOT SET'}, selected=${hfModel}`);
            return hfModel;
        case 'OpenRouter':
            // For OpenRouter, prioritize OPENROUTER_MODEL over EMBEDDING_MODEL
            const orModel = envManager.get('OPENROUTER_MODEL') || envManager.get('EMBEDDING_MODEL') || getDefaultModelForProvider(provider);
            console.log(`[DEBUG] 🎯 OpenRouter model selection: OPENROUTER_MODEL=${envManager.get('OPENROUTER_MODEL') || 'NOT SET'}, EMBEDDING_MODEL=${envManager.get('EMBEDDING_MODEL') || 'NOT SET'}, selected=${orModel}`);
            return orModel;
        case 'VertexAI':
            // For VertexAI, prioritize VERTEXAI_MODEL over EMBEDDING_MODEL
            const vertexModel = envManager.get('VERTEXAI_MODEL') || envManager.get('EMBEDDING_MODEL') || getDefaultModelForProvider(provider);
            console.log(`[DEBUG] 🎯 VertexAI model selection: VERTEXAI_MODEL=${envManager.get('VERTEXAI_MODEL') || 'NOT SET'}, EMBEDDING_MODEL=${envManager.get('EMBEDDING_MODEL') || 'NOT SET'}, selected=${vertexModel}`);
            return vertexModel;
        case 'Bedrock':
            // For Bedrock, prioritize BEDROCK_MODEL over EMBEDDING_MODEL
            const bedrockModel = envManager.get('BEDROCK_MODEL') || envManager.get('EMBEDDING_MODEL') || getDefaultModelForProvider(provider);
            console.log(`[DEBUG] 🎯 Bedrock model selection: BEDROCK_MODEL=${envManager.get('BEDROCK_MODEL') || 'NOT SET'}, EMBEDDING_MODEL=${envManager.get('EMBEDDING_MODEL') || 'NOT SET'}, selected=${bedrockModel}`);
            return bedrockModel;
        case 'OpenAI':
        case 'VoyageAI':
        case 'Gemini':
        default:
            // For other providers, use EMBEDDING_MODEL or default
            return envManager.get('EMBEDDING_MODEL') || getDefaultModelForProvider(provider);
    }
}

export function createMcpConfig(): ContextMcpConfig {
    // Debug: Print all environment variables related to Context
    console.log(`[DEBUG] 🔍 Environment Variables Debug:`);
    console.log(`[DEBUG]   EMBEDDING_PROVIDER: ${envManager.get('EMBEDDING_PROVIDER') || 'NOT SET'}`);
    console.log(`[DEBUG]   EMBEDDING_MODEL: ${envManager.get('EMBEDDING_MODEL') || 'NOT SET'}`);
    console.log(`[DEBUG]   OLLAMA_MODEL: ${envManager.get('OLLAMA_MODEL') || 'NOT SET'}`);
    console.log(`[DEBUG]   GEMINI_API_KEY: ${envManager.get('GEMINI_API_KEY') ? 'SET (length: ' + envManager.get('GEMINI_API_KEY')!.length + ')' : 'NOT SET'}`);
    console.log(`[DEBUG]   OPENAI_API_KEY: ${envManager.get('OPENAI_API_KEY') ? 'SET (length: ' + envManager.get('OPENAI_API_KEY')!.length + ')' : 'NOT SET'}`);
    console.log(`[DEBUG]   VECTOR_DATABASE: ${envManager.get('VECTOR_DATABASE') || 'NOT SET'}`);
    console.log(`[DEBUG]   MILVUS_ADDRESS: ${envManager.get('MILVUS_ADDRESS') || 'NOT SET'}`);
    console.log(`[DEBUG]   QDRANT_URL: ${envManager.get('QDRANT_URL') || 'NOT SET'}`);
    console.log(`[DEBUG]   NODE_ENV: ${envManager.get('NODE_ENV') || 'NOT SET'}`);

    // Determine vector database from environment
    const vectorDatabase = (envManager.get('VECTOR_DATABASE') as 'milvus' | 'qdrant') || 'milvus';

    const config: ContextMcpConfig = {
        name: envManager.get('MCP_SERVER_NAME') || "Context MCP Server",
        version: envManager.get('MCP_SERVER_VERSION') || "1.0.0",
        // Embedding provider configuration
        embeddingProvider: (envManager.get('EMBEDDING_PROVIDER') as 'OpenAI' | 'VoyageAI' | 'Gemini' | 'Ollama' | 'HuggingFace' | 'OpenRouter' | 'VertexAI' | 'Bedrock') || 'OpenAI',
        embeddingModel: getEmbeddingModelForProvider(envManager.get('EMBEDDING_PROVIDER') || 'OpenAI'),
        // Provider-specific API keys
        openaiApiKey: envManager.get('OPENAI_API_KEY'),
        openaiBaseUrl: envManager.get('OPENAI_BASE_URL'),
        voyageaiApiKey: envManager.get('VOYAGEAI_API_KEY'),
        geminiApiKey: envManager.get('GEMINI_API_KEY'),
        // Ollama configuration
        ollamaModel: envManager.get('OLLAMA_MODEL'),
        ollamaHost: envManager.get('OLLAMA_HOST'),
        // HuggingFace configuration
        huggingfaceApiKey: envManager.get('HUGGINGFACE_API_KEY'),
        huggingfaceBaseUrl: envManager.get('HUGGINGFACE_BASE_URL'),
        // OpenRouter configuration
        openrouterApiKey: envManager.get('OPENROUTER_API_KEY'),
        openrouterBaseUrl: envManager.get('OPENROUTER_BASE_URL'),
        // VertexAI configuration
        vertexaiProjectId: envManager.get('VERTEXAI_PROJECT_ID'),
        vertexaiLocation: envManager.get('VERTEXAI_LOCATION'),
        vertexaiKeyFilename: envManager.get('VERTEXAI_KEY_FILENAME'),
        // Bedrock configuration - supports standard AWS environment variables
        bedrockRegion: envManager.get('BEDROCK_REGION') || envManager.get('AWS_DEFAULT_REGION') || envManager.get('AWS_REGION'),
        bedrockAccessKeyId: envManager.get('BEDROCK_ACCESS_KEY_ID') || envManager.get('AWS_ACCESS_KEY_ID'),
        bedrockSecretAccessKey: envManager.get('BEDROCK_SECRET_ACCESS_KEY') || envManager.get('AWS_SECRET_ACCESS_KEY'),
        bedrockSessionToken: envManager.get('BEDROCK_SESSION_TOKEN') || envManager.get('AWS_SESSION_TOKEN'),
        bedrockProfile: envManager.get('BEDROCK_PROFILE') || envManager.get('AWS_PROFILE'),
        // Vector database configuration
        vectorDatabase: vectorDatabase,
        // Milvus configuration - address can be auto-resolved from token
        milvusAddress: envManager.get('MILVUS_ADDRESS'), // Optional, can be resolved from token
        milvusToken: envManager.get('MILVUS_TOKEN'),
        // Qdrant configuration
        qdrantUrl: envManager.get('QDRANT_URL'),
        qdrantApiKey: envManager.get('QDRANT_API_KEY'),
        qdrantHost: envManager.get('QDRANT_HOST'),
        qdrantPort: envManager.get('QDRANT_PORT') ? parseInt(envManager.get('QDRANT_PORT')!) : undefined,
        qdrantHttps: envManager.get('QDRANT_HTTPS') === 'true'
    };

    return config;
}

export function logConfigurationSummary(config: ContextMcpConfig): void {
    // Log configuration summary before starting server
    console.log(`[MCP] 🚀 Starting Context MCP Server`);
    console.log(`[MCP] Configuration Summary:`);
    console.log(`[MCP]   Server: ${config.name} v${config.version}`);
    console.log(`[MCP]   Embedding Provider: ${config.embeddingProvider}`);
    console.log(`[MCP]   Embedding Model: ${config.embeddingModel}`);
    console.log(`[MCP]   Vector Database: ${config.vectorDatabase}`);

    // Log vector database configuration
    switch (config.vectorDatabase) {
        case 'milvus':
            console.log(`[MCP]   Milvus Address: ${config.milvusAddress || (config.milvusToken ? '[Auto-resolve from token]' : '[Not configured]')}`);
            break;
        case 'qdrant':
            if (config.qdrantUrl) {
                console.log(`[MCP]   Qdrant URL: ${config.qdrantUrl}`);
                console.log(`[MCP]   Qdrant API Key: ${config.qdrantApiKey ? '✅ Configured' : '❌ Missing'}`);
            } else {
                console.log(`[MCP]   Qdrant Host: ${config.qdrantHost || 'localhost'}`);
                console.log(`[MCP]   Qdrant Port: ${config.qdrantPort || 6333}`);
                console.log(`[MCP]   Qdrant HTTPS: ${config.qdrantHttps || false}`);
            }
            break;
    }

    // Log provider-specific configuration without exposing sensitive data
    switch (config.embeddingProvider) {
        case 'OpenAI':
            console.log(`[MCP]   OpenAI API Key: ${config.openaiApiKey ? '✅ Configured' : '❌ Missing'}`);
            if (config.openaiBaseUrl) {
                console.log(`[MCP]   OpenAI Base URL: ${config.openaiBaseUrl}`);
            }
            break;
        case 'VoyageAI':
            console.log(`[MCP]   VoyageAI API Key: ${config.voyageaiApiKey ? '✅ Configured' : '❌ Missing'}`);
            break;
        case 'Gemini':
            console.log(`[MCP]   Gemini API Key: ${config.geminiApiKey ? '✅ Configured' : '❌ Missing'}`);
            break;
        case 'Ollama':
            console.log(`[MCP]   Ollama Host: ${config.ollamaHost || 'http://127.0.0.1:11434'}`);
            console.log(`[MCP]   Ollama Model: ${config.embeddingModel}`);
            break;
        case 'HuggingFace':
            console.log(`[MCP]   HuggingFace API Key: ${config.huggingfaceApiKey ? '✅ Configured' : '❌ Missing'}`);
            if (config.huggingfaceBaseUrl) {
                console.log(`[MCP]   HuggingFace Base URL: ${config.huggingfaceBaseUrl}`);
            }
            console.log(`[MCP]   HuggingFace Model: ${config.embeddingModel}`);
            break;
        case 'OpenRouter':
            console.log(`[MCP]   OpenRouter API Key: ${config.openrouterApiKey ? '✅ Configured' : '❌ Missing'}`);
            console.log(`[MCP]   OpenRouter Base URL: ${config.openrouterBaseUrl || 'https://openrouter.ai/api/v1'}`);
            console.log(`[MCP]   OpenRouter Model: ${config.embeddingModel}`);
            break;
        case 'VertexAI':
            console.log(`[MCP]   VertexAI Project ID: ${config.vertexaiProjectId || '❌ Missing'}`);
            console.log(`[MCP]   VertexAI Location: ${config.vertexaiLocation || '❌ Missing'}`);
            if (config.vertexaiKeyFilename) {
                console.log(`[MCP]   VertexAI Key File: ${config.vertexaiKeyFilename}`);
            }
            console.log(`[MCP]   VertexAI Model: ${config.embeddingModel}`);
            break;
        case 'Bedrock':
            console.log(`[MCP]   Bedrock Region: ${config.bedrockRegion || '❌ Missing'}`);
            if (config.bedrockProfile) {
                console.log(`[MCP]   Bedrock Profile: ${config.bedrockProfile}`);
            } else {
                console.log(`[MCP]   Bedrock Access Key ID: ${config.bedrockAccessKeyId ? '✅ Configured' : '❌ Missing'}`);
                console.log(`[MCP]   Bedrock Secret Access Key: ${config.bedrockSecretAccessKey ? '✅ Configured' : '❌ Missing'}`);
            }
            console.log(`[MCP]   Bedrock Model: ${config.embeddingModel}`);
            break;
    }

    console.log(`[MCP] 🔧 Initializing server components...`);
}

export function showHelpMessage(): void {
    console.log(`
Context MCP Server

Usage: npx @zilliz/super-context-mcp@latest [options]

Options:
  --help, -h                          Show this help message

Environment Variables:
  MCP_SERVER_NAME         Server name
  MCP_SERVER_VERSION      Server version
  
  Embedding Provider Configuration:
  EMBEDDING_PROVIDER      Embedding provider: OpenAI, VoyageAI, Gemini, Ollama, HuggingFace, OpenRouter, VertexAI, Bedrock (default: OpenAI)
  EMBEDDING_MODEL         Embedding model name (auto-detected if not specified)
  
  Provider-specific API Keys:
  OPENAI_API_KEY          OpenAI API key (required for OpenAI provider)
  OPENAI_BASE_URL         OpenAI API base URL (optional, for custom endpoints)
  VOYAGEAI_API_KEY        VoyageAI API key (required for VoyageAI provider)
  GEMINI_API_KEY          Google AI API key (required for Gemini provider)
  
  Ollama Configuration:
  OLLAMA_HOST             Ollama server host (default: http://127.0.0.1:11434)
  OLLAMA_MODEL            Ollama model name (default: nomic-embed-text)
  
  HuggingFace Configuration:
  HUGGINGFACE_API_KEY     HuggingFace API key (required for HuggingFace provider)
  HUGGINGFACE_MODEL       HuggingFace model name (default: sentence-transformers/all-MiniLM-L6-v2)
  HUGGINGFACE_BASE_URL    HuggingFace API base URL (optional, for custom endpoints)
  
  OpenRouter Configuration:
  OPENROUTER_API_KEY      OpenRouter API key (required for OpenRouter provider)
  OPENROUTER_MODEL        OpenRouter model name (default: openai/text-embedding-3-small)
  OPENROUTER_BASE_URL     OpenRouter API base URL (optional, default: https://openrouter.ai/api/v1)
  
  Vertex AI Configuration:
  VERTEXAI_PROJECT_ID     Google Cloud project ID (required for VertexAI provider)
  VERTEXAI_LOCATION       Vertex AI location/region (required for VertexAI provider)
  VERTEXAI_MODEL          Vertex AI model name (default: textembedding-gecko@003)
  VERTEXAI_KEY_FILENAME   Path to service account key file (optional)
  
  AWS Bedrock Configuration:
  BEDROCK_REGION          AWS region (required for Bedrock provider)
  AWS_DEFAULT_REGION      Standard AWS default region (fallback for BEDROCK_REGION)
  AWS_REGION              Standard AWS region (fallback for BEDROCK_REGION)
  BEDROCK_MODEL           Bedrock model name (default: amazon.titan-embed-text-v2:0)
  
  AWS Credentials (supports standard AWS environment variables):
  BEDROCK_ACCESS_KEY_ID   AWS access key ID (optional, uses default credential chain)
  AWS_ACCESS_KEY_ID       Standard AWS access key ID (fallback for BEDROCK_ACCESS_KEY_ID)
  BEDROCK_SECRET_ACCESS_KEY AWS secret access key (optional)
  AWS_SECRET_ACCESS_KEY   Standard AWS secret access key (fallback for BEDROCK_SECRET_ACCESS_KEY)
  BEDROCK_SESSION_TOKEN   AWS session token (optional)
  AWS_SESSION_TOKEN       Standard AWS session token (fallback for BEDROCK_SESSION_TOKEN)
  BEDROCK_PROFILE         AWS profile name (optional, alternative to explicit credentials)
  AWS_PROFILE             Standard AWS profile (fallback for BEDROCK_PROFILE)
  
  Vector Database Configuration:
  VECTOR_DATABASE         Vector database type: milvus, qdrant (default: milvus)
  
  Milvus Configuration:
  MILVUS_ADDRESS          Milvus address (optional, can be auto-resolved from token)
  MILVUS_TOKEN            Milvus token (optional, used for authentication and address resolution)
  
  Qdrant Configuration:
  QDRANT_URL              Qdrant Cloud URL (e.g., https://your-cluster.qdrant.io)
  QDRANT_API_KEY          Qdrant API key (required for Qdrant Cloud)
  QDRANT_HOST             Qdrant host for local instance (default: localhost)
  QDRANT_PORT             Qdrant port for local instance (default: 6333)
  QDRANT_HTTPS            Use HTTPS for local Qdrant (default: false)

Examples:
  # Start MCP server with OpenAI and Milvus (default)
  OPENAI_API_KEY=sk-xxx MILVUS_ADDRESS=localhost:19530 npx @zilliz/super-context-mcp@latest
  
  # Start MCP server with OpenAI and Qdrant Cloud
  OPENAI_API_KEY=sk-xxx VECTOR_DATABASE=qdrant QDRANT_URL=https://your-cluster.qdrant.io QDRANT_API_KEY=your-api-key npx @zilliz/super-context-mcp@latest
  
  # Start MCP server with OpenAI and local Qdrant
  OPENAI_API_KEY=sk-xxx VECTOR_DATABASE=qdrant QDRANT_HOST=localhost QDRANT_PORT=6333 npx @zilliz/super-context-mcp@latest
  
  # Start MCP server with VoyageAI and Qdrant
  EMBEDDING_PROVIDER=VoyageAI VOYAGEAI_API_KEY=pa-xxx VECTOR_DATABASE=qdrant QDRANT_URL=https://your-cluster.qdrant.io QDRANT_API_KEY=your-api-key npx @zilliz/super-context-mcp@latest
  
  # Start MCP server with Ollama and Qdrant
  EMBEDDING_PROVIDER=Ollama EMBEDDING_MODEL=nomic-embed-text VECTOR_DATABASE=qdrant QDRANT_HOST=localhost npx @zilliz/super-context-mcp@latest
  
  # Start MCP server with HuggingFace and Milvus
  EMBEDDING_PROVIDER=HuggingFace HUGGINGFACE_API_KEY=hf_xxx HUGGINGFACE_MODEL=sentence-transformers/all-MiniLM-L6-v2 MILVUS_TOKEN=your-token npx @zilliz/super-context-mcp@latest
  
  # Start MCP server with OpenRouter and Qdrant
  EMBEDDING_PROVIDER=OpenRouter OPENROUTER_API_KEY=sk-or-xxx OPENROUTER_MODEL=openai/text-embedding-3-small VECTOR_DATABASE=qdrant QDRANT_URL=https://your-cluster.qdrant.io QDRANT_API_KEY=your-api-key npx @zilliz/super-context-mcp@latest
  
  # Start MCP server with Vertex AI and Milvus
  EMBEDDING_PROVIDER=VertexAI VERTEXAI_PROJECT_ID=your-project VERTEXAI_LOCATION=us-central1 VERTEXAI_MODEL=textembedding-gecko@003 MILVUS_TOKEN=your-token npx @zilliz/super-context-mcp@latest
  
  # Start MCP server with AWS Bedrock and Qdrant
  EMBEDDING_PROVIDER=Bedrock BEDROCK_REGION=us-east-1 BEDROCK_MODEL=amazon.titan-embed-text-v2:0 VECTOR_DATABASE=qdrant QDRANT_HOST=localhost npx @zilliz/super-context-mcp@latest
        `);
} 