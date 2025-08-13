import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PineconeVectorDatabase } from '@core/vectordb/pinecone-vectordb'
import { ChromaVectorDatabase } from '@core/vectordb/chroma-vectordb'
import { VectorDocument, VectorSearchResult } from '@core/vectordb/types'

// Mock external dependencies
vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: vi.fn().mockImplementation(() => ({
    Index: vi.fn().mockImplementation(() => ({
      upsert: vi.fn().mockResolvedValue({}),
      query: vi.fn().mockResolvedValue({
        matches: [
          { id: 'doc1', score: 0.95, values: [], metadata: {} },
          { id: 'doc2', score: 0.87, values: [], metadata: {} }
        ]
      }),
      deleteAll: vi.fn().mockResolvedValue({}),
      describeIndexStats: vi.fn().mockResolvedValue({
        totalVectorCount: 100,
        dimension: 1536
      })
    })),
    createIndex: vi.fn().mockResolvedValue({}),
    deleteIndex: vi.fn().mockResolvedValue({}),
    listIndexes: vi.fn().mockResolvedValue({
      indexes: [{ name: 'test-index', dimension: 1536 }]
    })
  }))
}))

vi.mock('chromadb', () => ({
  ChromaApi: vi.fn().mockImplementation(() => ({
    createCollection: vi.fn().mockResolvedValue({
      id: 'test-collection',
      name: 'test-collection',
      add: vi.fn().mockResolvedValue({}),
      query: vi.fn().mockResolvedValue({
        ids: [['doc1', 'doc2']],
        distances: [[0.1, 0.2]],
        metadatas: [[{ path: '/test1.js' }, { path: '/test2.js' }]],
        documents: [['content1', 'content2']]
      }),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(100)
    }),
    deleteCollection: vi.fn().mockResolvedValue({}),
    listCollections: vi.fn().mockResolvedValue([
      { name: 'test-collection' }
    ]),
    getCollection: vi.fn().mockResolvedValue({
      name: 'test-collection',
      add: vi.fn().mockResolvedValue({}),
      query: vi.fn().mockResolvedValue({
        ids: [['doc1']],
        distances: [[0.1]],
        metadatas: [[{ path: '/test.js' }]],
        documents: [['test content']]
      })
    })
  }))
}))

