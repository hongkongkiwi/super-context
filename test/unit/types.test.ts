import { describe, it, expect } from 'vitest'
import type { SearchQuery, SemanticSearchResult } from '@core/types'

describe('Types', () => {
  describe('SearchQuery', () => {
    it('should allow optional properties', () => {
      const query: SearchQuery = {
        term: 'function'
      }
      
      expect(query.term).toBe('function')
      expect(query.includeContent).toBeUndefined()
      expect(query.limit).toBeUndefined()
    })

    it('should accept all properties', () => {
      const query: SearchQuery = {
        term: 'class definition',
        includeContent: true,
        limit: 10
      }
      
      expect(query.term).toBe('class definition')
      expect(query.includeContent).toBe(true)
      expect(query.limit).toBe(10)
    })
  })

  describe('SemanticSearchResult', () => {
    it('should have all required properties', () => {
      const result: SemanticSearchResult = {
        content: 'function example() { return "hello"; }',
        relativePath: 'src/utils/example.js',
        startLine: 1,
        endLine: 3,
        language: 'javascript',
        score: 0.95
      }
      
      expect(result.content).toBe('function example() { return "hello"; }')
      expect(result.relativePath).toBe('src/utils/example.js')
      expect(result.startLine).toBe(1)
      expect(result.endLine).toBe(3)
      expect(result.language).toBe('javascript')
      expect(result.score).toBe(0.95)
    })

    it('should support different languages', () => {
      const pythonResult: SemanticSearchResult = {
        content: 'def example():\n    return "hello"',
        relativePath: 'src/utils/example.py',
        startLine: 1,
        endLine: 2,
        language: 'python',
        score: 0.87
      }
      
      expect(pythonResult.language).toBe('python')
    })
  })
})