# Super Context MCP Server

> **AI-powered semantic code indexing and search for Claude Desktop**

A Model Context Protocol (MCP) server that provides intelligent code understanding and search capabilities to Claude Desktop. Index your codebase once, then search it using natural language queries.

![](../../assets/super-context.png)

> **Attribution**: This package is part of Super Context, a fork of [Claude Context](https://github.com/zilliztech/claude-context) originally created by Zilliz.

[![npm version](https://img.shields.io/npm/v/@hongkongkiwi/super-context-mcp.svg)](https://www.npmjs.com/package/@hongkongkiwi/super-context-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@hongkongkiwi/super-context-mcp.svg)](https://www.npmjs.com/package/@hongkongkiwi/super-context-mcp)

## ⚡ Quick Start

### 1. Install
```bash
npm install -g @hongkongkiwi/super-context-mcp
```

### 2. Configure Claude Desktop
Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["@hongkongkiwi/super-context-mcp"],
      "env": {
        "OPENAI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 3. Restart Claude Desktop
The server will be available immediately!

## 🔧 What It Does

- **📁 Index Codebases**: Semantic understanding of your code structure
- **🔍 Natural Language Search**: "Find functions that handle authentication"
- **🧠 AI-Powered**: Uses embeddings for intelligent code matching
- **⚡ Fast Search**: Vector database for instant results
- **🔒 Secure**: Optional encryption for sensitive projects


## 🚀 Usage Examples

### Index and Search a Project
```
You: Index the React project at /Users/me/projects/my-app
Claude: ✅ Indexed 247 files from your React project

You: Find components that handle user login
Claude: Found 3 relevant components:
1. LoginForm.tsx - Main login component with form validation
2. AuthProvider.tsx - Authentication context provider  
3. useAuth.ts - Custom hook for auth state management
```

### Stateless File Analysis
```
You: [Upload some code files] Index these as project "analysis"
Claude: ✅ Indexed 15 files for project "analysis"

You: Search for potential security issues
Claude: Found 2 potential security concerns:
1. SQL query construction without parameterization in database.js:45
2. User input not sanitized before display in UserProfile.tsx:23
```

## 📖 Documentation

- **[MCP_SETUP_GUIDE.md](./MCP_SETUP_GUIDE.md)** - Complete setup guide with examples
- **[OPTIONAL_FEATURES.md](./OPTIONAL_FEATURES.md)** - Advanced features and configuration
- **Configuration examples** in `claude-desktop-configs/` directory

## 🛠️ Features

### Core Features
- ✅ **Semantic Code Search** - Understand code context and intent
- ✅ **Multiple Languages** - Supports TypeScript, Python, Java, Go, Rust, and more
- ✅ **AST-Aware Parsing** - Intelligent code splitting and analysis
- ✅ **Vector Database** - Fast similarity search with Milvus or Qdrant

### Optional Features (Environment Variables)
- 🔐 **Content Encryption** - `ENCRYPTION_KEY=...` - Encrypt sensitive code
- 🔄 **Stateless Mode** - `MCP_STATELESS_MODE=true` - No filesystem access
- 📊 **Multiple Databases** - `VECTOR_DATABASE=qdrant` - Choose your vector DB
- 🎯 **Flexible Embedding** - Support for OpenAI, Voyage, HuggingFace providers

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Claude        │────│  Super Context   │────│  Vector         │
│   Desktop       │    │  MCP Server      │    │  Database       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                         ┌──────┴──────┐
                         │  Embedding  │
                         │  Provider   │
                         └─────────────┘
```

## 🔒 Security & Privacy

- **Local by Default** - Runs on your machine, your data stays local
- **Optional Encryption** - Sensitive code content can be encrypted at rest  
- **Configurable Access** - Choose between filesystem and stateless modes
- **Standard MCP Protocol** - Follows Claude Desktop security patterns

## 🤝 Contributing

This is a fork of the original [claude-context](https://github.com/zilliztech/claude-context) project with enhanced MCP integration and optional security features.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Credits

- Original [claude-context](https://github.com/zilliztech/claude-context) by Zilliz team  
- Built on [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- Uses vector databases from [Milvus](https://milvus.io/) and [Qdrant](https://qdrant.tech/)

---

**Need Help?** Check out the [MCP Setup Guide](./MCP_SETUP_GUIDE.md) or [open an issue](../../issues)!

<details>
<summary><strong>1. OpenAI Configuration (Default)</strong></summary>

OpenAI provides high-quality embeddings with excellent performance for code understanding.

```bash
# Required: Your OpenAI API key
OPENAI_API_KEY=sk-your-openai-api-key

# Optional: Specify embedding model (default: text-embedding-3-small)
EMBEDDING_MODEL=text-embedding-3-small

# Optional: Custom API base URL (for Azure OpenAI or other compatible services)
OPENAI_BASE_URL=https://api.openai.com/v1
```

**Available Models:**
- `text-embedding-3-small` (1536 dimensions, faster, lower cost)
- `text-embedding-3-large` (3072 dimensions, higher quality)
- `text-embedding-ada-002` (1536 dimensions, legacy model)

**Getting API Key:**
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Generate a new API key
4. Set up billing if needed

</details>

<details>
<summary><strong>2. VoyageAI Configuration</strong></summary>

VoyageAI offers specialized code embeddings optimized for programming languages.

```bash
# Required: Your VoyageAI API key
VOYAGEAI_API_KEY=pa-your-voyageai-api-key

# Optional: Specify embedding model (default: voyage-code-3)
EMBEDDING_MODEL=voyage-code-3
```

**Available Models:**
- `voyage-code-3` (1024 dimensions, optimized for code)
- `voyage-3` (1024 dimensions, general purpose)
- `voyage-3-lite` (512 dimensions, faster inference)

**Getting API Key:**
1. Visit [VoyageAI Console](https://dash.voyageai.com/)
2. Sign up for an account
3. Navigate to API Keys section
4. Create a new API key

</details>

<details>
<summary><strong>3. Gemini Configuration</strong></summary>

Google's Gemini provides competitive embeddings with good multilingual support.

```bash
# Required: Your Gemini API key
GEMINI_API_KEY=your-gemini-api-key

# Optional: Specify embedding model (default: gemini-embedding-001)
EMBEDDING_MODEL=gemini-embedding-001
```

**Available Models:**
- `gemini-embedding-001` (3072 dimensions, latest model)

**Getting API Key:**
1. Visit [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Go to "Get API key" section
4. Create a new API key

</details>

<details>
<summary><strong>4. Ollama Configuration (Local/Self-hosted)</strong></summary>

Ollama allows you to run embeddings locally without sending data to external services.

```bash
# Required: Specify which Ollama model to use
EMBEDDING_MODEL=nomic-embed-text

# Optional: Specify Ollama host (default: http://127.0.0.1:11434)
OLLAMA_HOST=http://127.0.0.1:11434
```

**Available Models:**
- `nomic-embed-text` (768 dimensions, recommended for code)
- `mxbai-embed-large` (1024 dimensions, higher quality)
- `all-minilm` (384 dimensions, lightweight)

**Setup Instructions:**
1. Install Ollama from [ollama.ai](https://ollama.ai/)
2. Pull the embedding model:
   ```bash
   ollama pull nomic-embed-text
   ```
3. Ensure Ollama is running:
   ```bash
   ollama serve
   ```

</details>

<details>
<summary><strong>5. HuggingFace Configuration</strong></summary>

HuggingFace provides access to open-source embedding models with good cost-effectiveness.

```bash
# Required: Your HuggingFace API token
HUGGINGFACE_API_KEY=hf_your-huggingface-token

# Optional: Specify embedding model (default: sentence-transformers/all-MiniLM-L6-v2)
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

# Optional: Custom API base URL (for private endpoints)
HUGGINGFACE_BASE_URL=https://api-inference.huggingface.co
```

**Popular Models:**
- `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions, fast and lightweight)
- `sentence-transformers/all-mpnet-base-v2` (768 dimensions, higher quality)
- `intfloat/multilingual-e5-large` (1024 dimensions, multilingual support)

**Getting API Token:**
1. Visit [HuggingFace](https://huggingface.co/settings/tokens)
2. Sign up and navigate to Access Tokens
3. Create a new token with read permissions

</details>

<details>
<summary><strong>6. OpenRouter Configuration</strong></summary>

OpenRouter provides access to multiple embedding models through a unified API.

```bash
# Required: Your OpenRouter API key
OPENROUTER_API_KEY=sk-or-your-openrouter-key

# Optional: Specify embedding model (default: openai/text-embedding-3-small)
EMBEDDING_MODEL=openai/text-embedding-3-small

# Optional: Custom API base URL
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

**Available Models:**
- `openai/text-embedding-3-small` (1536 dimensions)
- `openai/text-embedding-3-large` (3072 dimensions)
- `text-embedding-ada-002` (1536 dimensions)

**Getting API Key:**
1. Visit [OpenRouter](https://openrouter.ai/keys)
2. Sign up for an account
3. Generate a new API key
4. Add credits to your account

</details>

<details>
<summary><strong>7. Google Vertex AI Configuration</strong></summary>

Google Vertex AI provides enterprise-grade embedding models with Google Cloud integration.

```bash
# Required: Your Google Cloud project ID
VERTEXAI_PROJECT_ID=your-gcp-project-id

# Required: Vertex AI location/region
VERTEXAI_LOCATION=us-central1

# Optional: Specify embedding model (default: textembedding-gecko@003)
EMBEDDING_MODEL=textembedding-gecko@003

# Optional: Path to service account key file (uses default credentials if not provided)
VERTEXAI_KEY_FILENAME=/path/to/service-account-key.json
```

**Available Models:**
- `textembedding-gecko@003` (768 dimensions, latest version)
- `textembedding-gecko@002` (768 dimensions)
- `textembedding-gecko-multilingual@001` (768 dimensions, multilingual)

**Setup Instructions:**
1. Create a Google Cloud project and enable Vertex AI API
2. Set up authentication (Application Default Credentials or service account key)
3. Ensure you have appropriate IAM permissions

</details>

<details>
<summary><strong>8. AWS Bedrock Configuration</strong></summary>

AWS Bedrock provides access to foundation models from Amazon, Anthropic, Cohere, and other providers.

```bash
# Required: AWS region
BEDROCK_REGION=us-east-1

# Optional: Specify embedding model (default: amazon.titan-embed-text-v2:0)
EMBEDDING_MODEL=amazon.titan-embed-text-v2:0

# Authentication (choose one option):

# Option 1: Use standard AWS environment variables (recommended)
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_SESSION_TOKEN=your-session-token  # Optional
AWS_PROFILE=default

# Option 2: Use Bedrock-specific variables
BEDROCK_ACCESS_KEY_ID=your-access-key-id
BEDROCK_SECRET_ACCESS_KEY=your-secret-access-key
BEDROCK_SESSION_TOKEN=your-session-token  # Optional
BEDROCK_PROFILE=default
```

**Available Models:**
- `amazon.titan-embed-text-v2:0` (1024 dimensions, latest Titan model)
- `amazon.titan-embed-text-v1` (1536 dimensions, legacy Titan model)
- `cohere.embed-english-v3` (1024 dimensions, English optimized)
- `cohere.embed-multilingual-v3` (1024 dimensions, multilingual)

**Setup Instructions:**
1. Ensure you have access to Amazon Bedrock in your AWS account
2. Request access to the embedding models you want to use
3. Configure AWS credentials using any standard method (AWS CLI, environment variables, IAM roles, etc.)

</details>

#### Vector Database Configuration

Super Context supports multiple vector databases. Choose the one that best fits your needs:

```bash
# Supported databases: milvus, qdrant, pinecone, pgvector, weaviate, chroma, faiss, upstash, ollama
VECTOR_DATABASE=milvus
```

<details>
<summary><strong>Milvus / Zilliz Cloud (Default)</strong></summary>

Milvus provides high-performance vector search. Zilliz Cloud is a fully managed version.

```bash
VECTOR_DATABASE=milvus
MILVUS_ADDRESS=your-zilliz-cloud-public-endpoint  # Or http://localhost:19530 for local
MILVUS_TOKEN=your-zilliz-cloud-api-key  # Optional for local installations
```

**Getting Started:**
You can [sign up](https://cloud.zilliz.com/signup?utm_source=github&utm_medium=referral&utm_campaign=2507-codecontext-readme) on Zilliz Cloud to get an API key.

![](../../assets/signup_and_get_apikey.png)

</details>

<details>
<summary><strong>Qdrant</strong></summary>

Qdrant is a vector similarity search engine with a convenient API.

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

</details>

<details>
<summary><strong>Pinecone</strong></summary>

Pinecone is a fully managed vector database service.

```bash
VECTOR_DATABASE=pinecone
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_INDEX_NAME=your-index-name
PINECONE_ENVIRONMENT=your-environment  # Optional for newer accounts
```

</details>

<details>
<summary><strong>pgvector (PostgreSQL)</strong></summary>

pgvector adds vector similarity search to PostgreSQL.

```bash
VECTOR_DATABASE=pgvector
PGVECTOR_HOST=localhost
PGVECTOR_PORT=5432
PGVECTOR_DATABASE=your_database
PGVECTOR_USER=your_username
PGVECTOR_PASSWORD=your_password
PGVECTOR_SSL=false
```

</details>

<details>
<summary><strong>Weaviate</strong></summary>

Weaviate is an open-source vector search engine with ML-first approach.

```bash
VECTOR_DATABASE=weaviate
WEAVIATE_SCHEME=http  # or https
WEAVIATE_HOST=localhost:8080
WEAVIATE_API_KEY=your-weaviate-api-key  # Optional
WEAVIATE_CLASS_NAME=CodeChunks
```

</details>

<details>
<summary><strong>Chroma</strong></summary>

Chroma is an open-source AI-native embedding database.

```bash
VECTOR_DATABASE=chroma
CHROMA_HOST=localhost
CHROMA_PORT=8000
CHROMA_SSL=false
CHROMA_COLLECTION_NAME=code_collection
```

</details>

<details>
<summary><strong>Faiss (Local)</strong></summary>

Faiss is a library for efficient similarity search without external dependencies.

```bash
VECTOR_DATABASE=faiss
FAISS_DATA_PATH=./faiss_data
FAISS_INDEX_TYPE=IndexHNSWFlat
FAISS_DIMENSION=1536  # Must match your embedding model dimension
```

</details>

<details>
<summary><strong>Upstash Vector</strong></summary>

Upstash Vector is a serverless vector database with pay-per-use pricing.

```bash
VECTOR_DATABASE=upstash
UPSTASH_VECTOR_URL=https://your-vector-db-url.upstash.io
UPSTASH_VECTOR_TOKEN=your-upstash-token
```

</details>

<details>
<summary><strong>Ollama (Local)</strong></summary>

Ollama provides fully local vector storage with optional embedding generation.

```bash
VECTOR_DATABASE=ollama
OLLAMA_VDB_HOST=http://localhost:11434
OLLAMA_VDB_MODEL=nomic-embed-text  # Optional
OLLAMA_VDB_DATA_PATH=./ollama_vector_data
OLLAMA_VDB_DIMENSION=768  # Must match your embedding model dimension
OLLAMA_VDB_METRIC=cosine  # cosine, euclidean, or dot
```

</details> 


#### Embedding Batch Size
You can set the embedding batch size to optimize the performance of the MCP server, depending on your embedding model throughput. The default value is 100.
```bash
EMBEDDING_BATCH_SIZE=512
```

#### Custom File Processing (Optional)
You can configure custom file extensions and ignore patterns globally via environment variables:

```bash
# Additional file extensions to include beyond defaults
CUSTOM_EXTENSIONS=.vue,.svelte,.astro,.twig

# Additional ignore patterns to exclude files/directories
CUSTOM_IGNORE_PATTERNS=temp/**,*.backup,private/**,uploads/**
```

These settings work in combination with tool parameters - patterns from both sources will be merged together.

## Usage with MCP Clients


<details>
<summary><strong>Qwen Code</strong></summary>

Create or edit the `~/.qwen/settings.json` file and add the following configuration:

```json
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["@hongkongkiwi/super-context-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "your-openai-api-key",
        "MILVUS_TOKEN": "your-zilliz-cloud-api-key"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

Go to: `Settings` -> `Cursor Settings` -> `MCP` -> `Add new global MCP server`

Pasting the following configuration into your Cursor `~/.cursor/mcp.json` file is the recommended approach. You may also install in a specific project by creating `.cursor/mcp.json` in your project folder. See [Cursor MCP docs](https://docs.cursor.com/context/model-context-protocol) for more info.

**OpenAI Configuration (Default):**
```json
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["-y", "@hongkongkiwi/super-context-mcp@latest"],
      "env": {
        "EMBEDDING_PROVIDER": "OpenAI",
        "OPENAI_API_KEY": "your-openai-api-key",
        "MILVUS_TOKEN": "your-zilliz-cloud-api-key"
      }
    }
  }
}
```

**VoyageAI Configuration:**
```json
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["-y", "@hongkongkiwi/super-context-mcp@latest"],
      "env": {
        "EMBEDDING_PROVIDER": "VoyageAI",
        "VOYAGEAI_API_KEY": "your-voyageai-api-key",
        "EMBEDDING_MODEL": "voyage-code-3",
        "MILVUS_TOKEN": "your-zilliz-cloud-api-key"
      }
    }
  }
}
```

**Gemini Configuration:**
```json
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["-y", "@hongkongkiwi/super-context-mcp@latest"],
      "env": {
        "EMBEDDING_PROVIDER": "Gemini",
        "GEMINI_API_KEY": "your-gemini-api-key",
        "MILVUS_TOKEN": "your-zilliz-cloud-api-key"
      }
    }
  }
}
```

**Ollama Configuration:**
```json
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["-y", "@hongkongkiwi/super-context-mcp@latest"],
      "env": {
        "EMBEDDING_PROVIDER": "Ollama",
        "EMBEDDING_MODEL": "nomic-embed-text",
        "OLLAMA_HOST": "http://127.0.0.1:11434",
        "MILVUS_TOKEN": "your-zilliz-cloud-api-key"
      }
    }
  }
}
```

</details>



<details>
<summary><strong>Void</strong></summary>

Go to: `Settings` -> `MCP` -> `Add MCP Server`

Add the following configuration to your Void MCP settings:

```json
{
  "mcpServers": {
    "code-context": {
      "command": "npx",
      "args": ["-y", "@hongkongkiwi/super-context-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "your-openai-api-key",
        "MILVUS_ADDRESS": "your-zilliz-cloud-public-endpoint",
        "MILVUS_TOKEN": "your-zilliz-cloud-api-key"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["@hongkongkiwi/super-context-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "your-openai-api-key",
        "MILVUS_TOKEN": "your-zilliz-cloud-api-key"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Claude Code</strong></summary>

Use the command line interface to add the Super Context MCP server:

```bash
# Add the Super Context MCP server
claude mcp add super-context -e OPENAI_API_KEY=your-openai-api-key -e MILVUS_TOKEN=your-zilliz-cloud-api-key -- npx @hongkongkiwi/super-context-mcp@latest

```

See the [Claude Code MCP documentation](https://docs.anthropic.com/en/docs/claude-code/mcp) for more details about MCP server management.

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Windsurf supports MCP configuration through a JSON file. Add the following configuration to your Windsurf MCP settings:

```json
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["-y", "@hongkongkiwi/super-context-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "your-openai-api-key",
        "MILVUS_TOKEN": "your-zilliz-cloud-api-key"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>VS Code</strong></summary>

The Super Context MCP server can be used with VS Code through MCP-compatible extensions. Add the following configuration to your VS Code MCP settings:

```json
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["-y", "@hongkongkiwi/super-context-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "your-openai-api-key",
        "MILVUS_TOKEN": "your-zilliz-cloud-api-key"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Cherry Studio</strong></summary>

Cherry Studio allows for visual MCP server configuration through its settings interface. While it doesn't directly support manual JSON configuration, you can add a new server via the GUI:

1. Navigate to **Settings → MCP Servers → Add Server**.
2. Fill in the server details:
   - **Name**: `super-context`
   - **Type**: `STDIO`
   - **Command**: `npx`
   - **Arguments**: `["@hongkongkiwi/super-context-mcp@latest"]`
   - **Environment Variables**:
     - `OPENAI_API_KEY`: `your-openai-api-key`
     - `MILVUS_TOKEN`: `your-zilliz-cloud-api-key`
3. Save the configuration to activate the server.

</details>

<details>
<summary><strong>Cline</strong></summary>

Cline uses a JSON configuration file to manage MCP servers. To integrate the provided MCP server configuration:

1. Open Cline and click on the **MCP Servers** icon in the top navigation bar.

2. Select the **Installed** tab, then click **Advanced MCP Settings**.

3. In the `cline_mcp_settings.json` file, add the following configuration:

```json
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["@hongkongkiwi/super-context-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "your-openai-api-key",
        "MILVUS_TOKEN": "your-zilliz-cloud-api-key"
      }
    }
  }
}
```

4. Save the file.

</details>

<details>
<summary><strong>Augment</strong></summary>

To configure Super Context MCP in Augment Code, you can use either the graphical interface or manual configuration.

#### **A. Using the Augment Code UI**

1. Click the hamburger menu.

2. Select **Settings**.

3. Navigate to the **Tools** section.

4. Click the **+ Add MCP** button.

5. Enter the following command:

   ```
   npx @hongkongkiwi/super-context-mcp@latest
   ```

6. Name the MCP: **Super Context**.

7. Click the **Add** button.

------

#### **B. Manual Configuration**

1. Press Cmd/Ctrl Shift P or go to the hamburger menu in the Augment panel
2. Select Edit Settings
3. Under Advanced, click Edit in settings.json
4. Add the server configuration to the `mcpServers` array in the `augment.advanced` object

```json
"augment.advanced": { 
  "mcpServers": [ 
    { 
      "name": "super-context", 
      "command": "npx", 
      "args": ["-y", "@hongkongkiwi/super-context-mcp@latest"] 
    } 
  ] 
}
```

</details>

<details>
<summary><strong>Gemini CLI</strong></summary>

Gemini CLI requires manual configuration through a JSON file:

1. Create or edit the `~/.gemini/settings.json` file.

2. Add the following configuration:

```json
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["@hongkongkiwi/super-context-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "your-openai-api-key",
        "MILVUS_TOKEN": "your-zilliz-cloud-api-key"
      }
    }
  }
}
```

3. Save the file and restart Gemini CLI to apply the changes.

</details>

<details>
<summary><strong>Roo Code</strong></summary>

Roo Code utilizes a JSON configuration file for MCP servers:

1. Open Roo Code and navigate to **Settings → MCP Servers → Edit Global Config**.

2. In the `mcp_settings.json` file, add the following configuration:

```json
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["@hongkongkiwi/super-context-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "your-openai-api-key",
        "MILVUS_TOKEN": "your-zilliz-cloud-api-key"
      }
    }
  }
}
```

3. Save the file to activate the server.

</details>

<details>
<summary><strong>Other MCP Clients</strong></summary>

The server uses stdio transport and follows the standard MCP protocol. It can be integrated with any MCP-compatible client by running:

```bash
npx @hongkongkiwi/super-context-mcp@latest
```

</details>

## Features

- 🔌 MCP Protocol Compliance: Full compatibility with MCP-enabled AI assistants and agents
- 🔍 Semantic Code Search: Natural language queries to find relevant code snippets
- 📁 Codebase Indexing: Index entire codebases for fast semantic search
- 🔄 Auto-Sync: Automatically detects and synchronizes file changes to keep index up-to-date
- 🧠 AI-Powered: Uses OpenAI embeddings and Milvus vector database
- ⚡ Real-time: Interactive indexing and searching with progress feedback
- 🛠️ Tool-based: Exposes three main tools via MCP protocol

## Available Tools

### 1. `index_codebase`
Index a codebase directory for semantic search.

**Parameters:**
- `path` (required): Absolute path to the codebase directory to index
- `force` (optional): Force re-indexing even if already indexed (default: false)
- `splitter` (optional): Code splitter to use - 'ast' for syntax-aware splitting with automatic fallback, 'langchain' for character-based splitting (default: "ast")
- `customExtensions` (optional): Additional file extensions to include beyond defaults (e.g., ['.vue', '.svelte', '.astro']). Extensions should include the dot prefix or will be automatically added (default: [])
- `ignorePatterns` (optional): Additional ignore patterns to exclude specific files/directories beyond defaults (e.g., ['static/**', '*.tmp', 'private/**']) (default: [])

### 2. `search_code`
Search the indexed codebase using natural language queries.

**Parameters:**
- `path` (required): Absolute path to the codebase directory to search in
- `query` (required): Natural language query to search for in the codebase
- `limit` (optional): Maximum number of results to return (default: 10, max: 50)

### 3. `clear_index`
Clear the search index for a specific codebase.

**Parameters:**
- `path` (required): Absolute path to the codebase directory to clear index for


## Contributing

This package is part of the Super Context monorepo. Please see:
- [Main Contributing Guide](../../CONTRIBUTING.md) - General contribution guidelines  
- [MCP Package Contributing](CONTRIBUTING.md) - Specific development guide for this package

## Related Projects

- **[@hongkongkiwi/super-context-core](../core)** - Core indexing engine used by this MCP server
- **[VSCode Extension](../vscode-extension)** - Alternative VSCode integration
- [Model Context Protocol](https://modelcontextprotocol.io/) - Official MCP documentation

## License

MIT - See [LICENSE](../../LICENSE) for details 