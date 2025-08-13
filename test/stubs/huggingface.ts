import { vi } from 'vitest'

export const HfInference: any = vi.fn().mockImplementation((_key: string) => ({
  featureExtraction: vi.fn().mockResolvedValue([
    new Array(384).fill(0).map(() => Math.random())
  ])
}))
