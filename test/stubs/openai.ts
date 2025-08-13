import { vi } from 'vitest'

const OpenAI: any = vi.fn().mockImplementation((_cfg: { apiKey: string; baseURL?: string }) => ({
  embeddings: {
    create: vi.fn().mockImplementation(async (args: any) => {
      const buildVector = () => new Array(1536).fill(0).map(() => Math.random())
      if (Array.isArray(args?.input)) {
        return { data: args.input.map(() => ({ embedding: buildVector() })) }
      }
      return { data: [{ embedding: buildVector() }] }
    })
  }
}))

export default OpenAI
