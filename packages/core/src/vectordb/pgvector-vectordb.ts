import { VectorDatabase, VectorDocument, VectorSearchResult, SearchOptions, HybridSearchResult, HybridSearchRequest } from './types';

// PostgreSQL client - install with: npm install pg @types/pg
let pg: any = null;
try {
    pg = require('pg');
} catch (error) {
    console.warn('[PGVECTOR] pg not available. Please install it with: npm install pg @types/pg');
}

export interface PgVectorConfig {
    // Database connection
    host: string;
    port?: number;
    database: string;
    user: string;
    password: string;
    // SSL configuration
    ssl?: boolean | any;
    // Connection pool settings
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    // Vector configuration
    tableName?: string;
    dimension: number;
    // Distance metric: 'cosine', 'l2' (euclidean), 'inner_product'
    metric?: 'cosine' | 'l2' | 'inner_product';
    // Index configuration
    indexType?: 'ivfflat' | 'hnsw';
    // IVFFLAT parameters
    ivfLists?: number;
    ivfProbes?: number;
    // HNSW parameters
    hnswM?: number;
    hnswEfConstruction?: number;
    hnswEfSearch?: number;
    // Schema configuration
    schema?: string;
}

export class PgVectorDatabase implements VectorDatabase {
    private config: PgVectorConfig;
    private pool: any = null;
    private isInitialized: boolean = false;
    private tableName: string;
    private schemaName: string;

    constructor(config: PgVectorConfig) {
        if (!pg) {
            throw new Error('pg is not available. Please install it with: npm install pg @types/pg');
        }

        this.config = {
            port: 5432,
            ssl: false,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
            tableName: 'vectors',
            metric: 'cosine',
            indexType: 'ivfflat',
            ivfLists: 1000,
            ivfProbes: 10,
            hnswM: 16,
            hnswEfConstruction: 64,
            hnswEfSearch: 40,
            schema: 'public',
            ...config
        };

        this.tableName = this.config.tableName!;
        this.schemaName = this.config.schema!;

        if (!this.config.host || !this.config.database || !this.config.user) {
            throw new Error('PostgreSQL host, database, user are required');
        }
    }

    async connect(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        console.log(`[PGVECTOR] Connecting to PostgreSQL database at ${this.config.host}:${this.config.port}...`);
        
        try {
            // Create connection pool
            this.pool = new pg.Pool({
                host: this.config.host,
                port: this.config.port,
                database: this.config.database,
                user: this.config.user,
                password: this.config.password,
                ssl: this.config.ssl,
                max: this.config.max,
                idleTimeoutMillis: this.config.idleTimeoutMillis,
                connectionTimeoutMillis: this.config.connectionTimeoutMillis
            });

            // Test connection and ensure pgvector extension is enabled
            const client = await this.pool.connect();
            
            try {
                // Enable pgvector extension if not already enabled
                await client.query('CREATE EXTENSION IF NOT EXISTS vector');
                console.log(`[PGVECTOR] pgvector extension is available`);

                // Verify pgvector is working
                const result = await client.query('SELECT vector(\'[1,2,3]\') as test_vector');
                console.log(`[PGVECTOR] pgvector functionality verified`);
            } finally {
                client.release();
            }

            this.isInitialized = true;
            console.log(`[PGVECTOR] ✅ Successfully connected to PostgreSQL with pgvector extension`);
        } catch (error) {
            console.error(`[PGVECTOR] Failed to connect: ${error}`);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.isInitialized && this.pool) {
            await this.pool.end();
            this.pool = null;
            this.isInitialized = false;
            console.log(`[PGVECTOR] Disconnected from database`);
        }
    }

    async createCollection(name: string, dimension: number): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        this.tableName = name;
        console.log(`[PGVECTOR] Creating table "${this.schemaName}.${this.tableName}" with dimension ${dimension}...`);

        const client = await this.pool.connect();
        
