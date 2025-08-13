/**
 * Simple mutex implementation for preventing race conditions
 */
export class Mutex {
    private _locked: boolean = false;
    private _waiting: Array<() => void> = [];

    async acquire(): Promise<void> {
        return new Promise<void>((resolve) => {
            if (!this._locked) {
                this._locked = true;
                resolve();
            } else {
                this._waiting.push(resolve);
            }
        });
    }

    release(): void {
        if (!this._locked) {
            throw new Error('Cannot release an unlocked mutex');
        }

        this._locked = false;
        
        if (this._waiting.length > 0) {
            const next = this._waiting.shift();
            this._locked = true;
            next!();
        }
    }

    async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }

    get isLocked(): boolean {
        return this._locked;
    }
}

/**
 * Semaphore implementation for limiting concurrent operations
 */
export class Semaphore {
    private permits: number;
    private waiting: Array<() => void> = [];

    constructor(permits: number) {
        if (permits < 1) {
            throw new Error('Semaphore must have at least 1 permit');
        }
        this.permits = permits;
    }

    async acquire(): Promise<void> {
        return new Promise<void>((resolve) => {
            if (this.permits > 0) {
                this.permits--;
                resolve();
            } else {
                this.waiting.push(resolve);
            }
        });
    }

    release(): void {
        this.permits++;
        
        if (this.waiting.length > 0 && this.permits > 0) {
            this.permits--;
            const next = this.waiting.shift();
            next!();
        }
    }

    async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }

    get availablePermits(): number {
        return this.permits;
    }
}

/**
 * Resource pool for managing reusable resources
 */
export class ResourcePool<T> {
    private resources: T[] = [];
    private inUse: Set<T> = new Set();
    private waiting: Array<(resource: T) => void> = [];
    private createResource: () => T;
    private destroyResource?: (resource: T) => void;
    private maxSize: number;

    constructor(
        createResource: () => T,
        destroyResource?: (resource: T) => void,
        initialSize: number = 1,
        maxSize: number = 10
    ) {
        this.createResource = createResource;
        this.destroyResource = destroyResource;
        this.maxSize = maxSize;

        // Pre-populate the pool
        for (let i = 0; i < initialSize; i++) {
            this.resources.push(createResource());
        }
    }

    async acquire(): Promise<T> {
        return new Promise<T>((resolve) => {
            if (this.resources.length > 0) {
                const resource = this.resources.pop()!;
                this.inUse.add(resource);
                resolve(resource);
            } else if (this.inUse.size < this.maxSize) {
                const resource = this.createResource();
                this.inUse.add(resource);
                resolve(resource);
            } else {
                this.waiting.push(resolve);
            }
        });
    }

    release(resource: T): void {
        if (!this.inUse.has(resource)) {
            throw new Error('Resource is not currently in use');
        }

        this.inUse.delete(resource);

        if (this.waiting.length > 0) {
            const next = this.waiting.shift()!;
            this.inUse.add(resource);
            next(resource);
        } else {
            this.resources.push(resource);
        }
    }

    async runWithResource<R>(fn: (resource: T) => Promise<R>): Promise<R> {
        const resource = await this.acquire();
        try {
            return await fn(resource);
        } finally {
            this.release(resource);
        }
    }

    destroy(): void {
        if (this.destroyResource) {
            [...this.resources, ...this.inUse].forEach(resource => {
                this.destroyResource!(resource);
            });
        }
        this.resources = [];
        this.inUse.clear();
        this.waiting = [];
    }

    get totalResources(): number {
        return this.resources.length + this.inUse.size;
    }

    get availableResources(): number {
        return this.resources.length;
    }

    get resourcesInUse(): number {
        return this.inUse.size;
    }
}

/**
 * Task queue with concurrency control
 */
export class ConcurrentTaskQueue {
    private queue: Array<() => Promise<any>> = [];
    private running: Set<Promise<any>> = new Set();
    private maxConcurrency: number;
    private _isProcessing: boolean = false;

    constructor(maxConcurrency: number = 5) {
        this.maxConcurrency = maxConcurrency;
    }

    async add<T>(task: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const wrappedTask = async () => {
                try {
                    const result = await task();
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            };
            
            this.queue.push(wrappedTask);
            this.process();
        });
    }

    private async process(): Promise<void> {
        if (this._isProcessing || this.running.size >= this.maxConcurrency || this.queue.length === 0) {
            return;
        }

        this._isProcessing = true;

        while (this.queue.length > 0 && this.running.size < this.maxConcurrency) {
            const task = this.queue.shift()!;
            const promise = task().finally(() => {
                this.running.delete(promise);
                this.process();
            });
            
            this.running.add(promise);
        }

        this._isProcessing = false;
    }

    async waitForAll(): Promise<void> {
        while (this.queue.length > 0 || this.running.size > 0) {
            if (this.running.size > 0) {
                await Promise.allSettled([...this.running]);
            }
            // Small delay to allow for queue processing
            if (this.queue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
    }

    clear(): void {
        this.queue = [];
    }

    get pendingTasks(): number {
        return this.queue.length;
    }

    get runningTasks(): number {
        return this.running.size;
    }
}

/**
 * Debouncer for rate limiting operations
 */
export class Debouncer {
    private timeouts: Map<string, NodeJS.Timeout> = new Map();

    debounce<T extends any[]>(
        key: string,
        fn: (...args: T) => Promise<void> | void,
        delay: number
    ): (...args: T) => void {
        return (...args: T) => {
            const existingTimeout = this.timeouts.get(key);
            if (existingTimeout) {
                clearTimeout(existingTimeout);
            }

            const timeout = setTimeout(() => {
                this.timeouts.delete(key);
                fn(...args);
            }, delay);

            this.timeouts.set(key, timeout);
        };
    }

    cancel(key: string): boolean {
        const timeout = this.timeouts.get(key);
        if (timeout) {
            clearTimeout(timeout);
            this.timeouts.delete(key);
            return true;
        }
        return false;
    }

    clear(): void {
        this.timeouts.forEach(timeout => clearTimeout(timeout));
        this.timeouts.clear();
    }
}