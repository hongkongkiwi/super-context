import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Context } from '@core/context'
import { OpenAIEmbedding } from '@core/embedding/openai-embedding'
import { Mutex, Semaphore, ConcurrentTaskQueue } from '@core/utils/mutex'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Mock dependencies for performance testing
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    embeddings: {
      create: vi.fn().mockImplementation(async (params) => {
        // Simulate API latency
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50))
        return {
          data: params.input.map(() => ({
            embedding: new Array(1536).fill(0).map(() => Math.random())
          }))
        }
      })
    }
  }))
}))

class MockVectorDatabase {
  private collections = new Map<string, any[]>()
  private operationDelay = 10 // Simulate DB operation latency

  async createCollection(name: string, dimension: number) {
    await new Promise(resolve => setTimeout(resolve, this.operationDelay))
    this.collections.set(name, [])
  }

  async hasCollection(name: string): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, this.operationDelay))
    return this.collections.has(name)
  }

  async insert(collection: string, documents: any[]) {
    await new Promise(resolve => setTimeout(resolve, this.operationDelay * documents.length))
    const existing = this.collections.get(collection) || []
    this.collections.set(collection, [...existing, ...documents])
  }

  async search(collection: string, vector: number[], options = {}) {
    await new Promise(resolve => setTimeout(resolve, this.operationDelay))
    const documents = this.collections.get(collection) || []
    return documents.slice(0, (options as any).topK || 5).map((doc, index) => ({
      document: doc,
      score: Math.random() * 0.5 + 0.5
    }))
  }

  async dropCollection(name: string) {
    await new Promise(resolve => setTimeout(resolve, this.operationDelay))
    this.collections.delete(name)
  }
}

