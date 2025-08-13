import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import * as fs from 'fs'
// Mock the langchain splitter before importing Context
vi.mock('@core/splitter/langchain-splitter', () => ({
  LangChainCodeSplitter: vi.fn().mockImplementation(() => ({
    split: vi.fn().mockResolvedValue([]),
    splitText: vi.fn().mockReturnValue([])
  }))
}))

import { Context, ContextConfig } from '@core/context'
import { Embedding, EmbeddingVector } from '@core/embedding/base-embedding'
import { CollectionAwareVectorDatabase, VectorDocument } from '@core/vectordb/types'
import { Splitter, CodeChunk } from '@core/splitter'
import { createMockEmbedding, createMockVectorDB, createTempFile, cleanupTempFile } from '../../helpers/test-utils'

class MockEmbedding extends Embedding {
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
    return 'mock'
  }
}

class MockVectorDB implements CollectionAwareVectorDatabase {
  private collections = new Map<string, boolean>()

  async createCollection(name: string, dimension: number): Promise<void> {
    this.collections.set(name, true)
  }

  async createHybridCollection(name: string, dimension: number): Promise<void> {
    this.collections.set(name, true)
  }

  async dropCollection(name: string): Promise<void> {
    this.collections.delete(name)
  }

  async hasCollection(name: string): Promise<boolean> {
    return this.collections.has(name)
  }

  async insert(collection: string, documents: VectorDocument[]): Promise<void> {
    // Mock implementation
  }

  async insertHybrid(collection: string, documents: VectorDocument[]): Promise<void> {
    // Mock implementation
  }

  async search(collection: string, vector: number[], options?: any): Promise<any[]> {
    return []
  }

  async query(collection: string, expr: string, fields?: string[], limit?: number): Promise<any[]> {
    return []
  }

  async delete(collection: string, ids: string[]): Promise<void> {
    // Mock implementation
  }

  async hybridSearch(): Promise<any> {
    return { results: [] }
  }
}

class MockSplitter implements Splitter {
  async split(content: string, language: string, filePath?: string): Promise<CodeChunk[]> {
    return [{
      content: content.substring(0, 100),
      metadata: {
        filePath: filePath || 'test.js',
        language,
        startLine: 1,
        endLine: 5
      }
    }]
  }

  splitText(text: string): string[] {
    return [text]
  }
}

