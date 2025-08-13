# Development Guide

This guide covers the development workflow for the Super Context monorepo.

## Project Status

### ✅ **MCP Implementation**
- **Using Official TypeScript SDK**: Yes, we're using `@modelcontextprotocol/sdk` v1.12.1
- **Current Implementation**: Full MCP server with stdio transport
- **Features**: Tool handlers for indexing, searching, and syncing

### ✅ **Build & Publishing Setup**
- **TypeScript + tsup**: Native TypeScript compilation with modern bundling option
- **ESLint**: Comprehensive monorepo configuration with TypeScript support
- **Prettier**: Code formatting with consistent rules
- **Turbo**: Build orchestration for optimal caching
- **Changesets**: Automated versioning and publishing

### ✅ **Package Configuration**
- **ESM/CJS Dual Package**: Both packages support modern and legacy imports
- **Proper Exports**: Tree-shakable imports with subpath exports
- **Publishing Ready**: NPM registry configuration with proper metadata

## Quick Start

1. **Setup Development Tools**:
   ```bash
   ./setup-dev-tools.sh
   pnpm install
   ```

2. **Development Commands**:
   ```bash
   # Build all packages
   pnpm build

   # Development mode with hot reload
   pnpm dev

   # Lint and format code
   pnpm lint:fix
   pnpm format

   # Type checking
   pnpm typecheck

   # Run tests
   pnpm test
   ```

## Package Publishing Workflow

### Using Changesets (Recommended)

1. **Create a changeset** for your changes:
   ```bash
   pnpm changeset
   ```

2. **Version packages** based on changesets:
   ```bash
   pnpm changeset:version
   ```

3. **Publish packages**:
   ```bash
   pnpm changeset:publish
   ```

### Manual Publishing

For quick releases:

```bash
# Core package
pnpm release:core

# MCP package
pnpm release:mcp
```

## Architecture Overview

### Core Package (`@hongkongkiwi/super-context-core`)

**Features**:
- Multi-vector database support (Milvus, Qdrant, Pinecone, Weaviate, Chroma, SemaDB, etc.)
- Advanced AST-based code splitting with tree-sitter
- Multiple embedding providers (OpenAI, HuggingFace, Bedrock, Vertex AI)
- Semantic code recommendations engine
- Cross-repository search capabilities
- Git history integration
- Jupyter notebook support
- Rate limiting and caching infrastructure

**Subpath Exports**:
- `@hongkongkiwi/super-context-core/splitter` - Code splitting utilities
- `@hongkongkiwi/super-context-core/embedding` - Embedding providers
- `@hongkongkiwi/super-context-core/vectordb` - Vector database implementations
- `@hongkongkiwi/super-context-core/utils` - Utility functions
- `@hongkongkiwi/super-context-core/git` - Git integration
- `@hongkongkiwi/super-context-core/search` - Search and recommendations

### MCP Package (`@hongkongkiwi/super-context-mcp`)

**Features**:
- Model Context Protocol server implementation
- Standard I/O transport for Claude integration
- Tool handlers for code indexing and search
- Configuration management
- Snapshot and sync management

## Code Quality

### ESLint Configuration

- **Extends**: Recommended TypeScript rules with import sorting
- **Plugins**: Import management, unused imports removal, Prettier integration
- **Type-aware**: Full TypeScript type checking in linting
- **Monorepo Support**: Proper project references and path resolution

### Prettier Configuration

- **Consistent Formatting**: 100 character line width, single quotes
- **Modern Style**: ES2020+ features, trailing commas
- **Integration**: Works seamlessly with ESLint

### Testing

- **Vitest**: Fast unit testing with TypeScript support
- **Coverage**: V8 coverage reporting
- **UI**: Interactive test runner available with `pnpm test:ui`

## Advanced Features

### SemaDB Integration

Latest addition to our vector database support:

```typescript
import { SemaDBVectorDatabase } from '@hongkongkiwi/super-context-core/vectordb';

const db = new SemaDBVectorDatabase({
  // Cloud version
  apiKey: 'your-rapidapi-key',
  
  // Or self-hosted
  apiUrl: 'http://localhost:8081/v2',
  userId: 'user123',
  
  // Performance tuning
  searchSize: 75,
  degreeBound: 64,
  alpha: 1.2,
  distanceMetric: 'cosine'
});
```

### Multi-Language AST Support

Enhanced AST splitter with support for:
- JavaScript/TypeScript (with JSX/TSX)
- Python
- Java
- C/C++
- Go
- Rust
- C#
- Scala

### Git History Integration

```typescript
import { GitHistoryIntegration } from '@hongkongkiwi/super-context-core/git';

const git = new GitHistoryIntegration('/path/to/repo');
const context = await git.getGitContext('src/file.ts');
// Get commits, blame, hotspots, and author information
```

## Documentation

- **API Docs**: Generated with TypeDoc at `docs/api/`
- **Examples**: See `packages/core/examples/` for usage examples
- **README**: Each package has detailed README with examples

## Contributing

1. **Fork and Clone**: Standard GitHub workflow
2. **Install Dependencies**: `pnpm install`
3. **Create Feature Branch**: `git checkout -b feature/your-feature`
4. **Develop**: Follow the code quality guidelines
5. **Test**: Ensure all tests pass
6. **Create Changeset**: `pnpm changeset`
7. **Submit PR**: With clear description of changes

## Deployment

### MCP Server

The MCP server can be deployed as:

1. **Binary**: `pnpm build:mcp && node dist/index.js`
2. **NPM Package**: `npm install -g @hongkongkiwi/super-context-mcp`
3. **Claude Desktop**: Add to `claude_desktop_config.json`

### Core Library

The core library is published to NPM and can be installed in any Node.js project:

```bash
npm install @hongkongkiwi/super-context-core
```

## Roadmap

- [ ] Additional vector database integrations
- [ ] Enhanced language support for AST parsing
- [ ] GraphRAG implementation
- [ ] Real-time indexing with file watchers
- [ ] WebAssembly support for browser usage
- [ ] Distributed indexing for large codebases