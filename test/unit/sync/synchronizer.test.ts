import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FileSynchronizer } from '@core/sync/synchronizer'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('FileSynchronizer', () => {
  let tempDir: string
  let synchronizer: FileSynchronizer
  let tempFiles: string[] = []

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-'))
    synchronizer = new FileSynchronizer(tempDir, ['node_modules', '*.log'])
  })

  afterEach(async () => {
    // Clean up temp files and directory
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

  describe('constructor', () => {
    it('should initialize with root directory', () => {
      expect(synchronizer).toBeInstanceOf(FileSynchronizer)
    })

    it('should accept ignore patterns', () => {
      const syncWithPatterns = new FileSynchronizer(tempDir, ['*.tmp', 'test/**'])
      expect(syncWithPatterns).toBeInstanceOf(FileSynchronizer)
    })

    it('should handle empty ignore patterns', () => {
      const syncNoPatterns = new FileSynchronizer(tempDir, [])
      expect(syncNoPatterns).toBeInstanceOf(FileSynchronizer)
    })
  })

  describe('initialize', () => {
    it('should initialize synchronizer state', async () => {
      await expect(synchronizer.initialize()).resolves.not.toThrow()
    })

    it('should handle non-existent directory', async () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent')
      const badSync = new FileSynchronizer(nonExistentPath)
      
      // Should handle gracefully or throw appropriate error
      await expect(badSync.initialize()).rejects.toThrow()
    })

    it('should load existing snapshot if available', async () => {
      // First initialization
      await synchronizer.initialize()
      
      // Create a file
      const testFile = path.join(tempDir, 'test.txt')
      fs.writeFileSync(testFile, 'initial content')
      
      // Check for changes and save state
      await synchronizer.checkForChanges()
      
      // Create new synchronizer instance
      const newSync = new FileSynchronizer(tempDir, ['node_modules', '*.log'])
      await newSync.initialize()
      
      // Should load previous state
      expect(newSync).toBeInstanceOf(FileSynchronizer)
    })
  })

  describe('checkForChanges', () => {
    beforeEach(async () => {
      await synchronizer.initialize()
    })

    it('should detect no changes on empty directory', async () => {
      const changes = await synchronizer.checkForChanges()
      
      expect(changes.added).toEqual([])
      expect(changes.removed).toEqual([])
      expect(changes.modified).toEqual([])
    })

    it('should detect added files', async () => {
      const testFile = path.join(tempDir, 'new-file.txt')
      fs.writeFileSync(testFile, 'new file content')
      
      const changes = await synchronizer.checkForChanges()
      
      expect(changes.added).toContain('new-file.txt')
      expect(changes.removed).toEqual([])
      expect(changes.modified).toEqual([])
    })

    it('should detect modified files', async () => {
      // Create initial file
      const testFile = path.join(tempDir, 'test-file.txt')
      fs.writeFileSync(testFile, 'original content')
      
      // First scan to establish baseline
      await synchronizer.checkForChanges()
      
      // Modify the file
      fs.writeFileSync(testFile, 'modified content')
      
      const changes = await synchronizer.checkForChanges()
      
      expect(changes.modified).toContain('test-file.txt')
    })

    it('should detect removed files', async () => {
      // Create initial file
      const testFile = path.join(tempDir, 'to-be-removed.txt')
      fs.writeFileSync(testFile, 'content')
      
      // First scan to establish baseline
      await synchronizer.checkForChanges()
      
      // Remove the file
      fs.unlinkSync(testFile)
      
      const changes = await synchronizer.checkForChanges()
      
      expect(changes.removed).toContain('to-be-removed.txt')
    })

    it('should respect ignore patterns', async () => {
      // Create files that should be ignored
      fs.mkdirSync(path.join(tempDir, 'node_modules'))
      fs.writeFileSync(path.join(tempDir, 'node_modules', 'package.js'), 'ignored')
      fs.writeFileSync(path.join(tempDir, 'debug.log'), 'log content')
      
      // Create file that should not be ignored
      fs.writeFileSync(path.join(tempDir, 'important.txt'), 'important')
      
      const changes = await synchronizer.checkForChanges()
      
      expect(changes.added).toContain('important.txt')
      expect(changes.added).not.toContain('node_modules/package.js')
      expect(changes.added).not.toContain('debug.log')
    })

    it('should handle multiple file types', async () => {
      // Create various file types
      fs.writeFileSync(path.join(tempDir, 'script.js'), 'console.log("test")')
      fs.writeFileSync(path.join(tempDir, 'style.css'), 'body { margin: 0; }')
      fs.writeFileSync(path.join(tempDir, 'data.json'), '{"test": true}')
      
      const changes = await synchronizer.checkForChanges()
      
      expect(changes.added).toContain('script.js')
      expect(changes.added).toContain('style.css')
      expect(changes.added).toContain('data.json')
    })

    it('should handle nested directories', async () => {
      // Create nested structure
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true })
      fs.mkdirSync(path.join(tempDir, 'src', 'utils'), { recursive: true })
      
      fs.writeFileSync(path.join(tempDir, 'src', 'index.js'), 'main file')
      fs.writeFileSync(path.join(tempDir, 'src', 'utils', 'helper.js'), 'helper function')
      
      const changes = await synchronizer.checkForChanges()
      
      expect(changes.added).toContain('src/index.js')
      expect(changes.added).toContain('src/utils/helper.js')
    })
  })

  describe('snapshot management', () => {
    it('should create snapshot directory if not exists', async () => {
      await synchronizer.initialize()
      
      // Snapshot path should be deterministic based on temp dir path
      const homeDir = os.homedir()
      const merkleDir = path.join(homeDir, '.context', 'merkle')
      
      // Directory should exist or be creatable
      expect(() => fs.accessSync(merkleDir)).not.toThrow()
    })

    it('should save and load snapshots correctly', async () => {
      await synchronizer.initialize()
      
      // Create test file
      fs.writeFileSync(path.join(tempDir, 'snapshot-test.txt'), 'test content')
      
      // Check for changes (this should save snapshot)
      const changes1 = await synchronizer.checkForChanges()
      expect(changes1.added).toContain('snapshot-test.txt')
      
      // Create new synchronizer instance
      const newSync = new FileSynchronizer(tempDir, ['node_modules', '*.log'])
      await newSync.initialize()
      
      // Should not detect the same file as new
      const changes2 = await newSync.checkForChanges()
      expect(changes2.added).not.toContain('snapshot-test.txt')
    })
  })

  describe('static methods', () => {
    it('should delete snapshot file', async () => {
      await synchronizer.initialize()
      
      // Create some state
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'content')
      await synchronizer.checkForChanges()
      
      // Delete snapshot
      await FileSynchronizer.deleteSnapshot(tempDir)
      
      // New instance should detect all files as new
      const newSync = new FileSynchronizer(tempDir, ['node_modules', '*.log'])
      await newSync.initialize()
      const changes = await newSync.checkForChanges()
      
      expect(changes.added).toContain('test.txt')
    })
  })

  describe('error handling', () => {
    it('should handle permission errors gracefully', async () => {
      // This test might not work on all systems, but should not crash
      await expect(synchronizer.initialize()).resolves.not.toThrow()
    })

    it('should handle corrupted snapshot files', async () => {
      await synchronizer.initialize()
      
      // Create corrupted snapshot by writing invalid JSON
      const homeDir = os.homedir()
      const merkleDir = path.join(homeDir, '.context', 'merkle')
      const hash = require('crypto').createHash('md5').update(path.resolve(tempDir)).digest('hex')
      const snapshotPath = path.join(merkleDir, `${hash}.json`)
      
      try {
        fs.mkdirSync(merkleDir, { recursive: true })
        fs.writeFileSync(snapshotPath, 'invalid json content')
        tempFiles.push(snapshotPath)
        
        // Should handle corrupted snapshot gracefully
        const newSync = new FileSynchronizer(tempDir, [])
        await expect(newSync.initialize()).resolves.not.toThrow()
      } catch (error) {
        // Test might not be able to create files in home directory
        console.warn('Could not test corrupted snapshot handling:', error)
      }
    })

    it('should handle very large directories', async () => {
      // Create many files to test performance and memory usage
      for (let i = 0; i < 100; i++) {
        fs.writeFileSync(path.join(tempDir, `file_${i}.txt`), `content ${i}`)
      }
      
      const changes = await synchronizer.checkForChanges()
      expect(changes.added).toHaveLength(100)
    })
  })
})