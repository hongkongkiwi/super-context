import { vi } from 'vitest'

// Stateful Chroma stub that tracks collections and documents in-memory
export const ChromaApi: any = vi.fn().mockImplementation((_cfg: { path: string }) => {
  type StoredDoc = {
    id: string
    embedding?: number[]
    metadata: Record<string, any>
    document: string
  }

  const collections = new Map<string, {
    name: string
    docs: StoredDoc[]
    api: any
  }>()

  const buildQueryResponse = (docs: StoredDoc[], nResults: number) => {
    const top = docs.slice(0, Math.max(0, nResults || 10))
    return {
      ids: [top.map(d => d.id)],
      distances: [top.map(() => 0.2)],
      metadatas: [top.map(d => d.metadata)],
      documents: [top.map(d => d.document)]
    }
  }

  const makeCollectionApi = (name: string) => {
    const col = collections.get(name)!
    const api = {
      name,
      add: vi.fn().mockImplementation(async (args: {
        ids: string[]
        embeddings?: number[][]
        metadatas?: Record<string, any>[]
        documents?: string[]
      }) => {
        const { ids = [], embeddings = [], metadatas = [], documents = [] } = args || {}
        for (let i = 0; i < ids.length; i++) {
          col.docs.push({
            id: ids[i],
            embedding: embeddings[i],
            metadata: metadatas[i] || {},
            document: documents[i] || ''
          })
        }
        return {}
      }),
      query: vi.fn().mockImplementation(async (args: {
        queryEmbeddings?: number[][]
        queryTexts?: string[]
        where?: any
        nResults?: number
        include?: string[]
      }) => {
        let results = [...col.docs]
        // Very basic filter support: where: { field: { $eq: value } } or { field: { $in: [...] } }
        if (args?.where && typeof args.where === 'object') {
          results = results.filter(doc => {
            return Object.entries(args.where as Record<string, any>).every(([field, cond]) => {
              if (cond && typeof cond === 'object') {
                if ('$eq' in cond) return doc.metadata?.[field] === cond['$eq']
                if ('$in' in cond) return Array.isArray(cond['$in']) && cond['$in'].includes(doc.metadata?.[field])
              }
              return true
            })
          })
        }
        return buildQueryResponse(results, args?.nResults || 10)
      }),
      update: vi.fn().mockImplementation(async (args: {
        ids: string[]
        embeddings?: number[][]
        metadatas?: Record<string, any>[]
        documents?: string[]
      }) => {
        const { ids = [], embeddings = [], metadatas = [], documents = [] } = args || {}
        ids.forEach((id, idx) => {
          const i = col.docs.findIndex(d => d.id === id)
          if (i >= 0) {
            if (embeddings[idx]) col.docs[i].embedding = embeddings[idx]
            if (metadatas[idx]) col.docs[i].metadata = metadatas[idx]
            if (documents[idx]) col.docs[i].document = documents[idx]
          }
        })
        return {}
      }),
      delete: vi.fn().mockImplementation(async (args: { ids?: string[]; where?: any }) => {
        if (args?.ids && args.ids.length > 0) {
          for (const id of args.ids) {
            const i = col.docs.findIndex(d => d.id === id)
            if (i >= 0) col.docs.splice(i, 1)
          }
        } else if (args?.where) {
          // match same as in query
          const keep: StoredDoc[] = []
          for (const d of col.docs) {
            const match = Object.entries(args.where as Record<string, any>).every(([field, cond]) => {
              if (cond && typeof cond === 'object') {
                if ('$eq' in cond) return d.metadata?.[field] === cond['$eq']
                if ('$in' in cond) return Array.isArray(cond['$in']) && cond['$in'].includes(d.metadata?.[field])
              }
              return true
            })
            if (!match) keep.push(d)
          }
          col.docs = keep
        }
        return {}
      }),
      count: vi.fn().mockImplementation(async () => col.docs.length),
      metadata: {},
      peek: vi.fn().mockImplementation(async (args: { limit?: number }) => {
        const n = Math.max(0, args?.limit || 10)
        const top = col.docs.slice(0, n)
        return {
          ids: top.map(d => d.id),
          documents: top.map(d => d.document),
          metadatas: top.map(d => d.metadata),
          embeddings: top.map(d => d.embedding || [])
        }
      })
    }
    col.api = api
    return api
  }

  const createCollection = vi.fn().mockImplementation(async ({ name }: { name: string }) => {
    if (!collections.has(name)) {
      collections.set(name, { name, docs: [], api: undefined })
    }
    return makeCollectionApi(name)
  })

  const getCollection = vi.fn().mockImplementation(async ({ name }: { name: string }) => {
    const col = collections.get(name)
    if (!col) {
      throw new Error(`Collection ${name} not found`)
    }
    return makeCollectionApi(name)
  })

  const deleteCollection = vi.fn().mockImplementation(async ({ name }: { name: string }) => {
    collections.delete(name)
    return {}
  })

  const listCollections = vi.fn().mockImplementation(async () => {
    return Array.from(collections.keys()).map(name => ({ name }))
  })

  return {
    version: vi.fn().mockResolvedValue('stub'),
    createCollection,
    getCollection,
    deleteCollection,
    listCollections
  }
})
