# Super Context MCP Server - Setup Guide

This guide follows standard MCP (Model Context Protocol) configuration patterns for Claude Desktop integration.

## 🚀 Quick Setup

### Step 1: Install the Server
```bash
npm install -g @hongkongkiwi/super-context-mcp
```

### Step 2: Configure Claude Desktop

Open Claude Desktop, go to **Settings** → **Developer** → **Edit Config**, then add:

```json
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["@hongkongkiwi/super-context-mcp"],
      "env": {
        "OPENAI_API_KEY": "your-openai-api-key-here"
      }
    }
  }
}
```

### Step 3: Restart Claude Desktop

Close and reopen Claude Desktop. The server will be available immediately!

## 📋 Configuration Examples

### Basic Configuration (Recommended)
```json
{
  "mcpServers": {
    "super-context": {
      "command": "npx",
      "args": ["@hongkongkiwi/super-context-mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-your-key-here"
      }
    }
  }
}
```

### With Content Encryption (Private Projects)
```json
{
  "mcpServers": {
    "super-context-encrypted": {
      "command": "npx",
      "args": ["@hongkongkiwi/super-context-mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-your-key-here",
        "ENCRYPTION_KEY": "your-32-character-encryption-key"
      }
    }
  }
}
```

### Stateless Mode (No File Access)
```json
{
  "mcpServers": {
    "super-context-stateless": {
      "command": "npx",
      "args": ["@hongkongkiwi/super-context-mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-your-key-here",
        "MCP_STATELESS_MODE": "true"
      }
    }
  }
}
```

### Using Qdrant Vector Database
```json
{
  "mcpServers": {
    "super-context-qdrant": {
      "command": "npx",
      "args": ["@hongkongkiwi/super-context-mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-your-key-here",
        "VECTOR_DATABASE": "qdrant",
        "QDRANT_URL": "http://localhost:6333"
      }
    }
  }
}
```

### Multiple Servers (Different Configurations)
```json
{
  "mcpServers": {
    "super-context-basic": {
      "command": "npx",
      "args": ["@hongkongkiwi/super-context-mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-your-key-here"
      }
    },
    "super-context-encrypted": {
      "command": "npx",
      "args": ["@hongkongkiwi/super-context-mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-your-key-here",
        "ENCRYPTION_KEY": "your-encryption-key-32-characters",
        "MCP_STATELESS_MODE": "true"
      }
    }
  }
}
```

## 🛠️ Environment Variables Reference

### Required
| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for embeddings | `sk-proj-...` |

### Optional Features
| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `ENCRYPTION_KEY` | Content encryption (32+ chars) | None | `your-secret-key-32-characters-min` |
| `VECTOR_DATABASE` | Vector database type | `milvus` | `qdrant` |
| `MCP_STATELESS_MODE` | Stateless operation mode | `false` | `true` |
| `LOG_LEVEL` | Logging verbosity | `warn` | `info`, `debug`, `error` |

### Vector Database Configuration
| Variable | Description | Default |
|----------|-------------|---------|
| `MILVUS_ADDRESS` | Milvus server address | `localhost:19530` |
| `MILVUS_TOKEN` | Milvus authentication token | None |
| `QDRANT_URL` | Qdrant server URL | `http://localhost:6333` |
| `QDRANT_API_KEY` | Qdrant API key | None |

### Alternative Embedding Providers
| Variable | Description |
|----------|-------------|
| `VOYAGE_API_KEY` | Voyage AI API key |
| `HUGGINGFACE_API_KEY` | HuggingFace API key |
| `GEMINI_API_KEY` | Google Gemini API key |

## 📍 Configuration File Locations

### macOS
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

### Windows
```
%APPDATA%\Claude\claude_desktop_config.json
```

### Linux
```
~/.config/Claude/claude_desktop_config.json
```

## 🔧 Available Tools

Once configured, the following tools are available in Claude Desktop:

### Filesystem Mode (Default)
- **`index_codebase`** - Index a directory for semantic search
- **`search_code`** - Search indexed code using natural language
- **`get_status`** - Show server status and configuration
- **`clear_index`** - Clear search index for a directory

### Stateless Mode
- **`index_files`** - Index files provided directly as content
- **`search_code`** - Search indexed content by project name
- **`get_status`** - Show server status and configuration
- **`clear_index`** - Clear index for a project

## ✅ Testing Your Setup

### 1. Check Server Status
Ask Claude: "What's the status of the Super Context server?"

### 2. Index a Codebase (Filesystem Mode)
Ask Claude: "Index the codebase at /path/to/my/project"

### 3. Search Code
Ask Claude: "Search for functions that handle user authentication"

### 4. Index Files (Stateless Mode)
Provide files directly to Claude and ask: "Index these files in a project called 'my-project'"

## 🐛 Troubleshooting

### Common Issues

#### 1. "No embedding provider API key found"
**Solution**: Add `OPENAI_API_KEY` to the `env` section of your config.

#### 2. "Connection closed" errors on Windows
**Solution**: Add `cmd /c` wrapper:
```json
{
  "command": "cmd",
  "args": ["/c", "npx", "@hongkongkiwi/super-context-mcp"]
}
```

#### 3. Path not found errors
**Solution**: Use absolute paths in NPX command or install globally:
```bash
npm install -g @hongkongkiwi/super-context-mcp
```

#### 4. JSON syntax errors
**Solution**: Validate your JSON using an online validator. Common issues:
- Trailing commas
- Missing quotes around strings
- Incorrect bracket/brace matching

### Debug Logging

For detailed logging, add to your config:
```json
"env": {
  "LOG_LEVEL": "debug"
}
```

### Check Logs (macOS)
```bash
tail -f ~/Library/Logs/Claude/mcp*.log
```

## 🔒 Security Best Practices

### 1. Basic Setup (Most Users)
```json
"env": {
  "OPENAI_API_KEY": "sk-your-key"
}
```

### 2. Private/Sensitive Projects
```json
"env": {
  "OPENAI_API_KEY": "sk-your-key",
  "ENCRYPTION_KEY": "$(openssl rand -hex 32)"
}
```

### 3. Shared/Team Environments
```json
"env": {
  "OPENAI_API_KEY": "sk-your-key",
  "MCP_STATELESS_MODE": "true"
}
```

## 📚 Usage Examples

### Example 1: Index and Search a React Project
1. Configure the server in Claude Desktop
2. Ask Claude: "Index the React project at /Users/me/projects/my-react-app"
3. Ask Claude: "Find components that handle user authentication"
4. Ask Claude: "Show me how state management is implemented"

### Example 2: Stateless Project Analysis  
1. Set `MCP_STATELESS_MODE: "true"` in config
2. Paste code files into Claude
3. Ask Claude: "Index these files as project 'analysis'"
4. Ask Claude: "Search for security vulnerabilities in this code"

### Example 3: Multi-Project Comparison
1. Configure multiple server instances
2. Index different projects with each server
3. Ask Claude: "Compare the authentication patterns between projects"

## 🚀 Next Steps

1. **Start Simple**: Use the basic configuration first
2. **Add Features**: Enable encryption for sensitive projects
3. **Customize**: Adjust vector database and embedding provider as needed
4. **Scale**: Use multiple server configurations for different projects

For advanced configuration options, see:
- [OPTIONAL_FEATURES.md](./OPTIONAL_FEATURES.md) - Detailed feature guide
- [TRANSPORT_GUIDE.md](./TRANSPORT_GUIDE.md) - Advanced transport options

The server follows standard MCP patterns and works seamlessly with Claude Desktop's configuration system.