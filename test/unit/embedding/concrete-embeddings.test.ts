import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OpenAIEmbedding } from '@core/embedding/openai-embedding'
import { HuggingFaceEmbedding } from '@core/embedding/huggingface-embedding'
import { VoyageAIEmbedding } from '@core/embedding/voyageai-embedding'

// Mock external dependencies
// SDKs are aliased to stubs in vitest.config.ts; leave per-test mocks out to avoid conflicts

describe('Concrete Embedding Implementations', () => {
  describe('OpenAIEmbedding', () => {
    let embedding: OpenAIEmbedding

    beforeEach(() => {
      embedding = new OpenAIEmbedding({
        apiKey: 'test-key',
        model: 'text-embedding-ada-002'
      })
    })

    it('should initialize with correct provider', () => {
      expect(embedding.getProvider()).toBe('openai')
    })

    it('should have correct dimension for ada-002', () => {
      expect(embedding.getDimension()).toBe(1536)
    })

    it('should embed single text', async () => {
      const result = await embedding.embed('test text')
      
      expect(result.vector).toHaveLength(1536)
      expect(result.dimension).toBe(1536)
      expect(result.vector.every(val => typeof val === 'number')).toBe(true)
    })

    it('should embed batch of texts', async () => {
      const texts = ['text 1', 'text 2', 'text 3']
      const results = await embedding.embedBatch(texts)
      
      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result.vector).toHaveLength(1536)
        expect(result.dimension).toBe(1536)
      })
    })

    it('should detect dimension', async () => {
      const dimension = await embedding.detectDimension()
      expect(dimension).toBe(1536)
    })

    it('should handle different models', () => {
      const embedding3Small = new OpenAIEmbedding({
        apiKey: 'test-key',
        model: 'text-embedding-3-small'
      })
      
      expect(embedding3Small.getDimension()).toBe(1536)
      expect(embedding3Small.getProvider()).toBe('openai')
    })
  })

  describe('HuggingFaceEmbedding', () => {
    let embedding: HuggingFaceEmbedding

    beforeEach(() => {
      embedding = new HuggingFaceEmbedding({
        apiKey: 'test-key',
        model: 'sentence-transformers/all-MiniLM-L6-v2'
      })
    })

    it('should initialize with correct provider', () => {
      expect(embedding.getProvider()).toBe('huggingface')
    })

    it('should have correct default dimension', () => {
      expect(embedding.getDimension()).toBe(384)
    })

    it('should embed single text', async () => {
      const result = await embedding.embed('test text')
      
      expect(result.vector).toHaveLength(384)
      expect(result.dimension).toBe(384)
      expect(result.vector.every(val => typeof val === 'number')).toBe(true)
    })

    it('should embed batch of texts', async () => {
      const texts = ['text 1', 'text 2', 'text 3']
      const results = await embedding.embedBatch(texts)
      
      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result.vector).toHaveLength(384)
        expect(result.dimension).toBe(384)
      })
    })

    it('should detect dimension', async () => {
      const dimension = await embedding.detectDimension()
      expect(dimension).toBe(384)
    })
  })

  describe('VoyageAIEmbedding', () => {
    let embedding: VoyageAIEmbedding

    beforeEach(() => {
      embedding = new VoyageAIEmbedding({
        apiKey: 'test-key',
        model: 'voyage-3'
      })
    })

    it('should initialize with correct provider', () => {
      expect(embedding.getProvider()).toBe('voyageai')
    })

    it('should have correct dimension', () => {
      expect(embedding.getDimension()).toBe(1024)
    })

    it('should embed single text', async () => {
      const result = await embedding.embed('test text')
      
      expect(result.vector).toHaveLength(1024)
      expect(result.dimension).toBe(1024)
      expect(result.vector.every(val => typeof val === 'number')).toBe(true)
    })

    it('should embed batch of texts', async () => {
      const texts = ['text 1', 'text 2', 'text 3']
      const results = await embedding.embedBatch(texts)
      
      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result.vector).toHaveLength(1024)
        expect(result.dimension).toBe(1024)
      })
    })

    it('should detect dimension', async () => {
      const dimension = await embedding.detectDimension()
      expect(dimension).toBe(1024)
    })

    it('should handle different input types', async () => {
      const result = await embedding.embed('test with special chars: 测试')
      expect(result.vector).toHaveLength(1024)
    })
  })

  describe('Error Handling', () => {
    it('should handle OpenAI API errors gracefully', async () => {
      const failingEmbedding = new OpenAIEmbedding({
        apiKey: 'invalid-key',
        model: 'text-embedding-ada-002'
      })

      // Mock the OpenAI client to throw an error
      const { default: OpenAI } = await import('openai')
      ;(OpenAI as any).mockImplementation(() => ({
        embeddings: { create: vi.fn().mockRejectedValue(new Error('API key invalid')) }
      }))

      await expect(failingEmbedding.embed('test')).rejects.toThrow()
    })

    it('should handle HuggingFace API errors gracefully', async () => {
      const failingEmbedding = new HuggingFaceEmbedding({
        apiKey: 'invalid-key',
        model: 'invalid-model'
      })

      // Mock the HF client to throw an error
      const { HfInference } = await import('@huggingface/inference')
      ;(HfInference as any).mockImplementation(() => ({
        featureExtraction: vi.fn().mockRejectedValue(new Error('Model not found'))
      }))

      await expect(failingEmbedding.embed('test')).rejects.toThrow()
    })

    it('should handle VoyageAI API errors gracefully', async () => {
      const failingEmbedding = new VoyageAIEmbedding({
        apiKey: 'invalid-key',
        model: 'voyage-large-2'
      })

      // Mock the Voyage client to throw an error
      const { VoyageAIClient } = await import('voyageai')
      ;(VoyageAIClient as any).mockImplementation(() => ({
        embed: vi.fn().mockRejectedValue(new Error('Unauthorized'))
      }))

      await expect(failingEmbedding.embed('test')).rejects.toThrow()
    })
  })

  describe('Configuration Validation', () => {
    it('should require API key for OpenAI', () => {
      expect(() => {
        new OpenAIEmbedding({ apiKey: '', model: 'text-embedding-ada-002' })
      }).toThrow()
    })

    it('should require API key for HuggingFace', () => {
      expect(() => {
        new HuggingFaceEmbedding({ apiKey: '', model: 'sentence-transformers/all-MiniLM-L6-v2' })
      }).toThrow()
    })

    it('should require API key for VoyageAI', () => {
      expect(() => {
        new VoyageAIEmbedding({ apiKey: '', model: 'voyage-large-2' })
      }).toThrow()
    })

    it('should handle missing model gracefully', () => {
      const embedding = new OpenAIEmbedding({
        apiKey: 'test-key'
        // model not specified, should use default
      })
      
      expect(embedding.getProvider()).toBe('openai')
    })
  })
})