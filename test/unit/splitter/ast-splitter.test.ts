import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock tree-sitter and langchain splitter before importing
vi.mock('@core/splitter/langchain-splitter', () => ({
  LangChainCodeSplitter: vi.fn().mockImplementation(() => ({
    split: vi.fn().mockResolvedValue([{
      content: 'fallback chunk',
      metadata: {
        filePath: 'test.unknown',
        language: 'unknown',
        startLine: 1,
        endLine: 1
      }
    }])
  }))
}))

import { AstCodeSplitter } from '@core/splitter/ast-splitter'
import { CodeChunk } from '@core/splitter'
import { mockFileContent } from '../../helpers/mock-data'

vi.mock('tree-sitter', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      setLanguage: vi.fn(),
      parse: vi.fn().mockReturnValue({
        rootNode: {
          children: [],
          type: 'program',
          startPosition: { row: 0, column: 0 },
          endPosition: { row: 10, column: 0 },
          text: 'mock code'
        }
      })
    }))
  }
})

vi.mock('tree-sitter-javascript', () => ({}))
vi.mock('tree-sitter-typescript', () => ({ typescript: {} }))
vi.mock('tree-sitter-python', () => ({}))
vi.mock('tree-sitter-java', () => ({}))
vi.mock('tree-sitter-cpp', () => ({}))
vi.mock('tree-sitter-go', () => ({}))
vi.mock('tree-sitter-rust', () => ({}))
vi.mock('tree-sitter-c-sharp', () => ({}))
vi.mock('tree-sitter-scala', () => ({}))

describe('AstCodeSplitter', () => {
  let splitter: AstCodeSplitter

  beforeEach(() => {
    splitter = new AstCodeSplitter(2500, 300)
  })

  describe('constructor', () => {
    it('should initialize with default chunk size and overlap', () => {
      const defaultSplitter = new AstCodeSplitter()
      expect(defaultSplitter).toBeInstanceOf(AstCodeSplitter)
    })

    it('should initialize with custom chunk size and overlap', () => {
      const customSplitter = new AstCodeSplitter(1000, 100)
      expect(customSplitter).toBeInstanceOf(AstCodeSplitter)
    })
  })

  describe('split', () => {
    it('should split JavaScript code into chunks', async () => {
      const chunks = await splitter.split(mockFileContent.javascript, 'javascript', 'test.js')
      
      expect(chunks).toBeInstanceOf(Array)
      expect(chunks.length).toBeGreaterThan(0)
      
      chunks.forEach(chunk => {
        expect(chunk).toHaveProperty('content')
        expect(chunk).toHaveProperty('metadata')
        expect(chunk.metadata).toHaveProperty('filePath')
        expect(chunk.metadata).toHaveProperty('language')
        expect(chunk.metadata.language).toBe('javascript')
      })
    })

    it('should split TypeScript code into chunks', async () => {
      const chunks = await splitter.split(mockFileContent.typescript, 'typescript', 'test.ts')
      
      expect(chunks).toBeInstanceOf(Array)
      expect(chunks.length).toBeGreaterThan(0)
      
      chunks.forEach(chunk => {
        expect(chunk.metadata.language).toBe('typescript')
        expect(chunk.metadata.filePath).toBe('test.ts')
      })
    })

    it('should fallback to LangChain for unsupported languages', async () => {
      const chunks = await splitter.split('some code', 'unknown', 'test.unknown')
      
      expect(chunks).toBeInstanceOf(Array)
      expect(chunks.length).toBeGreaterThan(0)
      if (chunks.length > 0) {
        expect(chunks[0]).toHaveProperty('content')
        expect(chunks[0]).toHaveProperty('metadata')
      }
    })

    it('should handle empty code', async () => {
      const chunks = await splitter.split('', 'javascript', 'empty.js')
      
      expect(chunks).toBeInstanceOf(Array)
    })

    it('should handle very large code files', async () => {
      const largeCode = mockFileContent.javascript.repeat(100)
      const chunks = await splitter.split(largeCode, 'javascript', 'large.js')
      
      expect(chunks).toBeInstanceOf(Array)
      expect(chunks.length).toBeGreaterThan(1)
    })
  })

  describe('splitText', () => {
    it('should split text into chunks', () => {
      const text = 'This is a test text that needs to be split into smaller chunks'
      const chunks = splitter.splitText(text)
      
      expect(chunks).toBeInstanceOf(Array)
      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks.every(chunk => typeof chunk === 'string')).toBe(true)
    })

    it('should handle empty text', () => {
      const chunks = splitter.splitText('')
      expect(chunks).toBeInstanceOf(Array)
    })

    it('should handle very long text', () => {
      const longText = 'word '.repeat(10000)
      const chunks = splitter.splitText(longText)
      
      expect(chunks).toBeInstanceOf(Array)
      expect(chunks.length).toBeGreaterThan(1)
    })
  })

  describe('static methods', () => {
    it('should return supported languages', () => {
      const languages = AstCodeSplitter.getSupportedLanguages()
      
      expect(languages).toBeInstanceOf(Array)
      expect(languages).toContain('javascript')
      expect(languages).toContain('typescript')
      expect(languages).toContain('python')
    })

    it('should check if language is supported', () => {
      expect(AstCodeSplitter.isLanguageSupported('javascript')).toBe(true)
      expect(AstCodeSplitter.isLanguageSupported('typescript')).toBe(true)
      expect(AstCodeSplitter.isLanguageSupported('python')).toBe(true)
      expect(AstCodeSplitter.isLanguageSupported('unknown')).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should handle parsing errors gracefully', async () => {
      const invalidCode = 'function invalid() { unclosed function'
      
      // Should not throw, should fallback or handle gracefully
      await expect(
        splitter.split(invalidCode, 'javascript', 'invalid.js')
      ).resolves.not.toThrow()
    })

    it('should handle missing file path', async () => {
      const chunks = await splitter.split(mockFileContent.javascript, 'javascript')
      
      expect(chunks).toBeInstanceOf(Array)
      chunks.forEach(chunk => {
        expect(chunk.metadata).toHaveProperty('filePath')
      })
    })
  })
})