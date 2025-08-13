# Configuration Guide

This guide covers all configuration options for Super Context, including embedding providers and vector databases.

## Environment Variables

Super Context supports configuration through environment variables. Create a `.env` file or set these variables in your shell:

### Embedding Providers

Super Context supports multiple embedding providers. Choose one and configure its settings:

#### OpenAI
```bash
EMBEDDING_PROVIDER=OpenAI
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1  # Optional, for custom endpoints
EMBEDDING_MODEL=text-embedding-3-small
```

#### VoyageAI
```bash
EMBEDDING_PROVIDER=VoyageAI
VOYAGEAI_API_KEY=your-voyageai-api-key
EMBEDDING_MODEL=voyage-code-3
```

#### Google Gemini
```bash
EMBEDDING_PROVIDER=Gemini
GEMINI_API_KEY=your-gemini-api-key
EMBEDDING_MODEL=gemini-embedding-001
```

#### Ollama (Local)
```bash
EMBEDDING_PROVIDER=Ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=nomic-embed-text
```

#### HuggingFace
```bash
EMBEDDING_PROVIDER=HuggingFace
HUGGINGFACE_API_KEY=hf_your-huggingface-token
HUGGINGFACE_MODEL=sentence-transformers/all-MiniLM-L6-v2
HUGGINGFACE_BASE_URL=https://api-inference.huggingface.co  # Optional
```

#### OpenRouter
```bash
EMBEDDING_PROVIDER=OpenRouter
OPENROUTER_API_KEY=sk-or-your-openrouter-key
OPENROUTER_MODEL=openai/text-embedding-3-small
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1  # Optional
```

#### Google Vertex AI
```bash
EMBEDDING_PROVIDER=VertexAI
VERTEXAI_PROJECT_ID=your-gcp-project-id
VERTEXAI_LOCATION=us-central1
VERTEXAI_MODEL=textembedding-gecko@003
VERTEXAI_KEY_FILENAME=/path/to/service-account-key.json  # Optional, uses default credentials if not provided
```

#### AWS Bedrock
```bash
EMBEDDING_PROVIDER=Bedrock
BEDROCK_REGION=us-east-1
BEDROCK_MODEL=amazon.titan-embed-text-v2:0

# Option 1: Use explicit AWS credentials
BEDROCK_ACCESS_KEY_ID=your-access-key-id
BEDROCK_SECRET_ACCESS_KEY=your-secret-access-key
BEDROCK_SESSION_TOKEN=your-session-token  # Optional

# Option 2: Use AWS profile
BEDROCK_PROFILE=default

# Option 3: Use standard AWS environment variables (recommended)
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_SESSION_TOKEN=your-session-token  # Optional
AWS_PROFILE=default
AWS_REGION=us-east-1
```

### Vector Databases

Choose one vector database and configure its settings:

#### Milvus / Zilliz Cloud
```bash
VECTOR_DATABASE=milvus
MILVUS_ADDRESS=your-zilliz-cloud-public-endpoint  # Or http://localhost:19530 for local
MILVUS_TOKEN=your-zilliz-cloud-api-key  # Optional for local installations
```

#### Qdrant
```bash
VECTOR_DATABASE=qdrant

# For Qdrant Cloud:
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key

# For local Qdrant:
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_HTTPS=false
```

#### Pinecone
```bash
VECTOR_DATABASE=pinecone
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_INDEX_NAME=your-index-name
PINECONE_ENVIRONMENT=your-environment  # Optional for newer accounts
```

#### pgvector (PostgreSQL)
```bash
VECTOR_DATABASE=pgvector
PGVECTOR_HOST=localhost
PGVECTOR_PORT=5432
PGVECTOR_DATABASE=your_database
PGVECTOR_USER=your_username
PGVECTOR_PASSWORD=your_password
PGVECTOR_SSL=false  # Or SSL configuration object
```

#### Weaviate
```bash
VECTOR_DATABASE=weaviate
WEAVIATE_SCHEME=http  # or https
WEAVIATE_HOST=localhost:8080
WEAVIATE_API_KEY=your-weaviate-api-key  # Optional
WEAVIATE_CLASS_NAME=CodeChunks
```

#### Chroma
```bash
VECTOR_DATABASE=chroma
CHROMA_HOST=localhost
CHROMA_PORT=8000
CHROMA_SSL=false
CHROMA_COLLECTION_NAME=code_collection
```

#### Faiss (Local)
```bash
VECTOR_DATABASE=faiss
FAISS_DATA_PATH=./faiss_data
FAISS_INDEX_TYPE=IndexHNSWFlat  # IndexFlatL2, IndexFlatIP, IndexIVFFlat, IndexIVFPQ, IndexHNSWFlat, IndexLSH
FAISS_DIMENSION=1536  # Must match your embedding model dimension
```

#### Upstash Vector
```bash
VECTOR_DATABASE=upstash
UPSTASH_VECTOR_URL=https://your-vector-db-url.upstash.io
UPSTASH_VECTOR_TOKEN=your-upstash-token
```

#### Ollama (Local)
```bash
VECTOR_DATABASE=ollama
OLLAMA_VDB_HOST=http://127.0.0.1:11434
OLLAMA_VDB_MODEL=nomic-embed-text  # Optional, for generating embeddings
OLLAMA_VDB_DATA_PATH=./ollama_vector_data
OLLAMA_VDB_DIMENSION=768  # Must match your embedding model dimension
OLLAMA_VDB_METRIC=cosine  # cosine, euclidean, or dot
```

### Additional Configuration

