/**
 * Connection pooling utilities for database connections
 */

export interface PoolOptions {
    minSize?: number;
    maxSize?: number;
    acquireTimeoutMs?: number;
    idleTimeoutMs?: number;
    validationIntervalMs?: number;
    retryAttempts?: number;
}

export interface PooledConnection<T> {
    connection: T;
    id: string;
    createdAt: number;
    lastUsedAt: number;
    inUse: boolean;
}

export interface ConnectionFactory<T> {
    create(): Promise<T>;
    destroy(connection: T): Promise<void>;
    validate?(connection: T): Promise<boolean>;
}

/**
 * Generic connection pool implementation
 */
export class ConnectionPool<T> {
    private pool: PooledConnection<T>[] = [];
    private waitQueue: Array<(connection: T) => void> = [];
    private readonly minSize: number;
    private readonly maxSize: number;
    private readonly acquireTimeoutMs: number;
    private readonly idleTimeoutMs: number;
    private readonly validationIntervalMs: number;
    private readonly retryAttempts: number;
    private readonly factory: ConnectionFactory<T>;
    private validationTimer?: NodeJS.Timeout;
    private idleTimer?: NodeJS.Timeout;
    private isDestroyed = false;
    private stats = {
        created: 0,
        destroyed: 0,
        acquired: 0,
        released: 0,
        timeouts: 0,
        errors: 0
    };

    constructor(factory: ConnectionFactory<T>, options: PoolOptions = {}) {
        this.factory = factory;
        this.minSize = options.minSize || 2;
        this.maxSize = options.maxSize || 10;
        this.acquireTimeoutMs = options.acquireTimeoutMs || 30000;
        this.idleTimeoutMs = options.idleTimeoutMs || 300000; // 5 minutes
        this.validationIntervalMs = options.validationIntervalMs || 60000; // 1 minute
        this.retryAttempts = options.retryAttempts || 3;

        // Initialize pool with minimum connections
        this.initialize();
    }

    /**
     * Initialize pool with minimum connections
     */
    private async initialize(): Promise<void> {
        const promises: Promise<void>[] = [];
        
        for (let i = 0; i < this.minSize; i++) {
            promises.push(this.createConnection());
        }

        await Promise.allSettled(promises);

        // Start maintenance timers
        this.startMaintenanceTimers();
    }

    /**
     * Create a new connection
     */
    private async createConnection(): Promise<void> {
        if (this.isDestroyed) return;

        try {
            const connection = await this.factory.create();
            const pooledConnection: PooledConnection<T> = {
                connection,
                id: this.generateId(),
                createdAt: Date.now(),
                lastUsedAt: Date.now(),
                inUse: false
            };

            this.pool.push(pooledConnection);
            this.stats.created++;
        } catch (error) {
            this.stats.errors++;
            console.error('Failed to create connection:', error);
            throw error;
        }
    }

    /**
     * Acquire a connection from the pool
     */
    async acquire(): Promise<T> {
        if (this.isDestroyed) {
            throw new Error('Connection pool has been destroyed');
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.stats.timeouts++;
                reject(new Error(`Connection acquisition timeout after ${this.acquireTimeoutMs}ms`));
            }, this.acquireTimeoutMs);

            const tryAcquire = async () => {
                // Find available connection
                const available = this.pool.find(conn => !conn.inUse);

                if (available) {
                    // Validate connection before returning
                    if (this.factory.validate) {
                        const isValid = await this.factory.validate(available.connection);
                        if (!isValid) {
                            await this.destroyConnection(available);
                            await this.createConnection();
                            tryAcquire();
                            return;
                        }
                    }

                    available.inUse = true;
                    available.lastUsedAt = Date.now();
                    this.stats.acquired++;
                    clearTimeout(timeoutId);
                    resolve(available.connection);
                } else if (this.pool.length < this.maxSize) {
                    // Create new connection if pool not at max
                    await this.createConnection();
                    tryAcquire();
                } else {
                    // Add to wait queue
                    this.waitQueue.push((connection) => {
                        clearTimeout(timeoutId);
                        resolve(connection);
                    });
                }
            };

