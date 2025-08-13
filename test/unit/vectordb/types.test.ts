import { describe, it, expect } from 'vitest'
import type { 
  VectorDocument, 
  VectorSearchResult, 
  HybridSearchRequest,
  HybridSearchOptions,
  HybridSearchResult
} from '@core/vectordb/types'

describe('VectorDB Types', () => {
  describe('VectorDocument', () => {
    it('should accept valid document structure', () => {
      const document: VectorDocument = {
        id: 'doc_123',
        content: 'function example() { return "hello"; }',
        vector: [0.1, 0.2, 0.3, 0.4],
        source: '/path/to/file.js',
        relativePath: 'src/utils/file.js',
        startLine: 1,
        endLine: 3,
        fileExtension: '.js',
        metadata: {
          language: 'javascript',
          codebasePath: '/project/root',
          chunkIndex: 0
        }
      }
      
      expect(document.id).toBe('doc_123')
      expect(document.content).toBe('function example() { return "hello"; }')
      expect(document.vector).toHaveLength(4)
      expect(document.metadata.language).toBe('javascript')
    })

    it('should support different file types', () => {
      const pythonDoc: VectorDocument = {
        id: 'doc_python',
        content: 'def example():\n    return "hello"',
        vector: [0.5, 0.6, 0.7],
        source: '/path/to/script.py',
        relativePath: 'src/script.py',
        startLine: 1,
        endLine: 2,
        fileExtension: '.py',
        metadata: {
          language: 'python',
          codebasePath: '/project',
          chunkIndex: 1
        }
      }
      
      expect(pythonDoc.fileExtension).toBe('.py')
      expect(pythonDoc.metadata.language).toBe('python')
    })
  })

  describe('VectorSearchResult', () => {
    it('should include document and score', () => {
      const result: VectorSearchResult = {
        document: {
          id: 'result_doc',
          content: 'search result content',
          vector: [0.1, 0.2],
          source: '/file.js',
          relativePath: 'file.js',
          startLine: 1,
          endLine: 1,
          fileExtension: '.js',
          metadata: {
            language: 'javascript',
            codebasePath: '/project',
            chunkIndex: 0
          }
        },
        score: 0.95
      }
      
      expect(result.score).toBe(0.95)
      expect(result.document.id).toBe('result_doc')
    })

    it('should support different score ranges', () => {
      const highScore: VectorSearchResult = {
        document: {
          id: 'high_score_doc',
          content: 'highly relevant content',
          vector: [0.9, 0.8],
          source: '/high.js',
          relativePath: 'high.js',
          startLine: 1,
          endLine: 1,
          fileExtension: '.js',
          metadata: { language: 'javascript', codebasePath: '/project', chunkIndex: 0 }
        },
        score: 0.99
      }
      
      const lowScore: VectorSearchResult = {
        document: {
          id: 'low_score_doc',
          content: 'less relevant content',
          vector: [0.1, 0.2],
          source: '/low.js',
          relativePath: 'low.js',
          startLine: 1,
          endLine: 1,
          fileExtension: '.js',
          metadata: { language: 'javascript', codebasePath: '/project', chunkIndex: 0 }
        },
        score: 0.45
      }
      
      expect(highScore.score).toBeGreaterThan(lowScore.score)
    })
  })

  describe('HybridSearchRequest', () => {
    it('should support dense vector search request', () => {
      const denseRequest: HybridSearchRequest = {
        vector: [0.1, 0.2, 0.3, 0.4],
        data: [0.1, 0.2, 0.3, 0.4],
        anns_field: 'vector',
        param: { nprobe: 10 },
        limit: 5
      }
      
      expect(denseRequest.anns_field).toBe('vector')
      expect(denseRequest.vector).toHaveLength(4)
      expect(denseRequest.limit).toBe(5)
    })

    it('should support sparse vector search request', () => {
      const sparseRequest: HybridSearchRequest = {
        vector: [0.1, 0.2, 0.3],
        query: 'search query text',
        data: 'search query text',
        anns_field: 'sparse_vector',
        param: { drop_ratio_search: 0.2 },
        limit: 10
      }
      
      expect(sparseRequest.anns_field).toBe('sparse_vector')
      expect(sparseRequest.query).toBe('search query text')
      expect(sparseRequest.limit).toBe(10)
    })
  })

  describe('HybridSearchOptions', () => {
    it('should support RRF reranking strategy', () => {
      const options: HybridSearchOptions = {
        rerank: {
          strategy: 'rrf',
          params: { k: 100 }
        },
        limit: 10,
        filterExpr: 'language == "javascript"'
      }
      
      expect(options.rerank?.strategy).toBe('rrf')
      expect(options.rerank?.params.k).toBe(100)
      expect(options.limit).toBe(10)
      expect(options.filterExpr).toBe('language == "javascript"')
    })

    it('should support weighted reranking strategy', () => {
      const options: HybridSearchOptions = {
        rerank: {
          strategy: 'weighted',
          params: { weights: [0.7, 0.3] }
        },
        limit: 5
      }
      
      expect(options.rerank?.strategy).toBe('weighted')
      expect(options.rerank?.params.weights).toEqual([0.7, 0.3])
    })
  })

  describe('HybridSearchResult', () => {
    it('should contain array of search results', () => {
      const hybridResult: HybridSearchResult = {
        results: [
          {
            document: {
              id: 'hybrid_doc_1',
              content: 'first result',
              vector: [0.1, 0.2],
              source: '/file1.js',
              relativePath: 'file1.js',
              startLine: 1,
              endLine: 1,
              fileExtension: '.js',
              metadata: { language: 'javascript', codebasePath: '/project', chunkIndex: 0 }
            },
            score: 0.95
          },
          {
            document: {
              id: 'hybrid_doc_2',
              content: 'second result',
              vector: [0.3, 0.4],
              source: '/file2.js',
              relativePath: 'file2.js',
              startLine: 5,
              endLine: 8,
              fileExtension: '.js',
              metadata: { language: 'javascript', codebasePath: '/project', chunkIndex: 1 }
            },
            score: 0.87
          }
        ]
      }
      
      expect(hybridResult.results).toHaveLength(2)
      expect(hybridResult.results[0].score).toBeGreaterThan(hybridResult.results[1].score)
    })

    it('should support empty results', () => {
      const emptyResult: HybridSearchResult = {
        results: []
      }
      
      expect(emptyResult.results).toHaveLength(0)
    })
  })
})