```bash
# Code splitter configuration
SPLITTER_TYPE=ast  # or langchain

# Custom file processing
CUSTOM_EXTENSIONS=.vue,.svelte,.astro  # Comma-separated additional extensions
CUSTOM_IGNORE_PATTERNS=temp/**,*.backup,private/**  # Comma-separated ignore patterns

# Search configuration
HYBRID_MODE=true  # Enable hybrid search (dense vector + BM25)
EMBEDDING_BATCH_SIZE=100  # Batch size for embedding processing
```

## MCP Server Configuration

When using Super Context as an MCP server with Claude Code, Cursor, or other clients, configure it in their respective settings files:

### Claude Code Configuration

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["@hongkongkiwi/super-context-mcp@latest"],
      "env": {
        "EMBEDDING_PROVIDER": "OpenAI",
        "OPENAI_API_KEY": "sk-your-openai-api-key",
        "VECTOR_DATABASE": "milvus",
        "MILVUS_ADDRESS": "your-zilliz-cloud-public-endpoint",
        "MILVUS_TOKEN": "your-zilliz-cloud-api-key"
      }
    }
  }
}
```

### Cursor Configuration

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["-y", "@hongkongkiwi/super-context-mcp@latest"],
      "env": {
        "EMBEDDING_PROVIDER": "OpenAI",
        "OPENAI_API_KEY": "your-openai-api-key",
        "VECTOR_DATABASE": "qdrant",
        "QDRANT_URL": "https://your-cluster.qdrant.io",
        "QDRANT_API_KEY": "your-qdrant-api-key"
      }
    }
  }
}
```

## Programming Configuration

When using the core package programmatically:

### TypeScript/JavaScript Example

```typescript
import {
  Context,
  // Embedding providers
  OpenAIEmbedding,
  VoyageAIEmbedding,
  GeminiEmbedding,
  OllamaEmbedding,
  HuggingFaceEmbedding,
  OpenRouterEmbedding,
  VertexAIEmbedding,
  BedrockEmbedding,
  // Vector databases
  MilvusVectorDatabase,
  QdrantVectorDatabase,
  PineconeVectorDatabase,
  PgVectorDatabase,
  WeaviateVectorDatabase,
  ChromaVectorDatabase,
  FaissVectorDatabase,
  UpstashVectorDatabase,
  OllamaVectorDatabase
} from '@hongkongkiwi/super-context-core';

// Example: OpenAI + Pinecone
const embedding = new OpenAIEmbedding({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'text-embedding-3-small'
});

const vectorDatabase = new PineconeVectorDatabase({
  apiKey: process.env.PINECONE_API_KEY!,
  indexName: 'code-search',
  dimension: 1536
});

const context = new Context({
  embedding,
  vectorDatabase
});

// Example: HuggingFace + Chroma
const hfEmbedding = new HuggingFaceEmbedding({
  apiKey: process.env.HUGGINGFACE_API_KEY!,
  model: 'sentence-transformers/all-MiniLM-L6-v2'
});

const chromaDb = new ChromaVectorDatabase({
  host: 'localhost',
  port: 8000,
  collectionName: 'code_chunks'
});

// Example: AWS Bedrock + pgvector
const bedrockEmbedding = new BedrockEmbedding({
  region: 'us-east-1',
  model: 'amazon.titan-embed-text-v2:0'
  // Automatically uses AWS credential chain
});

const pgVector = new PgVectorDatabase({
  host: 'localhost',
  database: 'code_search',
  user: 'postgres',
  password: 'password',
  dimension: 1024
});

// Example: Ollama (local embedding + local vector storage)
const ollamaEmbedding = new OllamaEmbedding({
  model: 'nomic-embed-text',
  host: 'http://localhost:11434'
});

const ollamaVector = new OllamaVectorDatabase({
  host: 'http://localhost:11434',
  embeddingModel: 'nomic-embed-text', // Optional: can generate embeddings
  dimension: 768,
  dataPath: './ollama_vectors'
});
```

## Best Practices

### Choosing an Embedding Provider

- **OpenAI**: Best overall quality, good for production use
- **VoyageAI**: Specialized for code, excellent for code search
- **Ollama**: Best for local/private deployments, no API costs
- **HuggingFace**: Good for open-source models, cost-effective
- **Gemini**: Good integration with Google Cloud services
- **Vertex AI**: Best for Google Cloud environments
- **AWS Bedrock**: Best for AWS environments, multiple model options

### Choosing a Vector Database

- **Milvus/Zilliz Cloud**: Best for large-scale deployments, high performance
- **Qdrant**: Good balance of features and performance, easy to deploy
- **Pinecone**: Fully managed, easy setup, good for small to medium projects
- **pgvector**: Great if you already use PostgreSQL, ACID compliance
- **Weaviate**: Good for hybrid search, built-in ML capabilities
- **Chroma**: Simple to use, good for prototyping and small projects
- **Faiss**: Best for local deployments, no network dependencies
- **Upstash Vector**: Serverless, pay-per-use, good for variable workloads
- **Ollama**: Best for fully local deployments, no external dependencies, perfect for privacy-focused setups

### Performance Recommendations

1. **Batch Processing**: Use larger `EMBEDDING_BATCH_SIZE` values (100-500) for faster indexing
2. **Hybrid Search**: Enable `HYBRID_MODE=true` for better search quality
3. **Index Configuration**: Tune vector database index parameters for your workload
4. **Resource Allocation**: Ensure sufficient memory for large codebases

### Security Considerations

1. **API Keys**: Store sensitive credentials in environment variables or secure key management systems
2. **Network Security**: Use TLS/SSL for database connections
3. **Access Control**: Configure proper authentication and authorization for your vector database
4. **Data Privacy**: Consider data locality requirements when choosing cloud providers