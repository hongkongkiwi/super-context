import { vi } from 'vitest'

export const VoyageAIClient: any = vi.fn().mockImplementation((_cfg: { apiKey: string }) => ({
  embed: vi.fn().mockImplementation(async (args: any) => {
    const build = () => ({ embedding: new Array(1024).fill(0).map(() => Math.random()) })
    if (Array.isArray(args?.input)) {
      return { data: args.input.map(() => build()) }
    }
    return { data: [build()] }
  })
}))
