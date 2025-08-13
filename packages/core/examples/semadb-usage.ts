/**
 * Example usage of SemaDB vector database integration
 */

import { SemaDBVectorDatabase, SemaDBConfig } from '../src/vectordb/semadb-vectordb';
import { VectorDocument } from '../src/vectordb/types';

async function example() {
    // Configuration for SemaDB
    const config: SemaDBConfig = {
        // For cloud version via RapidAPI:
        // apiKey: 'your-rapidapi-key',
        
        // For self-hosted version:
        apiUrl: 'http://localhost:8081/v2',
        userId: 'user123',
        userPlan: 'basic',
        
        // Search configuration
        searchSize: 75,
        degreeBound: 64,
        alpha: 1.2,
        distanceMetric: 'cosine'
    };

    // Initialize SemaDB
    const db = new SemaDBVectorDatabase(config);

    // Connect (no-op for HTTP API)
    await db.connect();

    // Create a collection
    const collectionName = 'code_embeddings';
    const dimension = 384; // For example, using all-MiniLM-L6-v2
    
    await db.createCollection(collectionName, dimension, 'Code embeddings collection');

    // Sample documents to insert
    const documents: VectorDocument[] = [
        {
            id: 'doc1',
            vector: new Array(dimension).fill(0).map(() => Math.random()),
            content: 'function hello() { console.log("Hello World"); }',
            source: 'example.js',
            relativePath: './example.js',
            startLine: 1,
            endLine: 3,
            fileExtension: 'js',
            metadata: {
                language: 'javascript',
                framework: 'node'
            }
        },
        {
            id: 'doc2',
            vector: new Array(dimension).fill(0).map(() => Math.random()),
            content: 'class Calculator { add(a, b) { return a + b; } }',
            source: 'calc.js',
            relativePath: './calc.js',
            startLine: 1,
            endLine: 5,
            fileExtension: 'js',
            metadata: {
                language: 'javascript',
                type: 'class'
            }
        }
    ];

    // Insert documents
    await db.insertDocuments(documents);
    console.log('✅ Documents inserted');

    // Search for similar vectors
    const queryVector = new Array(dimension).fill(0).map(() => Math.random());
    const searchResults = await db.search(queryVector, {
        topK: 5,
        filter: { language: 'javascript' }
    });

    console.log('Search Results:');
    searchResults.forEach(result => {
        console.log(`- ${result.document.source}: ${result.document.content.substring(0, 50)}...`);
        console.log(`  Score: ${result.score}`);
    });

    // Hybrid search example
    const hybridResults = await db.hybridSearch({
        vector: queryVector,
        limit: 10,
        filter: { 
            fileExtension: 'js',
            language: 'javascript'
        }
    });

    console.log('\nHybrid Search Results:');
    hybridResults.results.forEach(result => {
        console.log(`- ${result.document.source}: ${result.document.content.substring(0, 50)}...`);
    });

    // Check health
    const health = await db.checkHealth();
    console.log('\nDatabase Health:', {
        status: health.status,
        responseTime: `${health.responseTime}ms`
    });

    // Get metrics
    const metrics = await db.getMetrics();
    console.log('Database Metrics:', {
        avgResponseTime: `${metrics.avgResponseTime}ms`,
        errorRate: `${metrics.errorRate * 100}%`
    });

    // Get document count
    const count = await db.getDocumentCount();
    console.log(`Total documents: ${count}`);

    // Clean up - delete documents by filter
    const deleted = await db.deleteDocuments({ type: 'class' });
    console.log(`Deleted ${deleted} documents`);

    // Clear entire collection
    await db.clearCollection();
    console.log('Collection cleared');

    // List all collections
    const collections = await db.listCollections();
    console.log('Available collections:', collections);

    // Disconnect (no-op for HTTP API)
    await db.disconnect();
}

// Run the example
example().catch(console.error);