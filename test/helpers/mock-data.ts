export const mockDocuments = [
  {
    id: 'doc1',
    content: 'This is a test document about JavaScript functions',
    metadata: {
      path: '/src/utils/helpers.js',
      type: 'javascript',
      lastModified: '2024-01-01T00:00:00Z'
    },
    embedding: [0.1, 0.2, 0.3, 0.4, 0.5]
  },
  {
    id: 'doc2',
    content: 'TypeScript interface definitions and types',
    metadata: {
      path: '/src/types/user.ts',
      type: 'typescript',
      lastModified: '2024-01-02T00:00:00Z'
    },
    embedding: [0.6, 0.7, 0.8, 0.9, 1.0]
  },
  {
    id: 'doc3',
    content: 'Python class implementation with async methods',
    metadata: {
      path: '/src/services/api.py',
      type: 'python',
      lastModified: '2024-01-03T00:00:00Z'
    },
    embedding: [1.1, 1.2, 1.3, 1.4, 1.5]
  }
]

export const mockSearchResults = [
  {
    document: mockDocuments[0],
    score: 0.95,
    relevance: 'high'
  },
  {
    document: mockDocuments[1],
    score: 0.78,
    relevance: 'medium'
  }
]

export const mockFileTree = {
  '/src': {
    'index.ts': 'export * from "./components"',
    'components': {
      'Button.tsx': 'export const Button = () => <button>Click</button>',
      'Input.tsx': 'export const Input = () => <input />'
    },
    'utils': {
      'helpers.js': 'export const helper = () => {}',
      'constants.ts': 'export const API_URL = "https://api.example.com"'
    }
  },
  '/tests': {
    'setup.ts': 'import { vi } from "vitest"'
  }
}

export const mockEmbeddingResponse = {
  embeddings: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]],
  usage: {
    prompt_tokens: 10,
    total_tokens: 10
  }
}

export const mockVectorDBResponse = {
  ids: ['doc1', 'doc2'],
  distances: [0.1, 0.2],
  metadatas: [
    { path: '/src/file1.ts', type: 'typescript' },
    { path: '/src/file2.js', type: 'javascript' }
  ]
}