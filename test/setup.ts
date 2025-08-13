import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'

// Global mocks for tree-sitter modules
vi.mock('tree-sitter', () => ({
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
}))

vi.mock('tree-sitter-javascript', () => ({}))
vi.mock('tree-sitter-typescript', () => ({ typescript: {} }))
vi.mock('tree-sitter-python', () => ({}))
vi.mock('tree-sitter-java', () => ({}))
vi.mock('tree-sitter-cpp', () => ({}))
vi.mock('tree-sitter-go', () => ({}))
vi.mock('tree-sitter-rust', () => ({}))
vi.mock('tree-sitter-c-sharp', () => ({}))
vi.mock('tree-sitter-scala', () => ({}))

beforeAll(async () => {
  process.env.NODE_ENV = 'test'
})

afterAll(async () => {
})

beforeEach(async () => {
})

afterEach(async () => {
})