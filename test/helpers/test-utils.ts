import { vi } from 'vitest'

export const createMockEmbedding = () => ({
  embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4]),
  embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3, 0.4], [0.5, 0.6, 0.7, 0.8]])
})

export const createMockVectorDB = () => ({
  upsertDocuments: vi.fn().mockResolvedValue(undefined),
  searchDocuments: vi.fn().mockResolvedValue([]),
  deleteDocuments: vi.fn().mockResolvedValue(undefined),
  deleteCollection: vi.fn().mockResolvedValue(undefined),
  createCollection: vi.fn().mockResolvedValue(undefined),
  collectionExists: vi.fn().mockResolvedValue(false)
})

export const createMockSplitter = () => ({
  splitText: vi.fn().mockReturnValue(['chunk1', 'chunk2', 'chunk3'])
})

export const mockFileContent = {
  typescript: `
export interface User {
  id: string;
  name: string;
  email: string;
}

export class UserService {
  constructor(private db: Database) {}
  
  async getUser(id: string): Promise<User | null> {
    return this.db.findOne({ id });
  }
  
  async createUser(user: Omit<User, 'id'>): Promise<User> {
    const id = generateId();
    return this.db.create({ ...user, id });
  }
}
`,
  javascript: `
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}

class ShoppingCart {
  constructor() {
    this.items = [];
  }
  
  addItem(item) {
    this.items.push(item);
  }
  
  getTotal() {
    return calculateTotal(this.items);
  }
}
`,
  python: `
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

class Calculator:
    def add(self, a, b):
        return a + b
    
    def multiply(self, a, b):
        return a * b
`
}

export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const createTempFile = async (content: string, extension = 'txt'): Promise<string> => {
  const fs = await import('fs')
  const path = await import('path')
  const os = await import('os')
  
  const tempDir = os.tmpdir()
  const fileName = `test-${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`
  const filePath = path.join(tempDir, fileName)
  
  fs.writeFileSync(filePath, content)
  return filePath
}

export const cleanupTempFile = async (filePath: string): Promise<void> => {
  const fs = await import('fs')
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch (error) {
  }
}