        try {
            // Create schema if it doesn't exist
            if (this.schemaName !== 'public') {
                await client.query(`CREATE SCHEMA IF NOT EXISTS ${this.schemaName}`);
            }

            // Create table with vector column
            const createTableQuery = `
                CREATE TABLE IF NOT EXISTS ${this.schemaName}.${this.tableName} (
                    id SERIAL PRIMARY KEY,
                    doc_id TEXT UNIQUE,
                    content TEXT NOT NULL,
                    source TEXT,
                    embedding VECTOR(${dimension}),
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;
            
            await client.query(createTableQuery);
            console.log(`[PGVECTOR] Table "${this.schemaName}.${this.tableName}" created`);

            // Create vector index for efficient similarity search
            await this.createVectorIndex();

            // Create additional indexes for common queries
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_${this.tableName}_doc_id 
                ON ${this.schemaName}.${this.tableName} (doc_id)
            `);
            
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_${this.tableName}_source 
                ON ${this.schemaName}.${this.tableName} (source)
            `);
            
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_${this.tableName}_metadata 
                ON ${this.schemaName}.${this.tableName} USING GIN (metadata)
            `);

            console.log(`[PGVECTOR] ✅ Table "${this.schemaName}.${this.tableName}" created successfully with indexes`);
        } catch (error) {
            console.error(`[PGVECTOR] Failed to create table: ${error}`);
            throw error;
        } finally {
            client.release();
        }
    }

    private async createVectorIndex(): Promise<void> {
        const client = await this.pool.connect();
        
        try {
            let indexQuery = '';
            let distanceOperator = '';

            // Determine distance operator and index type
            switch (this.config.metric) {
                case 'cosine':
                    distanceOperator = 'vector_cosine_ops';
                    break;
                case 'l2':
                    distanceOperator = 'vector_l2_ops';
                    break;
                case 'inner_product':
                    distanceOperator = 'vector_ip_ops';
                    break;
                default:
                    distanceOperator = 'vector_cosine_ops';
            }

            const indexName = `idx_${this.tableName}_embedding_${this.config.indexType}`;

            if (this.config.indexType === 'ivfflat') {
                indexQuery = `
                    CREATE INDEX IF NOT EXISTS ${indexName}
                    ON ${this.schemaName}.${this.tableName}
                    USING ivfflat (embedding ${distanceOperator})
                    WITH (lists = ${this.config.ivfLists})
                `;
            } else if (this.config.indexType === 'hnsw') {
                indexQuery = `
                    CREATE INDEX IF NOT EXISTS ${indexName}
                    ON ${this.schemaName}.${this.tableName}
                    USING hnsw (embedding ${distanceOperator})
                    WITH (m = ${this.config.hnswM}, ef_construction = ${this.config.hnswEfConstruction})
                `;
            }

            if (indexQuery) {
                await client.query(indexQuery);
                console.log(`[PGVECTOR] Created ${this.config.indexType} index with ${this.config.metric} distance`);
            }

            // Set runtime parameters for better performance
            if (this.config.indexType === 'ivfflat') {
                await client.query(`SET ivfflat.probes = ${this.config.ivfProbes}`);
            } else if (this.config.indexType === 'hnsw') {
                await client.query(`SET hnsw.ef_search = ${this.config.hnswEfSearch}`);
            }

        } catch (error) {
            console.error(`[PGVECTOR] Failed to create vector index: ${error}`);
            throw error;
        } finally {
            client.release();
        }
    }

    async hasCollection(name: string): Promise<boolean> {
        if (!this.isInitialized) {
            await this.connect();
        }

        const client = await this.pool.connect();
        
        try {
            const result = await client.query(`
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_schema = $1 AND table_name = $2
                )
            `, [this.schemaName, name]);
            
            return result.rows[0].exists;
        } catch (error) {
            console.error(`[PGVECTOR] Failed to check if table "${name}" exists: ${error}`);
            return false;
        } finally {
            client.release();
        }
    }

    async dropCollection(name: string): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[PGVECTOR] Dropping table "${this.schemaName}.${name}"...`);

        const client = await this.pool.connect();
        
        try {
            await client.query(`DROP TABLE IF EXISTS ${this.schemaName}.${name} CASCADE`);
            console.log(`[PGVECTOR] ✅ Table "${this.schemaName}.${name}" dropped successfully`);
        } catch (error) {
            console.error(`[PGVECTOR] Failed to drop table "${name}": ${error}`);
            throw error;
        } finally {
            client.release();
        }
    }

    async insertDocuments(documents: VectorDocument[]): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        if (documents.length === 0) {
            return;
        }

        console.log(`[PGVECTOR] Inserting ${documents.length} documents...`);

        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');

            const insertQuery = `
                INSERT INTO ${this.schemaName}.${this.tableName} 
                (doc_id, content, source, embedding, metadata)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (doc_id) DO UPDATE SET
                    content = EXCLUDED.content,
                    source = EXCLUDED.source,
                    embedding = EXCLUDED.embedding,
                    metadata = EXCLUDED.metadata
            `;

            for (const doc of documents) {
                const vectorStr = `[${doc.vector.join(',')}]`;
                await client.query(insertQuery, [
                    doc.id || `doc_${Date.now()}_${Math.random()}`,
                    doc.content,
                    doc.source,
                    vectorStr,
                    JSON.stringify(doc.metadata || {})
                ]);
            }

            await client.query('COMMIT');
            console.log(`[PGVECTOR] ✅ Successfully inserted ${documents.length} documents`);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`[PGVECTOR] Failed to insert documents: ${error}`);
            throw error;
        } finally {
            client.release();
        }
    }

    async search(query: number[], options: SearchOptions = {}): Promise<VectorSearchResult[]> {
        if (!this.isInitialized) {
            await this.connect();
        }

        const limit = options.limit || 10;
        
        const client = await this.pool.connect();
        
        try {
            console.log(`[PGVECTOR] Searching for top ${limit} similar vectors...`);

            // Set runtime parameters for search performance
            if (this.config.indexType === 'ivfflat') {
                await client.query(`SET ivfflat.probes = ${this.config.ivfProbes}`);
            } else if (this.config.indexType === 'hnsw') {
                await client.query(`SET hnsw.ef_search = ${this.config.hnswEfSearch}`);
            }

            let distanceOperator = '';
            let orderDirection = 'ASC'; // For distances, smaller is better

            switch (this.config.metric) {
                case 'cosine':
                    distanceOperator = '<->';
                    orderDirection = 'ASC';
                    break;
                case 'l2':
                    distanceOperator = '<->';
                    orderDirection = 'ASC';
                    break;
                case 'inner_product':
                    distanceOperator = '<#>';
                    orderDirection = 'DESC'; // For inner product, larger is better
                    break;
                default:
                    distanceOperator = '<=>';
                    orderDirection = 'ASC';
            }

            const queryVector = `[${query.join(',')}]`;
            let searchQuery = `
                SELECT 
                    doc_id,
                    content,
                    source,
                    metadata,
                    embedding ${distanceOperator} $1::vector as distance
                FROM ${this.schemaName}.${this.tableName}
            `;

            const queryParams: any[] = [queryVector];
            let paramIndex = 2;

            // Add metadata filter if provided
            if (options.filter) {
                const filterConditions = [];
                for (const [key, value] of Object.entries(options.filter)) {
                    if (key === 'source') {
                        filterConditions.push(`source = $${paramIndex}`);
                        queryParams.push(value);
                        paramIndex++;
                    } else {
                        // Use JSONB operators for metadata filtering
                        filterConditions.push(`metadata ->> $${paramIndex} = $${paramIndex + 1}`);
                        queryParams.push(key, String(value));
                        paramIndex += 2;
                    }
                }
                
                if (filterConditions.length > 0) {
                    searchQuery += ` WHERE ${filterConditions.join(' AND ')}`;
                }
            }

            searchQuery += `
                ORDER BY embedding ${distanceOperator} $1::vector ${orderDirection}
                LIMIT $${paramIndex}
            `;
            
            queryParams.push(limit);

            const result = await client.query(searchQuery, queryParams);
            
            const searchResults: VectorSearchResult[] = result.rows.map((row: any) => {
                // Convert distance to similarity score
                let score = row.distance;
                if (this.config.metric === 'cosine' || this.config.metric === 'l2') {
                    // For distance metrics, convert to similarity: smaller distance = higher similarity
                    score = 1.0 / (1.0 + row.distance);
                }
                // For inner product, the distance is already similarity-like

                const document: VectorDocument = {
                    id: row.doc_id,
                    content: row.content,
                    source: row.source,
                    relativePath: row.relativePath || row.source || '',
                    startLine: row.startLine || 0,
                    endLine: row.endLine || 0,
                    fileExtension: row.fileExtension || '',
                    vector: [], // Don't include vector in results by default
                    metadata: row.metadata
                };

                return {
                    document,
                    score,
                    metadata: {
                        distance: row.distance,
                        metric: this.config.metric
                    }
                };
            });

            console.log(`[PGVECTOR] Found ${searchResults.length} results`);
            return searchResults;
        } catch (error) {
            console.error(`[PGVECTOR] Search failed: ${error}`);
            throw error;
        } finally {
            client.release();
        }
    }

    async hybridSearch(request: HybridSearchRequest): Promise<HybridSearchResult> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[PGVECTOR] Performing hybrid search with vector and text query...`);

        const client = await this.pool.connect();

        try {
            // Set search parameters
            if (this.config.indexType === 'ivfflat') {
                await client.query(`SET ivfflat.probes = ${this.config.ivfProbes}`);
            } else if (this.config.indexType === 'hnsw') {
                await client.query(`SET hnsw.ef_search = ${this.config.hnswEfSearch}`);
            }

            let distanceOperator = '';
            switch (this.config.metric) {
                case 'cosine': distanceOperator = '<=>'; break;
                case 'l2': distanceOperator = '<->'; break;
                case 'inner_product': distanceOperator = '<#>'; break;
                default: distanceOperator = '<=>';
            }

            const queryVector = `[${request.vector.join(',')}]`;
            
            // Perform vector search with text filtering using full-text search
            let hybridQuery = `
                WITH vector_search AS (
                    SELECT 
                        doc_id,
                        content,
                        source,
                        metadata,
                        embedding ${distanceOperator} $1::vector as vector_distance,
                        ts_rank(to_tsvector('english', content), plainto_tsquery('english', $2)) as text_rank
                    FROM ${this.schemaName}.${this.tableName}
                    WHERE ($2 = '' OR to_tsvector('english', content) @@ plainto_tsquery('english', $2))
                )
                SELECT *,
                    -- Combine vector and text scores (weighted average)
                    (vector_distance * 0.5 + (1.0 - text_rank) * 0.5) as combined_score
                FROM vector_search
            `;

            const queryParams = [queryVector, request.query || ''];

            // Add metadata filter if provided
            if (request.filter) {
                // This would need to be added to the WHERE clause in the CTE
                console.log(`[PGVECTOR] Metadata filter provided but not implemented in hybrid search`);
            }

            hybridQuery += `
                ORDER BY combined_score ASC
                LIMIT $3
            `;
            
            queryParams.push(String(request.limit || 10));

            const result = await client.query(hybridQuery, queryParams);

            const searchResults: VectorSearchResult[] = result.rows.map((row: any) => {
                const document: VectorDocument = {
                    id: row.doc_id,
                    content: row.content,
                    source: row.source,
                    relativePath: row.relativePath || row.source || '',
                    startLine: row.startLine || 0,
                    endLine: row.endLine || 0,
                    fileExtension: row.fileExtension || '',
                    vector: [],
                    metadata: row.metadata
                };

                return {
                    document,
                    score: 1.0 - row.combined_score, // Convert back to similarity
                    metadata: {
                        vector_distance: row.vector_distance,
                        text_rank: row.text_rank,
                        combined_score: row.combined_score
                    }
                };
            });

            console.log(`[PGVECTOR] Hybrid search found ${searchResults.length} results`);
            
            return {
                results: searchResults,
                metadata: {
                    searchType: 'hybrid',
                    vectorWeight: 0.5,
                    textWeight: 0.5
                }
            };
        } catch (error) {
            console.error(`[PGVECTOR] Hybrid search failed: ${error}`);
            
            // Fallback to vector search only
            const vectorResults = await this.search(request.vector, {
                limit: request.limit,
                filter: request.filter
            });

            return {
                results: vectorResults,
                metadata: {
                    searchType: 'vector_only',
                    message: 'Hybrid search failed, performed vector search only'
                }
            };
        } finally {
            client.release();
        }
    }

    async getDocumentCount(): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        const client = await this.pool.connect();
        
        try {
            const result = await client.query(`SELECT COUNT(*) FROM ${this.schemaName}.${this.tableName}`);
            return parseInt(result.rows[0].count);
        } catch (error) {
            console.error(`[PGVECTOR] Failed to get document count: ${error}`);
            return 0;
        } finally {
            client.release();
        }
    }

    async deleteDocuments(filter: Record<string, any>): Promise<number> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[PGVECTOR] Deleting documents with filter:`, filter);

        const client = await this.pool.connect();
        
        try {
            let deleteQuery = `DELETE FROM ${this.schemaName}.${this.tableName}`;
            const queryParams: any[] = [];
            const conditions: string[] = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(filter)) {
                if (key === 'id' || key === 'doc_id') {
                    conditions.push(`doc_id = $${paramIndex}`);
                    queryParams.push(value);
                    paramIndex++;
                } else if (key === 'source') {
                    conditions.push(`source = $${paramIndex}`);
                    queryParams.push(value);
                    paramIndex++;
                } else {
                    // Metadata filter
                    conditions.push(`metadata ->> $${paramIndex} = $${paramIndex + 1}`);
                    queryParams.push(key, String(value));
                    paramIndex += 2;
                }
            }

            if (conditions.length > 0) {
                deleteQuery += ` WHERE ${conditions.join(' AND ')}`;
            }

            const result = await client.query(deleteQuery, queryParams);
            const deletedCount = result.rowCount || 0;
            
            console.log(`[PGVECTOR] ✅ Deleted ${deletedCount} documents`);
            return deletedCount;
        } catch (error) {
            console.error(`[PGVECTOR] Failed to delete documents: ${error}`);
            throw error;
        } finally {
            client.release();
        }
    }

    async clearCollection(): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[PGVECTOR] Clearing all documents from table "${this.schemaName}.${this.tableName}"...`);

        const client = await this.pool.connect();
        
        try {
            await client.query(`TRUNCATE TABLE ${this.schemaName}.${this.tableName}`);
            console.log(`[PGVECTOR] ✅ Collection cleared successfully`);
        } catch (error) {
            console.error(`[PGVECTOR] Failed to clear collection: ${error}`);
            throw error;
        } finally {
            client.release();
        }
    }

    // PostgreSQL/pgvector specific utility methods
    async getTableInfo(): Promise<any> {
        if (!this.isInitialized) {
            await this.connect();
        }

        const client = await this.pool.connect();
        
        try {
            // Get table information
            const tableInfo = await client.query(`
                SELECT 
                    column_name, 
                    data_type, 
                    is_nullable 
                FROM information_schema.columns 
                WHERE table_schema = $1 AND table_name = $2
                ORDER BY ordinal_position
            `, [this.schemaName, this.tableName]);

            // Get index information
            const indexInfo = await client.query(`
                SELECT 
                    indexname, 
                    indexdef 
                FROM pg_indexes 
                WHERE schemaname = $1 AND tablename = $2
            `, [this.schemaName, this.tableName]);

            // Get table statistics
            const stats = await client.query(`
                SELECT 
                    n_tup_ins as inserts,
                    n_tup_upd as updates,
                    n_tup_del as deletes,
                    n_live_tup as live_tuples
                FROM pg_stat_user_tables 
                WHERE schemaname = $1 AND relname = $2
            `, [this.schemaName, this.tableName]);

            return {
                tableName: this.tableName,
                schema: this.schemaName,
                columns: tableInfo.rows,
                indexes: indexInfo.rows,
                statistics: stats.rows[0] || {},
                config: this.config
            };
        } catch (error) {
            console.error(`[PGVECTOR] Failed to get table info: ${error}`);
            throw error;
        } finally {
            client.release();
        }
    }

    async vacuum(): Promise<void> {
        if (!this.isInitialized) {
            await this.connect();
        }

        console.log(`[PGVECTOR] Running VACUUM ANALYZE on table "${this.schemaName}.${this.tableName}"...`);

        const client = await this.pool.connect();
        
        try {
            await client.query(`VACUUM ANALYZE ${this.schemaName}.${this.tableName}`);
            console.log(`[PGVECTOR] ✅ VACUUM ANALYZE completed`);
        } catch (error) {
            console.error(`[PGVECTOR] VACUUM failed: ${error}`);
            throw error;
        } finally {
            client.release();
        }
    }
}