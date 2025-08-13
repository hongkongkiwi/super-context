import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Mutex, Semaphore, ConcurrentTaskQueue, ResourcePool } from '@core/utils/mutex'

describe('Synchronization Utilities', () => {
  describe('Mutex', () => {
    let mutex: Mutex

    beforeEach(() => {
      mutex = new Mutex()
    })

    it('should allow single access', async () => {
      let counter = 0
      const increment = async () => {
        await mutex.acquire()
        try {
          const current = counter
          await new Promise(resolve => setTimeout(resolve, 10))
          counter = current + 1
        } finally {
          mutex.release()
        }
      }

      await increment()
      expect(counter).toBe(1)
    })

    it('should serialize concurrent access', async () => {
      let counter = 0
      const increment = async () => {
        await mutex.acquire()
        try {
          const current = counter
          await new Promise(resolve => setTimeout(resolve, 10))
          counter = current + 1
        } finally {
          mutex.release()
        }
      }

      // Start multiple concurrent operations
      const promises = Array.from({ length: 5 }, () => increment())
      await Promise.all(promises)

      expect(counter).toBe(5)
    })

    it('should handle exceptions properly', async () => {
      const operation = async () => {
        await mutex.acquire()
        try {
          throw new Error('Test error')
        } finally {
          mutex.release()
        }
      }

      await expect(operation()).rejects.toThrow('Test error')
      
      // Mutex should still be available for next operation
      let executed = false
      await mutex.acquire()
      try {
        executed = true
      } finally {
        mutex.release()
      }
      
      expect(executed).toBe(true)
    })

    it('should support try-acquire pattern', async () => {
      const acquired1 = await mutex.tryAcquire()
      expect(acquired1).toBe(true)

      const acquired2 = await mutex.tryAcquire()
      expect(acquired2).toBe(false)

      mutex.release()

      const acquired3 = await mutex.tryAcquire()
      expect(acquired3).toBe(true)
      mutex.release()
    })
  })

  describe('Semaphore', () => {
    let semaphore: Semaphore

    beforeEach(() => {
      semaphore = new Semaphore(3)
    })

    it('should allow up to limit concurrent access', async () => {
      let activeCount = 0
      let maxActive = 0

      const operation = async () => {
        await semaphore.acquire()
        try {
          activeCount++
          maxActive = Math.max(maxActive, activeCount)
          await new Promise(resolve => setTimeout(resolve, 20))
          activeCount--
        } finally {
          semaphore.release()
        }
      }

      const promises = Array.from({ length: 10 }, () => operation())
      await Promise.all(promises)

      expect(maxActive).toBeLessThanOrEqual(3)
      expect(activeCount).toBe(0)
    })

    it('should block when limit is reached', async () => {
      const startTime = Date.now()
      let operationTimes: number[] = []

      const operation = async (id: number) => {
        await semaphore.acquire()
        try {
          operationTimes.push(Date.now() - startTime)
          await new Promise(resolve => setTimeout(resolve, 50))
        } finally {
          semaphore.release()
        }
      }

      const promises = Array.from({ length: 6 }, (_, i) => operation(i))
      await Promise.all(promises)

      // First 3 should start immediately, next 3 should be delayed
      expect(operationTimes.filter(t => t < 30)).toHaveLength(3)
      expect(operationTimes.filter(t => t >= 50)).toHaveLength(3)
    })

    it('should handle zero-capacity semaphore', async () => {
      const zeroSemaphore = new Semaphore(0)
      
      let executed = false
      const operation = async () => {
        await zeroSemaphore.acquire()
        try {
          executed = true
        } finally {
          zeroSemaphore.release()
        }
      }

      const promise = operation()
      
      // Should not execute immediately
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(executed).toBe(false)

      // Release a permit manually
      zeroSemaphore.release()
      await promise
      
      expect(executed).toBe(true)
    })
  })

  describe('ConcurrentTaskQueue', () => {
    let queue: ConcurrentTaskQueue

    beforeEach(() => {
      queue = new ConcurrentTaskQueue(2)
    })

    it('should process tasks with limited concurrency', async () => {
      let activeCount = 0
      let maxActive = 0
      const results: number[] = []

      const createTask = (id: number) => async () => {
        activeCount++
        maxActive = Math.max(maxActive, activeCount)
        await new Promise(resolve => setTimeout(resolve, 20))
        activeCount--
        results.push(id)
        return id
      }

      const tasks = Array.from({ length: 6 }, (_, i) => createTask(i))
      const promises = tasks.map(task => queue.add(task))
      
      await Promise.all(promises)

      expect(maxActive).toBeLessThanOrEqual(2)
      expect(results).toHaveLength(6)
      expect(new Set(results)).toEqual(new Set([0, 1, 2, 3, 4, 5]))
    })

    it('should handle task failures gracefully', async () => {
      const successTask = async () => 'success'
      const failTask = async () => { throw new Error('task failed') }

      const results = await Promise.allSettled([
        queue.add(successTask),
        queue.add(failTask),
        queue.add(successTask)
      ])

      expect(results[0].status).toBe('fulfilled')
      expect(results[1].status).toBe('rejected')
      expect(results[2].status).toBe('fulfilled')
    })

    it('should return task results', async () => {
      const task1 = async () => 'result1'
      const task2 = async () => 42
      const task3 = async () => ({ data: 'test' })

      const results = await Promise.all([
        queue.add(task1),
        queue.add(task2),
        queue.add(task3)
      ])

      expect(results[0]).toBe('result1')
      expect(results[1]).toBe(42)
      expect(results[2]).toEqual({ data: 'test' })
    })

    it('should handle priority tasks', async () => {
      const executionOrder: string[] = []
      
      const createTask = (name: string, delay: number = 10) => async () => {
        await new Promise(resolve => setTimeout(resolve, delay))
        executionOrder.push(name)
        return name
      }

      // Add tasks with different priorities
      const promises = [
        queue.add(createTask('normal1')),
        queue.add(createTask('high1'), { priority: 1 }),
        queue.add(createTask('normal2')),
        queue.add(createTask('high2'), { priority: 1 })
      ]

      await Promise.all(promises)

      // High priority tasks should execute before normal ones
      const highIndex1 = executionOrder.indexOf('high1')
      const highIndex2 = executionOrder.indexOf('high2')
      const normalIndex1 = executionOrder.indexOf('normal1')
      const normalIndex2 = executionOrder.indexOf('normal2')

      expect(Math.min(highIndex1, highIndex2)).toBeLessThan(Math.max(normalIndex1, normalIndex2))
    })
  })

  describe('ResourcePool', () => {
    let pool: ResourcePool<string>

    beforeEach(() => {
      const createResource = async () => `resource-${Math.random()}`
      const destroyResource = async (resource: string) => { /* cleanup */ }
      
      pool = new ResourcePool(createResource, destroyResource, {
        minSize: 1,
        maxSize: 3,
        acquireTimeout: 1000
      })
    })

    it('should provide resources from pool', async () => {
      const resource1 = await pool.acquire()
      const resource2 = await pool.acquire()

      expect(typeof resource1).toBe('string')
      expect(typeof resource2).toBe('string')
      expect(resource1).not.toBe(resource2)

      await pool.release(resource1)
      await pool.release(resource2)
    })

    it('should reuse released resources', async () => {
      const resource1 = await pool.acquire()
      await pool.release(resource1)

      const resource2 = await pool.acquire()
      expect(resource2).toBe(resource1) // Should reuse the same resource

      await pool.release(resource2)
    })

    it('should respect maximum pool size', async () => {
      const resources = []
      
      // Acquire max number of resources
      for (let i = 0; i < 3; i++) {
        resources.push(await pool.acquire())
      }

      // Next acquire should timeout or wait
      const startTime = Date.now()
      const acquirePromise = pool.acquire()
      
      // Release one resource after a delay
      setTimeout(() => pool.release(resources[0]), 50)
      
      const resource = await acquirePromise
      const elapsedTime = Date.now() - startTime

      expect(elapsedTime).toBeGreaterThanOrEqual(45)
      expect(typeof resource).toBe('string')

      // Cleanup
      await pool.release(resource)
      for (let i = 1; i < resources.length; i++) {
        await pool.release(resources[i])
      }
    })

    it('should handle resource creation failures', async () => {
      const failingPool = new ResourcePool<string>(
        async () => { throw new Error('Resource creation failed') },
        async () => { /* cleanup */ },
        { minSize: 0, maxSize: 1 }
      )

      await expect(failingPool.acquire()).rejects.toThrow('Resource creation failed')
    })

    it('should clean up resources on destroy', async () => {
      const destroyedResources: string[] = []
      
      const poolWithTracking = new ResourcePool<string>(
        async () => `resource-${Math.random()}`,
        async (resource: string) => { destroyedResources.push(resource) },
        { minSize: 2, maxSize: 3 }
      )

      const resource1 = await poolWithTracking.acquire()
      const resource2 = await poolWithTracking.acquire()
      
      await poolWithTracking.release(resource1)
      await poolWithTracking.release(resource2)
      
      await poolWithTracking.destroy()

      expect(destroyedResources.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Integration scenarios', () => {
    it('should handle complex concurrent operations', async () => {
      const mutex = new Mutex()
      const semaphore = new Semaphore(2)
      let sharedResource = 0
      const results: number[] = []

      const complexOperation = async (id: number) => {
        // First acquire semaphore (limit concurrent operations)
        await semaphore.acquire()
        try {
          // Then acquire mutex for critical section
          await mutex.acquire()
          try {
            const current = sharedResource
            await new Promise(resolve => setTimeout(resolve, 5))
            sharedResource = current + 1
            results.push(sharedResource)
          } finally {
            mutex.release()
          }
          
          // Do some work outside critical section
          await new Promise(resolve => setTimeout(resolve, 10))
        } finally {
          semaphore.release()
        }
      }

      const operations = Array.from({ length: 10 }, (_, i) => complexOperation(i))
      await Promise.all(operations)

      expect(sharedResource).toBe(10)
      expect(results).toHaveLength(10)
      expect(new Set(results)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
    })

    it('should handle nested locking without deadlock', async () => {
      const outerMutex = new Mutex()
      const innerMutex = new Mutex()
      let result = ''

      const operation = async (suffix: string) => {
        await outerMutex.acquire()
        try {
          result += 'outer' + suffix
          
          await innerMutex.acquire()
          try {
            result += 'inner' + suffix
          } finally {
            innerMutex.release()
          }
        } finally {
          outerMutex.release()
        }
      }

      await Promise.all([
        operation('A'),
        operation('B')
      ])

      expect(result).toMatch(/outer[AB]inner[AB]outer[AB]inner[AB]/)
    })
  })
})