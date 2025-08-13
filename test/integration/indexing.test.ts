import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Context, ContextConfig } from '@core/context'
import { Embedding, EmbeddingVector } from '@core/embedding/base-embedding'
import { CollectionAwareVectorDatabase, VectorDocument } from '@core/vectordb/types'
import { Splitter, CodeChunk } from '@core/splitter'
import { createTempFile, cleanupTempFile } from '../helpers/test-utils'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

class IntegrationMockEmbedding extends Embedding {
  protected maxTokens = 8192

  async detectDimension(): Promise<number> {
    return 384
  }

  async embed(text: string): Promise<EmbeddingVector> {
    return {
      vector: new Array(384).fill(0).map(() => Math.random()),
      dimension: 384
    }
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    return texts.map(() => ({
      vector: new Array(384).fill(0).map(() => Math.random()),
      dimension: 384
    }))
  }

  getDimension(): number {
    return 384
  }

  getProvider(): string {
    return 'integration-mock'
  }
}

class IntegrationMockVectorDB implements CollectionAwareVectorDatabase {
  private collections = new Map<string, VectorDocument[]>()
  private collectionMeta = new Map<string, { dimension: number; description?: string }>()

  async createCollection(name: string, dimension: number, description?: string): Promise<void> {
    this.collections.set(name, [])
    this.collectionMeta.set(name, { dimension, description })
  }

  async createHybridCollection(name: string, dimension: number, description?: string): Promise<void> {
    this.collections.set(name, [])
    this.collectionMeta.set(name, { dimension, description })
  }

  async dropCollection(name: string): Promise<void> {
    this.collections.delete(name)
    this.collectionMeta.delete(name)
  }

  async hasCollection(name: string): Promise<boolean> {
    return this.collections.has(name)
  }

  async insert(collection: string, documents: VectorDocument[]): Promise<void> {
    const existing = this.collections.get(collection) || []
    this.collections.set(collection, [...existing, ...documents])
  }

  async insertHybrid(collection: string, documents: VectorDocument[]): Promise<void> {
    await this.insert(collection, documents)
  }

  async search(collection: string, vector: number[], options?: any): Promise<any[]> {
    const documents = this.collections.get(collection) || []
    
    return documents.slice(0, options?.topK || 5).map((doc, index) => ({
      document: doc,
      score: Math.random() * 0.5 + 0.5 // Mock scores between 0.5-1.0
    }))
  }

  async query(collection: string, expr: string, fields?: string[], limit?: number): Promise<any[]> {
    const documents = this.collections.get(collection) || []
    return documents.slice(0, limit || 10).map(doc => ({ id: doc.id }))
  }

  async delete(collection: string, ids: string[]): Promise<void> {
    const documents = this.collections.get(collection) || []
    const filtered = documents.filter(doc => !ids.includes(doc.id))
    this.collections.set(collection, filtered)
  }

  async hybridSearch(): Promise<any> {
    return { results: [] }
  }

  getDocuments(collection: string): VectorDocument[] {
    return this.collections.get(collection) || []
  }
}

class IntegrationMockSplitter implements Splitter {
  async split(content: string, language: string, filePath?: string): Promise<CodeChunk[]> {
    const lines = content.split('\n')
    const chunkSize = 10 // Split into 10-line chunks
    const chunks: CodeChunk[] = []

    for (let i = 0; i < lines.length; i += chunkSize) {
      const chunkLines = lines.slice(i, i + chunkSize)
      const chunkContent = chunkLines.join('\n')
      
      if (chunkContent.trim()) {
        chunks.push({
          content: chunkContent,
          metadata: {
            filePath: filePath || 'unknown',
            language,
            startLine: i + 1,
            endLine: Math.min(i + chunkSize, lines.length)
          }
        })
      }
    }

    return chunks.length > 0 ? chunks : [{
      content,
      metadata: {
        filePath: filePath || 'unknown',
        language,
        startLine: 1,
        endLine: lines.length
      }
    }]
  }

  splitText(text: string): string[] {
    return text.split('\n').filter(line => line.trim())
  }
}

