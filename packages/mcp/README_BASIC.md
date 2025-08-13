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