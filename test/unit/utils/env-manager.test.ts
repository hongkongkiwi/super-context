import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { envManager } from '@core/utils/env-manager'

describe('EnvManager', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('get', () => {
    it('should return environment variable value', () => {
      process.env.TEST_VAR = 'test_value'
      expect(envManager.get('TEST_VAR')).toBe('test_value')
    })

    it('should return undefined for non-existent variable', () => {
      expect(envManager.get('NON_EXISTENT_VAR')).toBeUndefined()
    })

    it('should return undefined when variable does not exist', () => {
      expect(envManager.get('NON_EXISTENT_VAR')).toBeUndefined()
    })

    it('should handle empty string values', () => {
      process.env.EMPTY_VAR = ''
      // EnvManager returns undefined for empty strings in process.env
      expect(envManager.get('EMPTY_VAR')).toBeUndefined()
    })
  })

  describe('set', () => {
    it('should set environment variable to file', () => {
      envManager.set('NEW_VAR', 'new_value')
      // The envManager sets to .env file, not process.env
      expect(envManager.get('NEW_VAR')).toBe('new_value')
    })

    it('should handle empty string values', () => {
      envManager.set('EMPTY_SET_VAR', '')
      expect(envManager.get('EMPTY_SET_VAR')).toBe('')
    })
  })

  describe('getEnvFilePath', () => {
    it('should return the env file path', () => {
      const path = envManager.getEnvFilePath()
      expect(path).toBeTruthy()
      expect(path).toContain('.context')
      expect(path).toContain('.env')
    })
  })

  describe('common environment variable patterns', () => {
    it('should handle API keys', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'
      expect(envManager.get('OPENAI_API_KEY')).toBe('sk-test-key')
    })

    it('should handle URLs', () => {
      process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1'
      expect(envManager.get('OPENAI_BASE_URL')).toBe('https://api.openai.com/v1')
    })

    it('should handle boolean-like values', () => {
      process.env.HYBRID_MODE = 'true'
      expect(envManager.get('HYBRID_MODE')).toBe('true')
      
      process.env.HYBRID_MODE = 'false'
      expect(envManager.get('HYBRID_MODE')).toBe('false')
    })

    it('should handle numeric values', () => {
      process.env.EMBEDDING_BATCH_SIZE = '100'
      expect(envManager.get('EMBEDDING_BATCH_SIZE')).toBe('100')
    })
  })
})