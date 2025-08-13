import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Embedding, EmbeddingVector } from '@core/embedding/base-embedding'

class MockEmbedding extends Embedding {
  protected maxTokens = 8192
  private dimension = 512

  async detectDimension(): Promise<number> {
    return this.dimension
  }

  async embed(text: string): Promise<EmbeddingVector> {
    const processedText = this.preprocessText(text)
    return {
      vector: new Array(this.dimension).fill(0).map(() => Math.random()),
      dimension: this.dimension
    }
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    const processedTexts = this.preprocessTexts(texts)
    return processedTexts.map(() => ({
      vector: new Array(this.dimension).fill(0).map(() => Math.random()),
      dimension: this.dimension
    }))
  }

  getDimension(): number {
    return this.dimension
  }

  getProvider(): string {
    return 'mock'
  }
}

describe('BaseEmbedding', () => {
  let embedding: MockEmbedding

  beforeEach(() => {
    embedding = new MockEmbedding()
  })

  describe('preprocessText', () => {
    it('should replace empty string with space', async () => {
      const result = await embedding.embed('')
      expect(result.vector).toHaveLength(512)
      expect(result.dimension).toBe(512)
    })

    it('should truncate very long text', async () => {
      const longText = 'a'.repeat(50000) // Much longer than maxTokens * 4
      const result = await embedding.embed(longText)
      expect(result.vector).toHaveLength(512)
    })

    it('should preserve normal length text', async () => {
      const normalText = 'This is a normal length text'
      const result = await embedding.embed(normalText)
      expect(result.vector).toHaveLength(512)
      expect(result.dimension).toBe(512)
    })
  })

  describe('embed', () => {
    it('should return embedding vector with correct dimension', async () => {
      const text = 'test text'
      const result = await embedding.embed(text)
      
      expect(result.vector).toHaveLength(512)
      expect(result.dimension).toBe(512)
      expect(result.vector.every(val => typeof val === 'number')).toBe(true)
    })

    it('should handle different text lengths', async () => {
      const shortText = 'hi'
      const longText = 'This is a much longer text that contains multiple words and sentences.'
      
      const shortResult = await embedding.embed(shortText)
      const longResult = await embedding.embed(longText)
      
      expect(shortResult.vector).toHaveLength(512)
      expect(longResult.vector).toHaveLength(512)
      expect(shortResult.dimension).toBe(longResult.dimension)
    })
  })

  describe('embedBatch', () => {
    it('should process multiple texts', async () => {
      const texts = ['first text', 'second text', 'third text']
      const results = await embedding.embedBatch(texts)
      
      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result.vector).toHaveLength(512)
        expect(result.dimension).toBe(512)
      })
    })

    it('should handle empty array', async () => {
      const results = await embedding.embedBatch([])
      expect(results).toHaveLength(0)
    })

    it('should handle mixed text lengths', async () => {
      const texts = ['short', 'a much longer text with multiple words', '']
      const results = await embedding.embedBatch(texts)
      
      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result.vector).toHaveLength(512)
        expect(result.dimension).toBe(512)
      })
    })
  })

  describe('getDimension', () => {
    it('should return correct dimension', () => {
      expect(embedding.getDimension()).toBe(512)
    })
  })

  describe('getProvider', () => {
    it('should return provider name', () => {
      expect(embedding.getProvider()).toBe('mock')
    })
  })

  describe('detectDimension', () => {
    it('should detect embedding dimension', async () => {
      const dimension = await embedding.detectDimension()
      expect(dimension).toBe(512)
    })

    it('should work with optional test text', async () => {
      const dimension = await embedding.detectDimension('test text')
      expect(dimension).toBe(512)
    })
  })
})