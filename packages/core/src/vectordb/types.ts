// Re-export interfaces from the new interfaces file
export {
    VectorDocument,
    SearchOptions,
    VectorSearchResult,
    HybridSearchRequest,
    HybridSearchOptions,
    RerankStrategy,
    HybridSearchResult,
    SimpleVectorDatabase,
    MultiCollectionVectorDatabase,
    VectorDatabaseAdapter,
    VectorDatabaseConfig,
    VectorDatabaseHealth,
    VectorDatabaseMetrics,
    COLLECTION_LIMIT_MESSAGE
} from './interfaces';

// Import the actual interfaces for backward compatibility aliases
import { SimpleVectorDatabase, VectorDatabaseAdapter } from './interfaces';

// Backward compatibility aliases
export type VectorDatabase = SimpleVectorDatabase;
export type CollectionAwareVectorDatabase = VectorDatabaseAdapter; 