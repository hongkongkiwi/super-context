/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        'test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/examples/**'
      ]
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './packages/core/src'),
      '@core': resolve(__dirname, './packages/core/src'),
      '@mcp': resolve(__dirname, './packages/mcp/src'),
      // Test-time aliases for external SDKs to allow mocking without installs
      '@pinecone-database/pinecone': resolve(__dirname, './test/stubs/pinecone.ts'),
      'chromadb': resolve(__dirname, './test/stubs/chromadb.ts'),
      'openai': resolve(__dirname, './test/stubs/openai.ts'),
      '@huggingface/inference': resolve(__dirname, './test/stubs/huggingface.ts'),
      'voyageai': resolve(__dirname, './test/stubs/voyageai.ts')
    }
  }
})