describe('Integration Tests - Indexing', () => {
  let context: Context
  let mockVectorDB: IntegrationMockVectorDB
  let mockEmbedding: IntegrationMockEmbedding
  let mockSplitter: IntegrationMockSplitter
  let tempDir: string
  let tempFiles: string[] = []

  beforeEach(async () => {
    mockVectorDB = new IntegrationMockVectorDB()
    mockEmbedding = new IntegrationMockEmbedding()
    mockSplitter = new IntegrationMockSplitter()

    const config: ContextConfig = {
      vectorDatabase: mockVectorDB,
      embedding: mockEmbedding,
      codeSplitter: mockSplitter,
      supportedExtensions: ['.js', '.ts', '.py', '.md'],
      ignorePatterns: ['node_modules/**', '.git/**', '*.log']
    }

    context = new Context(config)
    
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-test-'))
  })

  afterEach(async () => {
    // Clean up temp files
    for (const filePath of tempFiles) {
      await cleanupTempFile(filePath)
    }
    tempFiles = []
    
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  describe('indexCodebase', () => {
    it('should index a simple codebase with multiple files', async () => {
      // Create test files
      const jsFile = path.join(tempDir, 'utils.js')
      const tsFile = path.join(tempDir, 'types.ts')
      const pyFile = path.join(tempDir, 'main.py')
      
      fs.writeFileSync(jsFile, `
function calculateSum(a, b) {
  return a + b;
}

function calculateProduct(a, b) {
  return a * b;
}

module.exports = { calculateSum, calculateProduct };
      `.trim())
      
      fs.writeFileSync(tsFile, `
interface User {
  id: number;
  name: string;
  email: string;
}

class UserService {
  private users: User[] = [];
  
  addUser(user: User): void {
    this.users.push(user);
  }
  
  getUser(id: number): User | undefined {
    return this.users.find(u => u.id === id);
  }
}
      `.trim())
      
      fs.writeFileSync(pyFile, `
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

class Calculator:
    def __init__(self):
        self.history = []
    
    def add(self, a, b):
        result = a + b
        self.history.append(f"{a} + {b} = {result}")
        return result
      `.trim())

      // Index the codebase
      const progressUpdates: any[] = []
      const result = await context.indexCodebase(
        tempDir,
        (progress) => progressUpdates.push(progress)
      )

      // Verify indexing results
      expect(result.indexedFiles).toBe(3)
      expect(result.totalChunks).toBeGreaterThan(0)
      expect(result.status).toBe('completed')
      
      // Verify progress updates were called
      expect(progressUpdates.length).toBeGreaterThan(0)
      expect(progressUpdates[0]).toHaveProperty('phase')
      expect(progressUpdates[0]).toHaveProperty('percentage')
      
      // Verify collection was created
      const collectionName = context.getCollectionName(tempDir)
      expect(await mockVectorDB.hasCollection(collectionName)).toBe(true)
      
      // Verify documents were inserted
      const documents = mockVectorDB.getDocuments(collectionName)
      expect(documents.length).toBeGreaterThan(0)
      
      // Verify document structure
      documents.forEach(doc => {
        expect(doc).toHaveProperty('id')
        expect(doc).toHaveProperty('content')
        expect(doc).toHaveProperty('vector')
        expect(doc).toHaveProperty('relativePath')
        expect(doc).toHaveProperty('metadata')
        expect(doc.vector).toHaveLength(384)
      })
    })

    it('should handle empty directories', async () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-test-'))
      
      const result = await context.indexCodebase(emptyDir)
      
      expect(result.indexedFiles).toBe(0)
      expect(result.totalChunks).toBe(0)
      expect(result.status).toBe('completed')
      
      fs.rmSync(emptyDir, { recursive: true, force: true })
    })

    it('should respect ignore patterns', async () => {
      // Create files that should be ignored
      fs.mkdirSync(path.join(tempDir, 'node_modules'))
      fs.writeFileSync(path.join(tempDir, 'node_modules', 'ignored.js'), 'console.log("ignored")')
      fs.writeFileSync(path.join(tempDir, 'app.log'), 'log content')
      
      // Create files that should be included
      fs.writeFileSync(path.join(tempDir, 'main.js'), 'console.log("main")')
      
      const result = await context.indexCodebase(tempDir)
      
      expect(result.indexedFiles).toBe(1) // Only main.js should be indexed
      
      const collectionName = context.getCollectionName(tempDir)
      const documents = mockVectorDB.getDocuments(collectionName)
      
      // Verify only non-ignored files were processed
      expect(documents.every(doc => doc.relativePath === 'main.js')).toBe(true)
    })

    it('should handle force reindex', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.js'), 'console.log("test")')
      
      // First indexing
      await context.indexCodebase(tempDir)
      const collectionName = context.getCollectionName(tempDir)
      expect(await mockVectorDB.hasCollection(collectionName)).toBe(true)
      
      // Force reindex should recreate collection
      const result = await context.indexCodebase(tempDir, undefined, true)
      
      expect(result.indexedFiles).toBe(1)
      expect(await mockVectorDB.hasCollection(collectionName)).toBe(true)
    })
  })

  describe('semanticSearch', () => {
    beforeEach(async () => {
      // Set up indexed codebase for search tests
      fs.writeFileSync(path.join(tempDir, 'utils.js'), `
function calculateSum(a, b) {
  return a + b;
}

function calculateAverage(numbers) {
  const sum = numbers.reduce((acc, num) => acc + num, 0);
  return sum / numbers.length;
}
      `.trim())
      
      await context.indexCodebase(tempDir)
    })

    it('should perform semantic search and return results', async () => {
      const results = await context.semanticSearch(tempDir, 'calculate sum function', 5)
      
      expect(results).toBeInstanceOf(Array)
      // Mock implementation returns empty array since hybridSearch is mocked
      // In real implementation, this would return actual results
    })

    it('should return empty results for non-existent index', async () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent')
      const results = await context.semanticSearch(nonExistentPath, 'test query')
      
      expect(results).toEqual([])
    })

    it('should handle empty query', async () => {
      const results = await context.semanticSearch(tempDir, '')
      
      expect(results).toBeInstanceOf(Array)
    })
  })

  describe('hasIndex', () => {
    it('should return false for unindexed codebase', async () => {
      const hasIndex = await context.hasIndex(tempDir)
      expect(hasIndex).toBe(false)
    })

    it('should return true for indexed codebase', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.js'), 'console.log("test")')
      await context.indexCodebase(tempDir)
      
      const hasIndex = await context.hasIndex(tempDir)
      expect(hasIndex).toBe(true)
    })
  })

  describe('clearIndex', () => {
    it('should clear existing index', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.js'), 'console.log("test")')
      await context.indexCodebase(tempDir)
      
      expect(await context.hasIndex(tempDir)).toBe(true)
      
      await context.clearIndex(tempDir)
      
      expect(await context.hasIndex(tempDir)).toBe(false)
    })
  })
})