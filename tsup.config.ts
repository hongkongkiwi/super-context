import { defineConfig } from 'tsup'

export default defineConfig([
  // Core library configuration - modern build
  {
    name: 'core-modern',
    entry: ['packages/core/src/index.ts'],
    outDir: 'packages/core/dist-modern',
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: true,
    treeshake: true,
    minify: false, // Keep readable for debugging
    target: 'es2022',
    platform: 'node',
    external: [
      // Node built-ins
      /^node:/,
      // Heavy dependencies that should be externalized
      'langchain',
      'openai',
      '@zilliz/milvus2-sdk-node',
      '@qdrant/js-client-rest',
      'chromadb',
      'weaviate-ts-client',
      '@pinecone-database/pinecone',
      '@upstash/vector',
      'faiss-node',
      'pg',
      'firebase',
      'firebase-admin',
      '@aws-sdk/client-s3',
      '@aws-sdk/client-bedrock-runtime',
      '@google-cloud/aiplatform',
      // Tree-sitter parsers (native bindings)
      /^tree-sitter/,
      // Other heavy deps
      '@huggingface/inference',
      'voyageai',
      'ollama',
      'fs-extra',
      'glob',
      'typescript',
    ],
    esbuildOptions: (options) => {
      // Preserve native modules
      options.packages = 'external'
      // Keep names for debugging
      options.keepNames = true
      // Preserve comments in dev builds
      options.legalComments = 'inline'
    },
    onSuccess: async () => {
      console.log('✅ Core library modern build completed')
    }
  },
  
  // MCP server configuration - optimized single binary
  {
    name: 'mcp-cli',
    entry: ['packages/mcp/src/index.ts'],
    outDir: 'packages/mcp/dist-modern',
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    // Bundle MCP as single file for CLI distribution
    splitting: false,
    treeshake: true,
    minify: false,
    target: 'es2022',
    platform: 'node',
    banner: {
      js: '#!/usr/bin/env node'
    },
    external: [
      // External dependencies that should not be bundled
      '@hongkongkiwi/super-context-core',
      '@modelcontextprotocol/sdk',
      'zod'
    ],
    esbuildOptions: (options) => {
      options.target = 'es2022'
      options.keepNames = true
      options.legalComments = 'inline'
    },
    onSuccess: async () => {
      console.log('✅ MCP server modern build completed')
    }
  }
])

// Configuration for individual package builds
export const coreConfig = defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist-modern',
  format: ['esm', 'cjs'],
  dts: {
    resolve: true,
    // Split .d.ts files for tree-shaking
    splitting: true,
  },
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  minify: false,
  target: 'es2022',
  platform: 'node',
  external: [
    /^node:/,
    'langchain',
    'openai',
    '@zilliz/milvus2-sdk-node',
    '@qdrant/js-client-rest',
    'chromadb',
    'weaviate-ts-client',
    '@pinecone-database/pinecone',
    '@upstash/vector',
    'faiss-node',
    'pg',
    'firebase',
    'firebase-admin',
    '@aws-sdk/client-s3',
    '@aws-sdk/client-bedrock-runtime',
    '@google-cloud/aiplatform',
    /^tree-sitter/,
    '@huggingface/inference',
    'voyageai',
    'ollama',
    'fs-extra',
    'glob',
    'typescript',
  ],
})

export const mcpConfig = defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist-modern', 
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false,
  target: 'es2022',
  platform: 'node',
  banner: {
    js: '#!/usr/bin/env node'
  },
  external: [
    '@hongkongkiwi/super-context-core',
    '@modelcontextprotocol/sdk',
    'zod'
  ],
})