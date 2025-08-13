import { vi } from 'vitest'

// Pinecone stub as a mocked constructor to support mockImplementation in tests
export const Pinecone: any = vi.fn().mockImplementation((_opts: { apiKey: string; environment?: string }) => {
  const makeIndex = () => ({
    upsert: vi.fn().mockResolvedValue({}),
    query: vi.fn().mockResolvedValue({ matches: [] }),
    deleteAll: vi.fn().mockResolvedValue({}),
    describeIndexStats: vi.fn().mockResolvedValue({ totalVectorCount: 0, dimension: 1536 }),
    deleteMany: vi.fn().mockResolvedValue({}),
    fetch: vi.fn().mockResolvedValue({ vectors: {} })
  })

  return {
    index: vi.fn().mockImplementation((_name: string) => makeIndex()),
    // Provide Index alias to match some tests
    Index: vi.fn().mockImplementation((_name: string) => makeIndex()),
    createIndex: vi.fn().mockResolvedValue({}),
    deleteIndex: vi.fn().mockResolvedValue({}),
    listIndexes: vi.fn().mockResolvedValue({ indexes: [] }),
    describeIndex: vi.fn().mockResolvedValue({ status: { ready: true, state: 'Ready' } })
  }
})