describe('Performance and Stress Tests', () => {
  let tempDir: string
  let tempFiles: string[] = []

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-test-'))
  })

  afterEach(async () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
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

  describe('Mutex Performance', () => {
    it('should handle high contention efficiently', async () => {
      const mutex = new Mutex()
      let counter = 0
      const iterations = 1000
      
      const startTime = Date.now()
      
      const operations = Array.from({ length: iterations }, async () => {
        await mutex.acquire()
        try {
          counter++
        } finally {
          mutex.release()
        }
      })

      await Promise.all(operations)
      
      const duration = Date.now() - startTime
      
      expect(counter).toBe(iterations)
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
      
      console.log(`Mutex performance: ${iterations} operations in ${duration}ms (${(iterations/duration*1000).toFixed(2)} ops/sec)`)
    })

    it('should scale with concurrent operations', async () => {
      const concurrencyLevels = [10, 50, 100, 200]
      const results: { concurrency: number; duration: number; throughput: number }[] = []
      
      for (const concurrency of concurrencyLevels) {
        const mutex = new Mutex()
        let counter = 0
        
        const startTime = Date.now()
        
        const operations = Array.from({ length: concurrency }, async () => {
          for (let i = 0; i < 10; i++) {
            await mutex.acquire()
            try {
              counter++
              // Simulate some work
              await new Promise(resolve => setTimeout(resolve, 1))
            } finally {
              mutex.release()
            }
          }
        })

        await Promise.all(operations)
        
        const duration = Date.now() - startTime
        const throughput = (concurrency * 10) / duration * 1000
        
        results.push({ concurrency, duration, throughput })
        
        expect(counter).toBe(concurrency * 10)
      }
      
      console.log('Mutex scaling results:')
      results.forEach(({ concurrency, duration, throughput }) => {
        console.log(`  ${concurrency} threads: ${duration}ms, ${throughput.toFixed(2)} ops/sec`)
      })
    })
  })

  describe('Semaphore Performance', () => {
    it('should maintain throughput limits under load', async () => {
      const semaphore = new Semaphore(5) // Allow 5 concurrent operations
      let maxConcurrent = 0
      let currentConcurrent = 0
      const operations = 100
      
      const startTime = Date.now()
      
      const tasks = Array.from({ length: operations }, async (_, i) => {
        await semaphore.acquire()
        try {
          currentConcurrent++
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
          
          // Simulate work
          await new Promise(resolve => setTimeout(resolve, Math.random() * 20))
          
          currentConcurrent--
        } finally {
          semaphore.release()
        }
      })

      await Promise.all(tasks)
      
      const duration = Date.now() - startTime
      const throughput = operations / duration * 1000
      
      expect(maxConcurrent).toBeLessThanOrEqual(5)
      expect(currentConcurrent).toBe(0)
      
      console.log(`Semaphore performance: ${operations} operations, max concurrent: ${maxConcurrent}, ${throughput.toFixed(2)} ops/sec`)
    })

    it('should handle varying semaphore sizes efficiently', async () => {
      const sizes = [1, 2, 5, 10, 20]
      const operations = 100
      
      for (const size of sizes) {
        const semaphore = new Semaphore(size)
        let maxConcurrent = 0
        let currentConcurrent = 0
        
        const startTime = Date.now()
        
        const tasks = Array.from({ length: operations }, async () => {
          await semaphore.acquire()
          try {
            currentConcurrent++
            maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
            await new Promise(resolve => setTimeout(resolve, 5))
            currentConcurrent--
          } finally {
            semaphore.release()
          }
        })

        await Promise.all(tasks)
        
        const duration = Date.now() - startTime
        const throughput = operations / duration * 1000
        
        expect(maxConcurrent).toBeLessThanOrEqual(size)
        
        console.log(`Semaphore size ${size}: ${throughput.toFixed(2)} ops/sec, max concurrent: ${maxConcurrent}`)
      }
    })
  })

  describe('ConcurrentTaskQueue Performance', () => {
    it('should maintain optimal concurrency under heavy load', async () => {
      const queue = new ConcurrentTaskQueue(3)
      let maxActive = 0
      let currentActive = 0
      const tasks = 50
      
      const createTask = (id: number) => async () => {
        currentActive++
        maxActive = Math.max(maxActive, currentActive)
        
        // Simulate varying work durations
        const workTime = Math.random() * 50 + 10
        await new Promise(resolve => setTimeout(resolve, workTime))
        
        currentActive--
        return id
      }

      const startTime = Date.now()
      
      const promises = Array.from({ length: tasks }, (_, i) =>
        queue.add(createTask(i))
      )
      
      const results = await Promise.all(promises)
      
      const duration = Date.now() - startTime
      const throughput = tasks / duration * 1000
      
      expect(results).toHaveLength(tasks)
      expect(maxActive).toBeLessThanOrEqual(3)
      expect(currentActive).toBe(0)
      
      console.log(`TaskQueue performance: ${tasks} tasks, max concurrent: ${maxActive}, ${throughput.toFixed(2)} tasks/sec`)
    })

    it('should handle mixed priority tasks efficiently', async () => {
      const queue = new ConcurrentTaskQueue(2)
      const executionOrder: string[] = []
      
      const createTask = (name: string, priority: number = 0) => async () => {
        executionOrder.push(name)
        await new Promise(resolve => setTimeout(resolve, 10))
        return name
      }

      const startTime = Date.now()
      
      // Add mixed priority tasks
      const promises = [
        queue.add(createTask('normal-1')),
        queue.add(createTask('high-1'), { priority: 1 }),
        queue.add(createTask('normal-2')),
        queue.add(createTask('urgent'), { priority: 2 }),
        queue.add(createTask('high-2'), { priority: 1 }),
        queue.add(createTask('normal-3'))
      ]

      await Promise.all(promises)
      
      const duration = Date.now() - startTime
      
      // Higher priority tasks should generally execute before lower priority ones
      const urgentIndex = executionOrder.indexOf('urgent')
      const normalIndices = executionOrder.map((name, index) => 
        name.startsWith('normal') ? index : -1
      ).filter(i => i !== -1)
      
      // Urgent task should execute before most normal tasks
      const normalTasksAfterUrgent = normalIndices.filter(i => i > urgentIndex).length
      expect(normalTasksAfterUrgent).toBeLessThan(normalIndices.length)
      
      console.log(`Priority queue execution order: [${executionOrder.join(', ')}]`)
      console.log(`Mixed priority performance: ${duration}ms for 6 tasks`)
    })
  })

  describe('Large-Scale Integration Performance', () => {
    it('should handle large codebase indexing efficiently', async () => {
      const embedding = new OpenAIEmbedding({
        apiKey: 'test-key',
        model: 'text-embedding-ada-002'
      })
      
      const vectorDB = new MockVectorDatabase()
      
      // Create context with performance optimizations
      const context = new Context({
        embedding,
        vectorDatabase: vectorDB as any,
        supportedExtensions: ['.js', '.ts', '.py'],
        ignorePatterns: ['node_modules/**', '*.log']
      })

      // Create large codebase
      const dirs = ['services', 'models', 'controllers', 'utils', 'components']
      const filesPerDir = 20
      const totalFiles = dirs.length * filesPerDir
      
      dirs.forEach(dir => {
        fs.mkdirSync(path.join(tempDir, dir), { recursive: true })
        
        for (let i = 0; i < filesPerDir; i++) {
          const content = `
// ${dir}/${dir}${i}.js
class ${dir.charAt(0).toUpperCase() + dir.slice(1)}${i} {
  constructor() {
    this.id = ${i};
    this.type = '${dir}';
    this.data = new Array(100).fill(null).map((_, idx) => ({
      index: idx,
      value: Math.random(),
      timestamp: new Date().toISOString()
    }));
  }
  
  process() {
    return this.data.map(item => item.value * 2);
  }
  
  async asyncOperation() {
    await new Promise(resolve => setTimeout(resolve, 10));
    return this.data.filter(item => item.value > 0.5);
  }
  
  complexCalculation() {
    return this.data.reduce((acc, item, index) => {
      return acc + (item.value * Math.sin(index) * Math.cos(this.id));
    }, 0);
  }
}

module.exports = ${dir.charAt(0).toUpperCase() + dir.slice(1)}${i};
          `.trim()
          
          fs.writeFileSync(path.join(tempDir, dir, `${dir}${i}.js`), content)
        }
      })

      // Measure indexing performance
      const startTime = Date.now()
      let progressUpdateCount = 0
      
      const result = await context.indexCodebase(
        tempDir,
        () => { progressUpdateCount++ }
      )
      
      const indexingDuration = Date.now() - startTime
      const filesPerSecond = totalFiles / indexingDuration * 1000
      
      expect(result.indexedFiles).toBe(totalFiles)
      expect(result.status).toBe('completed')
      expect(progressUpdateCount).toBeGreaterThan(0)
      
      console.log(`Large codebase indexing: ${totalFiles} files in ${indexingDuration}ms (${filesPerSecond.toFixed(2)} files/sec)`)
      
      // Measure search performance
      const searchQueries = [
        'class constructor',
        'async operation',
        'complex calculation',
        'process data',
        'timestamp filtering'
      ]
      
      const searchStartTime = Date.now()
      
      const searchPromises = searchQueries.map(query =>
        context.semanticSearch(tempDir, query, 10)
      )
      
      const searchResults = await Promise.all(searchPromises)
      
      const searchDuration = Date.now() - searchStartTime
      const queriesPerSecond = searchQueries.length / searchDuration * 1000
      
      searchResults.forEach(results => {
        expect(results).toBeInstanceOf(Array)
      })
      
      console.log(`Search performance: ${searchQueries.length} queries in ${searchDuration}ms (${queriesPerSecond.toFixed(2)} queries/sec)`)
    })

    it('should handle memory efficiently under stress', async () => {
      const initialMemory = process.memoryUsage()
      
      // Create multiple contexts to test memory usage
      const contexts: Context[] = []
      
      for (let i = 0; i < 5; i++) {
        const embedding = new OpenAIEmbedding({
          apiKey: 'test-key',
          model: 'text-embedding-ada-002'
        })
        
        const vectorDB = new MockVectorDatabase()
        
        contexts.push(new Context({
          embedding,
          vectorDatabase: vectorDB as any
        }))
      }

      // Create test files
      for (let i = 0; i < 50; i++) {
        fs.writeFileSync(
          path.join(tempDir, `stress-test-${i}.js`),
          `// Stress test file ${i}\n` + 'const data = ' + JSON.stringify(
            new Array(1000).fill(null).map((_, idx) => ({
              id: idx,
              value: Math.random(),
              nested: {
                a: Math.random(),
                b: Math.random(),
                c: new Array(10).fill(Math.random())
              }
            }))
          ) + ';\nmodule.exports = data;'
        )
      }

      // Run indexing on all contexts concurrently
      const indexingPromises = contexts.map((context, i) => 
        context.indexCodebase(tempDir)
      )

      await Promise.all(indexingPromises)
      
      const afterIndexingMemory = process.memoryUsage()
      const memoryIncrease = (afterIndexingMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024
      
      console.log(`Memory usage: ${memoryIncrease.toFixed(2)}MB increase after stress test`)
      expect(memoryIncrease).toBeLessThan(500) // Should not exceed 500MB increase

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }
      
      const finalMemory = process.memoryUsage()
      const finalIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024
      
      console.log(`Memory after GC: ${finalIncrease.toFixed(2)}MB increase`)
    })

    it('should maintain performance with concurrent operations', async () => {
      const embedding = new OpenAIEmbedding({
        apiKey: 'test-key', 
        model: 'text-embedding-ada-002'
      })
      
      const vectorDB = new MockVectorDatabase()
      
      const context = new Context({
        embedding,
        vectorDatabase: vectorDB as any
      })

      // Create test files
      for (let i = 0; i < 20; i++) {
        fs.writeFileSync(
          path.join(tempDir, `concurrent-${i}.js`),
          `function test${i}() { return "test ${i}"; }`
        )
      }

      // Index once
      await context.indexCodebase(tempDir)

      // Test concurrent searches
      const concurrentSearches = 20
      const queries = Array.from({ length: concurrentSearches }, (_, i) => `test${i}`)
      
      const startTime = Date.now()
      
      const searchPromises = queries.map(query =>
        context.semanticSearch(tempDir, query, 5)
      )
      
      const results = await Promise.all(searchPromises)
      
      const duration = Date.now() - startTime
      const searchesPerSecond = concurrentSearches / duration * 1000
      
      results.forEach(searchResults => {
        expect(searchResults).toBeInstanceOf(Array)
      })
      
      console.log(`Concurrent search performance: ${concurrentSearches} searches in ${duration}ms (${searchesPerSecond.toFixed(2)} searches/sec)`)
      
      // Test mixed operations (search + index)
      const mixedStartTime = Date.now()
      
      const mixedPromises = [
        ...Array.from({ length: 5 }, (_, i) => 
          context.semanticSearch(tempDir, `query ${i}`, 3)
        ),
        // Add some new files during search
        ...(async () => {
          for (let i = 20; i < 25; i++) {
            fs.writeFileSync(
              path.join(tempDir, `mixed-${i}.js`),
              `function mixed${i}() { return "mixed ${i}"; }`
            )
          }
          return context.indexCodebase(tempDir, undefined, true)
        })()
      ]
      
      await Promise.all(mixedPromises)
      
      const mixedDuration = Date.now() - mixedStartTime
      
      console.log(`Mixed operations performance: ${mixedDuration}ms`)
      expect(mixedDuration).toBeLessThan(10000) // Should complete within 10 seconds
    })
  })
})