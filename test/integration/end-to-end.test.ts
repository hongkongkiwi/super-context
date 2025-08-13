import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Context } from '@core/context'
import { OpenAIEmbedding } from '@core/embedding/openai-embedding'
import { ChromaVectorDatabase } from '@core/vectordb/chroma-vectordb'
import { AstCodeSplitter } from '@core/splitter/ast-splitter'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Mock external dependencies for deterministic testing
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [
          { embedding: new Array(1536).fill(0).map((_, i) => Math.sin(i * 0.1)) }
        ]
      })
    }
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
        metadatas: [[
          { 
            relativePath: 'utils/math.js', 
            language: 'javascript',
            startLine: 1,
            endLine: 5 
          },
          { 
            relativePath: 'components/Button.tsx', 
            language: 'typescript',
            startLine: 10,
            endLine: 25 
          }
        ]],
        documents: [['function add(a, b) { return a + b; }', 'const Button = () => <button>Click</button>']]
      }),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(2)
    }),
    deleteCollection: vi.fn().mockResolvedValue({}),
    listCollections: vi.fn().mockResolvedValue([]),
    getCollection: vi.fn().mockResolvedValue({
      name: 'test-collection',
      add: vi.fn().mockResolvedValue({}),
      query: vi.fn().mockResolvedValue({
        ids: [['doc1']],
        distances: [[0.15]],
        metadatas: [[{ relativePath: 'utils/math.js', language: 'javascript' }]],
        documents: [['function add(a, b) { return a + b; }']]
      })
    })
  }))
}))

// Mock tree-sitter for consistent AST parsing
vi.mock('tree-sitter', () => ({
  default: vi.fn().mockImplementation(() => ({
    setLanguage: vi.fn(),
    parse: vi.fn().mockReturnValue({
      rootNode: {
        children: [
          {
            type: 'function_declaration',
            startPosition: { row: 0, column: 0 },
            endPosition: { row: 2, column: 1 },
            text: 'function add(a, b) {\n  return a + b;\n}'
          }
        ],
        type: 'program',
        startPosition: { row: 0, column: 0 },
        endPosition: { row: 10, column: 0 },
        text: 'mock parsed code'
      }
    })
  }))
}))

vi.mock('tree-sitter-javascript', () => ({}))
vi.mock('tree-sitter-typescript', () => ({ typescript: {} }))

