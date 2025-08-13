// Re-export types and interfaces
export {
    VectorDocument,
    SearchOptions,
    VectorSearchResult,
    VectorDatabase,
    CollectionAwareVectorDatabase,
    SimpleVectorDatabase,
    MultiCollectionVectorDatabase,
    VectorDatabaseAdapter,
    VectorDatabaseConfig,
    VectorDatabaseHealth,
    VectorDatabaseMetrics,
    HybridSearchRequest,
    HybridSearchOptions,
    HybridSearchResult,
    RerankStrategy,
    COLLECTION_LIMIT_MESSAGE
} from './types';

// Export adapters and utilities
export {
    SimpleVectorDatabaseAdapter,
    MultiCollectionVectorDatabaseAdapter,
    createVectorDatabaseAdapter
} from './adapters';

// Implementation class exports
export { MilvusRestfulVectorDatabase, MilvusRestfulConfig } from './milvus-restful-vectordb';
export { MilvusVectorDatabase, MilvusConfig } from './milvus-vectordb';
export { QdrantVectorDatabase, QdrantConfig } from './qdrant-vectordb';
export { FaissVectorDatabase, FaissConfig } from './faiss-vectordb';
export { PineconeVectorDatabase, PineconeConfig } from './pinecone-vectordb';
export { PgVectorDatabase, PgVectorConfig } from './pgvector-vectordb';
export { WeaviateVectorDatabase, WeaviateConfig } from './weaviate-vectordb';
export { ChromaVectorDatabase, ChromaConfig } from './chroma-vectordb';
export { UpstashVectorDatabase, UpstashVectorConfig } from './upstash-vectordb';
export { OllamaVectorDatabase, OllamaVectorDbConfig } from './ollama-vectordb';
export { SemaDBVectorDatabase, SemaDBConfig } from './semadb-vectordb';
export { FirebaseVectorStore, FirebaseVectorStoreConfig } from './firebase-vectorstore';
export { S3VectorDatabase, S3VectorsConfig } from './s3-vectors';
export {
    ClusterManager,
    ZillizConfig,
    Project,
    Cluster,
    CreateFreeClusterRequest,
    CreateFreeClusterResponse,
    CreateFreeClusterWithDetailsResponse,
    DescribeClusterResponse
} from './zilliz-utils'; 