describe('Context', () => {
  let context: Context
  let mockVectorDB: MockVectorDB
  let mockEmbedding: MockEmbedding
  let mockSplitter: MockSplitter

  beforeEach(() => {
    mockVectorDB = new MockVectorDB()
    mockEmbedding = new MockEmbedding()
    mockSplitter = new MockSplitter()

    const config: ContextConfig = {
      vectorDatabase: mockVectorDB,
      embedding: mockEmbedding,
      codeSplitter: mockSplitter,
      supportedExtensions: [],
      ignorePatterns: ['node_modules', '.git']
    }

    context = new Context(config)
  })

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(context.getEmbedding()).toBe(mockEmbedding)
      expect(context.getVectorDatabase()).toBe(mockVectorDB)
      expect(context.getCodeSplitter()).toBe(mockSplitter)
    })

    it('should throw error without vector database', () => {
      expect(() => {
        new Context({ embedding: mockEmbedding })
      }).toThrow('VectorDatabase is required')
    })

    it('should use default extensions if none provided', () => {
      const contextWithDefaults = new Context({ vectorDatabase: mockVectorDB })
      const extensions = contextWithDefaults.getSupportedExtensions()
      
      expect(extensions).toContain('.js')
      expect(extensions).toContain('.ts')
      expect(extensions).toContain('.py')
    })
  })

  describe('getters', () => {
    it('should return embedding instance', () => {
      expect(context.getEmbedding()).toBe(mockEmbedding)
    })

    it('should return vector database instance', () => {
      expect(context.getVectorDatabase()).toBe(mockVectorDB)
    })

    it('should return code splitter instance', () => {
      expect(context.getCodeSplitter()).toBe(mockSplitter)
    })

    it('should return supported extensions copy', () => {
      const extensions = context.getSupportedExtensions()
      expect(extensions.length).toBeGreaterThan(0)
      expect(extensions).toContain('.js')
      expect(extensions).toContain('.ts')
      expect(extensions).toContain('.py')
      
      // Modify returned array should not affect internal state
      const originalLength = extensions.length
      extensions.push('.java')
      expect(context.getSupportedExtensions().length).toBe(originalLength)
    })

    it('should return ignore patterns copy', () => {
      const patterns = context.getIgnorePatterns()
      expect(patterns).toContain('node_modules')
      expect(patterns).toContain('.git')
      
      // Modify returned array should not affect internal state
      patterns.push('test-pattern')
      expect(context.getIgnorePatterns()).not.toContain('test-pattern')
    })
  })

  describe('getCollectionName', () => {
    it('should generate consistent collection name for same path', () => {
      const path1 = '/test/project'
      const path2 = '/test/project'
      
      expect(context.getCollectionName(path1)).toBe(context.getCollectionName(path2))
    })

    it('should generate different collection names for different paths', () => {
      const path1 = '/test/project1'
      const path2 = '/test/project2'
      
      expect(context.getCollectionName(path1)).not.toBe(context.getCollectionName(path2))
    })

    it('should include hybrid prefix when hybrid mode is enabled', () => {
      vi.stubEnv('HYBRID_MODE', 'true')
      const collectionName = context.getCollectionName('/test/project')
      expect(collectionName).toMatch(/^hybrid_code_chunks_/)
      vi.unstubAllEnvs()
    })
  })

  describe('hasIndex', () => {
    beforeEach(() => {
      // Stub fs.promises.access to succeed for test paths
      const originalAccess = (fs as any).promises?.access || fs.access;
      vi.spyOn(fs.promises, 'access').mockImplementation(async (p: any) => {
        const pathStr = String(p);
        if (pathStr.startsWith('/test/')) return;
        // Delegate to original for real paths
        return originalAccess(p as any);
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return true when collection exists', async () => {
      const codebasePath = '/test/project'
      const collectionName = context.getCollectionName(codebasePath)
      await mockVectorDB.createCollection(collectionName, 384)
      
      const hasIndex = await context.hasIndex(codebasePath)
      expect(hasIndex).toBe(true)
    })

    it('should return false when collection does not exist', async () => {
      const codebasePath = '/test/nonexistent'
      const hasIndex = await context.hasIndex(codebasePath)
      expect(hasIndex).toBe(false)
    })
  })

  describe('clearIndex', () => {
    it('should drop collection and delete snapshot', async () => {
      const codebasePath = '/test/project'
      const collectionName = context.getCollectionName(codebasePath)
      await mockVectorDB.createCollection(collectionName, 384)
      
      expect(await mockVectorDB.hasCollection(collectionName)).toBe(true)
      
      await context.clearIndex(codebasePath)
      
      expect(await mockVectorDB.hasCollection(collectionName)).toBe(false)
    })

    it('should handle non-existent collection gracefully', async () => {
      const codebasePath = '/test/nonexistent'
      
      // Should not throw error
      await expect(context.clearIndex(codebasePath)).resolves.not.toThrow()
    })
  })

  describe('updateIgnorePatterns', () => {
    it('should add new patterns to existing ones', () => {
      const newPatterns = ['*.log', 'temp/**']
      context.updateIgnorePatterns(newPatterns)
      
      const patterns = context.getIgnorePatterns()
      expect(patterns).toContain('*.log')
      expect(patterns).toContain('temp/**')
      expect(patterns).toContain('node_modules') // Should keep existing
    })

    it('should remove duplicates', () => {
      const newPatterns = ['node_modules', 'new-pattern']
      context.updateIgnorePatterns(newPatterns)
      
      const patterns = context.getIgnorePatterns()
      const nodeModulesCount = patterns.filter(p => p === 'node_modules').length
      expect(nodeModulesCount).toBe(1)
    })
  })

  describe('addCustomIgnorePatterns', () => {
    it('should add custom patterns without replacing existing', () => {
      const originalCount = context.getIgnorePatterns().length
      const customPatterns = ['custom1', 'custom2']
      
      context.addCustomIgnorePatterns(customPatterns)
      
      const patterns = context.getIgnorePatterns()
      expect(patterns).toContain('custom1')
      expect(patterns).toContain('custom2')
      expect(patterns.length).toBeGreaterThan(originalCount)
    })

    it('should handle empty array gracefully', () => {
      const originalCount = context.getIgnorePatterns().length
      context.addCustomIgnorePatterns([])
      
      expect(context.getIgnorePatterns().length).toBe(originalCount)
    })
  })

  describe('resetIgnorePatternsToDefaults', () => {
    it('should reset to default patterns only', () => {
      context.addCustomIgnorePatterns(['custom-pattern'])
      expect(context.getIgnorePatterns()).toContain('custom-pattern')
      
      context.resetIgnorePatternsToDefaults()
      expect(context.getIgnorePatterns()).not.toContain('custom-pattern')
      expect(context.getIgnorePatterns()).toContain('node_modules')
    })
  })

  describe('updateEmbedding', () => {
    it('should update embedding instance', () => {
      const newEmbedding = new MockEmbedding()
      context.updateEmbedding(newEmbedding)
      
      expect(context.getEmbedding()).toBe(newEmbedding)
    })
  })

  describe('updateVectorDatabase', () => {
    it('should update vector database instance', () => {
      const newVectorDB = new MockVectorDB()
      context.updateVectorDatabase(newVectorDB)
      
      expect(context.getVectorDatabase()).toBe(newVectorDB)
    })
  })

  describe('updateSplitter', () => {
    it('should update splitter instance', () => {
      const newSplitter = new MockSplitter()
      context.updateSplitter(newSplitter)
      
      expect(context.getCodeSplitter()).toBe(newSplitter)
    })
  })

  describe('addCustomExtensions', () => {
    it('should add custom extensions', () => {
      const customExtensions = ['scala', '.kt']
      context.addCustomExtensions(customExtensions)
      
      const extensions = context.getSupportedExtensions()
      expect(extensions).toContain('.scala')
      expect(extensions).toContain('.kt')
    })

    it('should normalize extensions to start with dot', () => {
      context.addCustomExtensions(['java', '.cpp'])
      
      const extensions = context.getSupportedExtensions()
      expect(extensions).toContain('.java')
      expect(extensions).toContain('.cpp')
    })

    it('should handle empty array gracefully', () => {
      const originalCount = context.getSupportedExtensions().length
      context.addCustomExtensions([])
      
      expect(context.getSupportedExtensions().length).toBe(originalCount)
    })
  })
})