describe('Concrete VectorDB Implementations', () => {
  describe('PineconeVectorDatabase', () => {
    let vectorDB: PineconeVectorDatabase
    const mockDocuments: VectorDocument[] = [
      {
        id: 'test-doc-1',
        content: 'function test() { return "hello"; }',
        vector: new Array(1536).fill(0).map(() => Math.random()),
        source: '/test/file1.js',
        relativePath: 'file1.js',
        startLine: 1,
        endLine: 3,
        fileExtension: '.js',
        metadata: {
          language: 'javascript',
          codebasePath: '/test',
          chunkIndex: 0
        }
      }
    ]

    beforeEach(() => {
      vectorDB = new PineconeVectorDatabase({
        apiKey: 'test-api-key',
        environment: 'test-env',
        indexName: 'test-index'
      })
    })

    it('should initialize with correct configuration', () => {
      expect(vectorDB).toBeInstanceOf(PineconeVectorDatabase)
    })

    it('should create collection', async () => {
      await expect(vectorDB.createCollection('test-collection', 1536)).resolves.not.toThrow()
    })

    it('should check if collection exists', async () => {
      const exists = await vectorDB.hasCollection('test-collection')
      expect(typeof exists).toBe('boolean')
    })

    it('should insert documents', async () => {
      await expect(vectorDB.insert('test-collection', mockDocuments)).resolves.not.toThrow()
    })

    it('should search vectors', async () => {
      const queryVector = new Array(1536).fill(0).map(() => Math.random())
      const results = await vectorDB.search('test-collection', queryVector, { topK: 5 })
      
      expect(results).toBeInstanceOf(Array)
      results.forEach(result => {
        expect(result).toHaveProperty('document')
        expect(result).toHaveProperty('score')
        expect(typeof result.score).toBe('number')
      })
    })

    it('should handle search with filters', async () => {
      const queryVector = new Array(1536).fill(0).map(() => Math.random())
      const results = await vectorDB.search('test-collection', queryVector, {
        topK: 5,
        filterExpr: 'language == "javascript"'
      })
      
      expect(results).toBeInstanceOf(Array)
    })

    it('should delete collection', async () => {
      await expect(vectorDB.dropCollection('test-collection')).resolves.not.toThrow()
    })

    it('should handle errors gracefully', async () => {
      const mockPinecone = vi.mocked(require('@pinecone-database/pinecone').Pinecone)
      mockPinecone.mockImplementation(() => ({
        Index: () => ({
          query: vi.fn().mockRejectedValue(new Error('Pinecone API error'))
        })
      }))

      const failingVectorDB = new PineconeVectorDatabase({
        apiKey: 'invalid-key',
        environment: 'test-env',
        indexName: 'test-index'
      })

      const queryVector = new Array(1536).fill(0).map(() => Math.random())
      await expect(failingVectorDB.search('test-collection', queryVector)).rejects.toThrow()
    })
  })

  describe('ChromaVectorDatabase', () => {
    let vectorDB: ChromaVectorDatabase

    beforeEach(() => {
      vectorDB = new ChromaVectorDatabase({
        host: 'localhost',
        port: 8000
      })
    })

    it('should initialize with correct configuration', () => {
      expect(vectorDB).toBeInstanceOf(ChromaVectorDatabase)
    })

    it('should create collection', async () => {
      await expect(vectorDB.createCollection('test-collection', 384)).resolves.not.toThrow()
    })

    it('should check collection existence', async () => {
      const exists = await vectorDB.hasCollection('test-collection')
      expect(typeof exists).toBe('boolean')
    })

    it('should insert documents', async () => {
      const mockDocuments: VectorDocument[] = [
        {
          id: 'chroma-doc-1',
          content: 'test content for chroma',
          vector: new Array(384).fill(0).map(() => Math.random()),
          source: '/test/chroma.js',
          relativePath: 'chroma.js',
          startLine: 1,
          endLine: 1,
          fileExtension: '.js',
          metadata: {
            language: 'javascript',
            codebasePath: '/test',
            chunkIndex: 0
          }
        }
      ]

      await expect(vectorDB.insert('test-collection', mockDocuments)).resolves.not.toThrow()
    })

    it('should perform vector search', async () => {
      const queryVector = new Array(384).fill(0).map(() => Math.random())
      const results = await vectorDB.search('test-collection', queryVector, { topK: 3 })
      
      expect(results).toBeInstanceOf(Array)
      results.forEach(result => {
        expect(result).toHaveProperty('document')
        expect(result).toHaveProperty('score')
        expect(typeof result.score).toBe('number')
      })
    })

    it('should handle batch operations', async () => {
      const documents: VectorDocument[] = Array.from({ length: 10 }, (_, i) => ({
        id: `batch-doc-${i}`,
        content: `batch content ${i}`,
        vector: new Array(384).fill(0).map(() => Math.random()),
        source: `/test/batch${i}.js`,
        relativePath: `batch${i}.js`,
        startLine: 1,
        endLine: 1,
        fileExtension: '.js',
        metadata: {
          language: 'javascript',
          codebasePath: '/test',
          chunkIndex: i
        }
      }))

      await expect(vectorDB.insert('test-collection', documents)).resolves.not.toThrow()
    })

    it('should delete collection', async () => {
      await expect(vectorDB.dropCollection('test-collection')).resolves.not.toThrow()
    })

    it('should handle connection errors', async () => {
      const mockChroma = vi.mocked(require('chromadb').ChromaApi)
      mockChroma.mockImplementation(() => ({
        createCollection: vi.fn().mockRejectedValue(new Error('Connection refused'))
      }))

      const failingVectorDB = new ChromaVectorDatabase({
        host: 'unreachable-host',
        port: 8000
      })

      await expect(failingVectorDB.createCollection('test', 384)).rejects.toThrow()
    })
  })

  describe('VectorDB Interface Compliance', () => {
    const testImplementations = [
      {
        name: 'PineconeVectorDatabase',
        create: () => new PineconeVectorDatabase({
          apiKey: 'test-key',
          environment: 'test-env',
          indexName: 'test-index'
        })
      },
      {
        name: 'ChromaVectorDatabase', 
        create: () => new ChromaVectorDatabase({
          host: 'localhost',
          port: 8000
        })
      }
    ]

    testImplementations.forEach(({ name, create }) => {
      describe(`${name} Interface Compliance`, () => {
        let vectorDB: any

        beforeEach(() => {
          vectorDB = create()
        })

        it('should implement all required methods', () => {
          expect(typeof vectorDB.createCollection).toBe('function')
          expect(typeof vectorDB.hasCollection).toBe('function')
          expect(typeof vectorDB.insert).toBe('function')
          expect(typeof vectorDB.search).toBe('function')
          expect(typeof vectorDB.dropCollection).toBe('function')
        })

        it('should handle empty search results', async () => {
          // Mock empty results
          if (name === 'PineconeVectorDatabase') {
            const mockPinecone = vi.mocked(require('@pinecone-database/pinecone').Pinecone)
            mockPinecone.mockImplementation(() => ({
              Index: () => ({
                query: vi.fn().mockResolvedValue({ matches: [] })
              })
            }))
          } else if (name === 'ChromaVectorDatabase') {
            const mockChroma = vi.mocked(require('chromadb').ChromaApi)
            mockChroma.mockImplementation(() => ({
              getCollection: vi.fn().mockResolvedValue({
                query: vi.fn().mockResolvedValue({
                  ids: [[]],
                  distances: [[]],
                  metadatas: [[]],
                  documents: [[]]
                })
              })
            }))
          }

          const queryVector = new Array(384).fill(0).map(() => Math.random())
          const results = await vectorDB.search('empty-collection', queryVector)
          
          expect(results).toBeInstanceOf(Array)
          expect(results).toHaveLength(0)
        })

        it('should validate input parameters', async () => {
          // Test with invalid collection name
          await expect(vectorDB.createCollection('', 384)).rejects.toThrow()
          
          // Test with invalid dimension
          await expect(vectorDB.createCollection('test', 0)).rejects.toThrow()
          
          // Test with empty documents
          await expect(vectorDB.insert('test', [])).resolves.not.toThrow()
        })
      })
    })
  })

  describe('Performance and Edge Cases', () => {
    let vectorDB: ChromaVectorDatabase

    beforeEach(() => {
      vectorDB = new ChromaVectorDatabase({
        host: 'localhost',
        port: 8000
      })
    })

    it('should handle large document batches', async () => {
      const largeBatch: VectorDocument[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `large-batch-${i}`,
        content: `content for document ${i}`.repeat(100), // Larger content
        vector: new Array(384).fill(0).map(() => Math.random()),
        source: `/test/large${i}.js`,
        relativePath: `large${i}.js`,
        startLine: i * 10,
        endLine: i * 10 + 10,
        fileExtension: '.js',
        metadata: {
          language: 'javascript',
          codebasePath: '/test',
          chunkIndex: i
        }
      }))

      // Should handle large batches without throwing
      await expect(vectorDB.insert('large-collection', largeBatch)).resolves.not.toThrow()
    })

    it('should handle documents with special characters', async () => {
      const specialDoc: VectorDocument = {
        id: 'special-chars-doc',
        content: 'function test() { return "Hello 世界! 🌍"; }',
        vector: new Array(384).fill(0).map(() => Math.random()),
        source: '/test/special-chars.js',
        relativePath: 'special-chars.js',
        startLine: 1,
        endLine: 1,
        fileExtension: '.js',
        metadata: {
          language: 'javascript',
          codebasePath: '/test',
          chunkIndex: 0,
          specialChars: true
        }
      }

      await expect(vectorDB.insert('special-collection', [specialDoc])).resolves.not.toThrow()
    })

    it('should handle concurrent operations', async () => {
      const concurrentOps = Array.from({ length: 5 }, (_, i) => 
        vectorDB.insert(`concurrent-${i}`, [{
          id: `concurrent-doc-${i}`,
          content: `concurrent content ${i}`,
          vector: new Array(384).fill(0).map(() => Math.random()),
          source: `/test/concurrent${i}.js`,
          relativePath: `concurrent${i}.js`,
          startLine: 1,
          endLine: 1,
          fileExtension: '.js',
          metadata: {
            language: 'javascript',
            codebasePath: '/test',
            chunkIndex: i
          }
        }])
      )

      await expect(Promise.all(concurrentOps)).resolves.not.toThrow()
    })
  })
})