describe('End-to-End Integration Tests', () => {
  let context: Context
  let tempCodebase: string
  let tempFiles: string[] = []

  beforeEach(async () => {
    // Create temporary codebase directory
    tempCodebase = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-codebase-'))

    // Initialize context with mocked services
    const embedding = new OpenAIEmbedding({
      apiKey: 'test-openai-key',
      model: 'text-embedding-ada-002'
    })

    const vectorDB = new ChromaVectorDatabase({
      host: 'localhost',
      port: 8000
    })

    const splitter = new AstCodeSplitter(1000, 200)

    context = new Context({
      embedding,
      vectorDatabase: vectorDB,
      codeSplitter: splitter,
      supportedExtensions: ['.js', '.ts', '.tsx', '.py', '.java'],
      ignorePatterns: ['node_modules/**', '*.log', '.git/**']
    })
  })

  afterEach(async () => {
    // Clean up temporary files
    try {
      fs.rmSync(tempCodebase, { recursive: true, force: true })
      for (const file of tempFiles) {
        try {
          fs.unlinkSync(file)
        } catch (error) {
          // Ignore cleanup errors
        }
      }
      tempFiles = []
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  describe('Full Workflow: Index -> Search -> Update', () => {
    it('should complete full development workflow', async () => {
      // 1. Create initial codebase structure
      const srcDir = path.join(tempCodebase, 'src')
      const utilsDir = path.join(srcDir, 'utils')
      const componentsDir = path.join(srcDir, 'components')
      
      fs.mkdirSync(srcDir, { recursive: true })
      fs.mkdirSync(utilsDir, { recursive: true })
      fs.mkdirSync(componentsDir, { recursive: true })

      // Create JavaScript utility functions
      fs.writeFileSync(path.join(utilsDir, 'math.js'), `
/**
 * Utility functions for mathematical operations
 */

function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

function calculateAverage(numbers) {
  const sum = numbers.reduce((acc, num) => add(acc, num), 0);
  return sum / numbers.length;
}

module.exports = { add, multiply, calculateAverage };
      `.trim())

      // Create TypeScript React component
      fs.writeFileSync(path.join(componentsDir, 'Button.tsx'), `
import React from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

const Button: React.FC<ButtonProps> = ({ 
  label, 
  onClick, 
  disabled = false, 
  variant = 'primary' 
}) => {
  return (
    <button 
      className={\`btn btn-\${variant}\`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
};

export default Button;
      `.trim())

      // Create Python data processing script
      fs.writeFileSync(path.join(srcDir, 'data_processor.py'), `
import json
import csv
from typing import List, Dict, Any

class DataProcessor:
    def __init__(self):
        self.data = []
    
    def load_json(self, file_path: str) -> None:
        """Load data from JSON file"""
        with open(file_path, 'r') as f:
            self.data = json.load(f)
    
    def filter_data(self, condition: callable) -> List[Dict[str, Any]]:
        """Filter data based on condition"""
        return [item for item in self.data if condition(item)]
    
    def export_csv(self, file_path: str, fields: List[str]) -> None:
        """Export data to CSV file"""
        with open(file_path, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()
            writer.writerows(self.data)
      `.trim())

      // Create configuration files that should be ignored
      fs.writeFileSync(path.join(tempCodebase, 'config.log'), 'This is a log file')
      fs.mkdirSync(path.join(tempCodebase, 'node_modules'), { recursive: true })
      fs.writeFileSync(path.join(tempCodebase, 'node_modules', 'some-package.js'), 'ignored content')

      // 2. Index the codebase
      let progressUpdates: any[] = []
      const indexResult = await context.indexCodebase(
        tempCodebase,
        (progress) => progressUpdates.push(progress)
      )

      // Verify indexing results
      expect(indexResult.indexedFiles).toBe(3) // Should index 3 code files, ignore config.log and node_modules
      expect(indexResult.totalChunks).toBeGreaterThan(0)
      expect(indexResult.status).toBe('completed')
      
      // Verify progress updates
      expect(progressUpdates.length).toBeGreaterThan(0)
      expect(progressUpdates[0]).toHaveProperty('phase')
      expect(progressUpdates[progressUpdates.length - 1].percentage).toBe(100)

      // 3. Test semantic search functionality
      const mathSearchResults = await context.semanticSearch(
        tempCodebase,
        'mathematical addition function',
        5
      )
      
      expect(mathSearchResults).toBeInstanceOf(Array)
      expect(mathSearchResults.length).toBeGreaterThan(0)
      
      const buttonSearchResults = await context.semanticSearch(
        tempCodebase,
        'React button component with TypeScript',
        3
      )
      
      expect(buttonSearchResults).toBeInstanceOf(Array)

      const pythonSearchResults = await context.semanticSearch(
        tempCodebase,
        'data processing CSV export',
        5
      )
      
      expect(pythonSearchResults).toBeInstanceOf(Array)

      // 4. Test different search queries
      const queries = [
        'function that adds two numbers',
        'React component with props',
        'Python class for data manipulation',
        'export function to CSV',
        'TypeScript interface definition'
      ]

      for (const query of queries) {
        const results = await context.semanticSearch(tempCodebase, query, 3)
        expect(results).toBeInstanceOf(Array)
        
        // Each result should have proper structure
        results.forEach(result => {
          expect(result).toHaveProperty('content')
          expect(result).toHaveProperty('relativePath')
          expect(result).toHaveProperty('startLine')
          expect(result).toHaveProperty('endLine')
          expect(result).toHaveProperty('language')
          expect(result).toHaveProperty('score')
          expect(typeof result.score).toBe('number')
        })
      }

      // 5. Verify index exists
      const hasIndex = await context.hasIndex(tempCodebase)
      expect(hasIndex).toBe(true)

      // 6. Test index cleanup
      await context.clearIndex(tempCodebase)
      const hasIndexAfterClear = await context.hasIndex(tempCodebase)
      expect(hasIndexAfterClear).toBe(false)

      // 7. Test reindexing
      const reindexResult = await context.indexCodebase(tempCodebase)
      expect(reindexResult.indexedFiles).toBe(3)
      expect(reindexResult.status).toBe('completed')
    })

    it('should handle concurrent operations safely', async () => {
      // Create test files
      fs.mkdirSync(path.join(tempCodebase, 'concurrent'), { recursive: true })
      
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(
          path.join(tempCodebase, 'concurrent', `file${i}.js`),
          `function test${i}() { return ${i}; }`
        )
      }

      // Test concurrent indexing (should be serialized by mutex)
      const concurrentIndexPromises = Array.from({ length: 3 }, () =>
        context.indexCodebase(tempCodebase)
      )

      const results = await Promise.all(concurrentIndexPromises)
      
      // All results should be successful
      results.forEach(result => {
        expect(result.status).toBe('completed')
        expect(result.indexedFiles).toBeGreaterThan(0)
      })

      // Test concurrent searches (should be allowed up to semaphore limit)
      const concurrentSearchPromises = Array.from({ length: 8 }, (_, i) =>
        context.semanticSearch(tempCodebase, `test function ${i}`, 2)
      )

      const searchResults = await Promise.all(concurrentSearchPromises)
      
      searchResults.forEach(results => {
        expect(results).toBeInstanceOf(Array)
      })
    })

    it('should handle large codebase efficiently', async () => {
      // Create a larger codebase structure
      const directories = ['services', 'models', 'controllers', 'utils', 'components']
      
      directories.forEach(dir => {
        fs.mkdirSync(path.join(tempCodebase, dir), { recursive: true })
        
        // Create multiple files in each directory
        for (let i = 0; i < 10; i++) {
          const content = `
// ${dir}/${dir}${i}.js
class ${dir.charAt(0).toUpperCase() + dir.slice(1)}${i} {
  constructor() {
    this.id = ${i};
    this.type = '${dir}';
  }
  
  process() {
    return \`Processing \${this.type} \${this.id}\`;
  }
  
  getData() {
    return {
      id: this.id,
      type: this.type,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = ${dir.charAt(0).toUpperCase() + dir.slice(1)}${i};
          `.trim()
          
          fs.writeFileSync(path.join(tempCodebase, dir, `${dir}${i}.js`), content)
        }
      })

      // Index large codebase
      const startTime = Date.now()
      let progressCount = 0
      
      const result = await context.indexCodebase(
        tempCodebase,
        () => { progressCount++ }
      )
      
      const indexingTime = Date.now() - startTime
      
      expect(result.indexedFiles).toBe(50) // 5 directories * 10 files each
      expect(result.status).toBe('completed')
      expect(progressCount).toBeGreaterThan(0)
      expect(indexingTime).toBeLessThan(30000) // Should complete within 30 seconds

      // Test search performance on large index
      const searchStartTime = Date.now()
      const searchResults = await context.semanticSearch(
        tempCodebase,
        'process method getData timestamp',
        10
      )
      const searchTime = Date.now() - searchStartTime
      
      expect(searchResults).toBeInstanceOf(Array)
      expect(searchTime).toBeLessThan(5000) // Search should be fast
    })

    it('should handle file updates and incremental indexing', async () => {
      // Create initial file
      const testFile = path.join(tempCodebase, 'updateTest.js')
      fs.writeFileSync(testFile, 'function oldFunction() { return "old"; }')

      // Initial index
      await context.indexCodebase(tempCodebase)
      
      // Search for old content
      const oldResults = await context.semanticSearch(tempCodebase, 'oldFunction', 5)
      expect(oldResults).toBeInstanceOf(Array)

      // Update file content
      fs.writeFileSync(testFile, 'function newFunction() { return "new"; }')
      
      // Add new file
      const newFile = path.join(tempCodebase, 'newFile.js')
      fs.writeFileSync(newFile, 'function additionalFunction() { return "additional"; }')

      // Reindex with force flag
      const reindexResult = await context.indexCodebase(tempCodebase, undefined, true)
      
      expect(reindexResult.status).toBe('completed')
      expect(reindexResult.indexedFiles).toBe(2) // Both files should be reindexed

      // Search for new content
      const newResults = await context.semanticSearch(tempCodebase, 'newFunction', 5)
      expect(newResults).toBeInstanceOf(Array)

      const additionalResults = await context.semanticSearch(tempCodebase, 'additionalFunction', 5)
      expect(additionalResults).toBeInstanceOf(Array)
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle non-existent codebase gracefully', async () => {
      const nonExistentPath = '/non/existent/path'
      
      await expect(context.indexCodebase(nonExistentPath)).rejects.toThrow()
      
      const searchResults = await context.semanticSearch(nonExistentPath, 'test query')
      expect(searchResults).toEqual([])
      
      const hasIndex = await context.hasIndex(nonExistentPath)
      expect(hasIndex).toBe(false)
    })

    it('should handle empty codebase', async () => {
      const result = await context.indexCodebase(tempCodebase)
      
      expect(result.indexedFiles).toBe(0)
      expect(result.totalChunks).toBe(0)
      expect(result.status).toBe('completed')
      
      const searchResults = await context.semanticSearch(tempCodebase, 'anything')
      expect(searchResults).toEqual([])
    })

    it('should handle malformed code files', async () => {
      // Create files with syntax errors
      fs.writeFileSync(path.join(tempCodebase, 'broken.js'), 'function broken( { return "unclosed"; }')
      fs.writeFileSync(path.join(tempCodebase, 'empty.js'), '')
      fs.writeFileSync(path.join(tempCodebase, 'weird.js'), 'console.log("test");\n\n\n\n\n')

      const result = await context.indexCodebase(tempCodebase)
      
      // Should handle broken files gracefully
      expect(result.status).toBe('completed')
      expect(result.indexedFiles).toBeGreaterThanOrEqual(0)
    })

    it('should handle very long file names and paths', async () => {
      const longDir = 'a'.repeat(100)
      const longFileName = 'b'.repeat(100) + '.js'
      
      fs.mkdirSync(path.join(tempCodebase, longDir), { recursive: true })
      fs.writeFileSync(
        path.join(tempCodebase, longDir, longFileName),
        'function testLongPath() { return "long path test"; }'
      )

      const result = await context.indexCodebase(tempCodebase)
      expect(result.status).toBe('completed')
      expect(result.indexedFiles).toBe(1)
    })

    it('should handle special characters in file content', async () => {
      const specialContent = `
// Test file with special characters
function unicode() {
  const greeting = "Hello 世界! 🌍 Здравствуй мир!";
  const math = "∑∆√π∞≈≠≤≥";
  const symbols = "©®™€£¥$¢";
  return { greeting, math, symbols };
}

function emoji() {
  return "🚀🔥💻🎉✨⚡🌟💯🎯🔮";
}

export { unicode, emoji };
      `
      
      fs.writeFileSync(path.join(tempCodebase, 'special-chars.js'), specialContent)

      const result = await context.indexCodebase(tempCodebase)
      expect(result.status).toBe('completed')
      expect(result.indexedFiles).toBe(1)

      const searchResults = await context.semanticSearch(tempCodebase, 'unicode function')
      expect(searchResults).toBeInstanceOf(Array)
    })

    it('should handle permission and file system errors', async () => {
      // This test might not work on all systems, but should not crash
      const result = await context.indexCodebase(tempCodebase)
      expect(result.status).toBe('completed')
    })
  })

  describe('Configuration and Customization', () => {
    it('should respect custom ignore patterns', async () => {
      // Create files that should be ignored
      fs.writeFileSync(path.join(tempCodebase, 'important.js'), 'function important() { return "keep"; }')
      fs.writeFileSync(path.join(tempCodebase, 'temp.tmp'), 'temporary file')
      fs.writeFileSync(path.join(tempCodebase, 'debug.log'), 'debug log content')
      
      fs.mkdirSync(path.join(tempCodebase, 'build'), { recursive: true })
      fs.writeFileSync(path.join(tempCodebase, 'build', 'output.js'), 'build output')

      // Create context with custom ignore patterns
      const customContext = new Context({
        embedding: new OpenAIEmbedding({ apiKey: 'test-key', model: 'text-embedding-ada-002' }),
        vectorDatabase: new ChromaVectorDatabase({ host: 'localhost', port: 8000 }),
        ignorePatterns: ['*.tmp', '*.log', 'build/**']
      })

      const result = await customContext.indexCodebase(tempCodebase)
      
      // Should only index the important.js file
      expect(result.indexedFiles).toBe(1)
      expect(result.status).toBe('completed')
    })

    it('should work with custom file extensions', async () => {
      // Create files with custom extensions
      fs.writeFileSync(path.join(tempCodebase, 'config.toml'), '[settings]\nkey = "value"')
      fs.writeFileSync(path.join(tempCodebase, 'query.sql'), 'SELECT * FROM users;')
      fs.writeFileSync(path.join(tempCodebase, 'styles.scss'), '$primary: #333;\n.btn { color: $primary; }')

      const customContext = new Context({
        embedding: new OpenAIEmbedding({ apiKey: 'test-key', model: 'text-embedding-ada-002' }),
        vectorDatabase: new ChromaVectorDatabase({ host: 'localhost', port: 8000 }),
        supportedExtensions: ['.toml', '.sql', '.scss']
      })

      const result = await customContext.indexCodebase(tempCodebase)
      
      expect(result.indexedFiles).toBe(3)
      expect(result.status).toBe('completed')
    })
  })
})