            tryAcquire().catch(error => {
                clearTimeout(timeoutId);
                reject(error);
            });
        });
    }

    /**
     * Release a connection back to the pool
     */
    release(connection: T): void {
        const pooledConnection = this.pool.find(conn => conn.connection === connection);
        
        if (!pooledConnection) {
            console.warn('Attempted to release unknown connection');
            return;
        }

        pooledConnection.inUse = false;
        pooledConnection.lastUsedAt = Date.now();
        this.stats.released++;

        // Process wait queue
        if (this.waitQueue.length > 0) {
            const waiter = this.waitQueue.shift();
            if (waiter) {
                pooledConnection.inUse = true;
                pooledConnection.lastUsedAt = Date.now();
                this.stats.acquired++;
                waiter(connection);
            }
        }
    }

    /**
     * Execute operation with automatic connection management
     */
    async execute<R>(operation: (connection: T) => Promise<R>): Promise<R> {
        let connection: T | null = null;
        let attempts = 0;
        let lastError: any;

        while (attempts < this.retryAttempts) {
            try {
                connection = await this.acquire();
                const result = await operation(connection);
                this.release(connection);
                return result;
            } catch (error) {
                lastError = error;
                attempts++;
                
                if (connection) {
                    // Check if connection is still valid
                    if (this.factory.validate) {
                        const isValid = await this.factory.validate(connection);
                        if (!isValid) {
                            const pooledConnection = this.pool.find(conn => conn.connection === connection);
                            if (pooledConnection) {
                                await this.destroyConnection(pooledConnection);
                            }
                        } else {
                            this.release(connection);
                        }
                    } else {
                        this.release(connection);
                    }
                    connection = null;
                }

                if (attempts < this.retryAttempts) {
                    await this.delay(Math.pow(2, attempts) * 1000); // Exponential backoff
                }
            }
        }

        throw lastError;
    }

    /**
     * Destroy a connection
     */
    private async destroyConnection(pooledConnection: PooledConnection<T>): Promise<void> {
        const index = this.pool.indexOf(pooledConnection);
        if (index > -1) {
            this.pool.splice(index, 1);
        }

        try {
            await this.factory.destroy(pooledConnection.connection);
            this.stats.destroyed++;
        } catch (error) {
            console.error('Failed to destroy connection:', error);
            this.stats.errors++;
        }
    }

    /**
     * Validate all connections
     */
    private async validateConnections(): Promise<void> {
        if (!this.factory.validate || this.isDestroyed) return;

        const validationPromises = this.pool
            .filter(conn => !conn.inUse)
            .map(async (conn) => {
                try {
                    const isValid = await this.factory.validate!(conn.connection);
                    if (!isValid) {
                        await this.destroyConnection(conn);
                        await this.createConnection();
                    }
                } catch (error) {
                    console.error('Connection validation error:', error);
                    await this.destroyConnection(conn);
                    await this.createConnection();
                }
            });

        await Promise.allSettled(validationPromises);
    }

    /**
     * Remove idle connections
     */
    private async removeIdleConnections(): Promise<void> {
        if (this.isDestroyed) return;

        const now = Date.now();
        const idleConnections = this.pool.filter(conn => 
            !conn.inUse &&
            now - conn.lastUsedAt > this.idleTimeoutMs &&
            this.pool.length > this.minSize
        );

        for (const conn of idleConnections) {
            await this.destroyConnection(conn);
        }

        // Ensure minimum pool size
        while (this.pool.length < this.minSize && !this.isDestroyed) {
            await this.createConnection();
        }
    }

    /**
     * Start maintenance timers
     */
    private startMaintenanceTimers(): void {
        // Validation timer
        if (this.factory.validate) {
            this.validationTimer = setInterval(() => {
                this.validateConnections().catch(error => {
                    console.error('Validation timer error:', error);
                });
            }, this.validationIntervalMs);
        }

        // Idle cleanup timer
        this.idleTimer = setInterval(() => {
            this.removeIdleConnections().catch(error => {
                console.error('Idle cleanup timer error:', error);
            });
        }, this.idleTimeoutMs / 2);
    }

    /**
     * Stop maintenance timers
     */
    private stopMaintenanceTimers(): void {
        if (this.validationTimer) {
            clearInterval(this.validationTimer);
            this.validationTimer = undefined;
        }

        if (this.idleTimer) {
            clearInterval(this.idleTimer);
            this.idleTimer = undefined;
        }
    }

    /**
     * Get pool statistics
     */
    getStats() {
        return {
            ...this.stats,
            poolSize: this.pool.length,
            inUse: this.pool.filter(conn => conn.inUse).length,
            available: this.pool.filter(conn => !conn.inUse).length,
            waitQueueLength: this.waitQueue.length
        };
    }

    /**
     * Destroy the pool
     */
    async destroy(): Promise<void> {
        this.isDestroyed = true;
        this.stopMaintenanceTimers();

        // Clear wait queue
        this.waitQueue.forEach(waiter => {
            try {
                waiter(null as any);
            } catch (error) {
                // Ignore
            }
        });
        this.waitQueue = [];

        // Destroy all connections
        const destroyPromises = this.pool.map(conn => this.destroyConnection(conn));
        await Promise.allSettled(destroyPromises);
        
        this.pool = [];
    }

    /**
     * Generate unique ID
     */
    private generateId(): string {
        return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Delay helper
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Database connection pool manager
 */
export class DatabasePoolManager {
    private pools = new Map<string, ConnectionPool<any>>();

    /**
     * Create or get a connection pool
     */
    getPool<T>(
        name: string,
        factory: ConnectionFactory<T>,
        options?: PoolOptions
    ): ConnectionPool<T> {
        if (!this.pools.has(name)) {
            const pool = new ConnectionPool<T>(factory, options);
            this.pools.set(name, pool);
        }

        return this.pools.get(name) as ConnectionPool<T>;
    }

    /**
     * Remove a pool
     */
    async removePool(name: string): Promise<void> {
        const pool = this.pools.get(name);
        if (pool) {
            await pool.destroy();
            this.pools.delete(name);
        }
    }

    /**
     * Get all pool statistics
     */
    getAllStats() {
        const stats: Record<string, any> = {};
        
        for (const [name, pool] of this.pools.entries()) {
            stats[name] = pool.getStats();
        }

        return stats;
    }

    /**
     * Destroy all pools
     */
    async destroyAll(): Promise<void> {
        const destroyPromises = Array.from(this.pools.values()).map(pool => pool.destroy());
        await Promise.allSettled(destroyPromises);
        this.pools.clear();
    }
}