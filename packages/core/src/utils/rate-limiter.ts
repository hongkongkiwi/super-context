/**
 * Rate limiter and circuit breaker patterns for resilient API calls
 */

export interface RateLimiterOptions {
    maxRequests: number;
    windowMs: number;
    retryAfterMs?: number;
}

export interface CircuitBreakerOptions {
    failureThreshold: number;
    resetTimeMs: number;
    halfOpenRequests: number;
}

/**
 * Token bucket rate limiter for controlling API request rates
 */
export class RateLimiter {
    private tokens: number;
    private lastRefill: number;
    private readonly maxTokens: number;
    private readonly refillRate: number;
    private readonly windowMs: number;
    private readonly retryAfterMs: number;
    private queue: Array<() => void> = [];

    constructor(options: RateLimiterOptions) {
        this.maxTokens = options.maxRequests;
        this.windowMs = options.windowMs;
        this.refillRate = this.maxTokens / this.windowMs;
        this.retryAfterMs = options.retryAfterMs || 1000;
        this.tokens = this.maxTokens;
        this.lastRefill = Date.now();
    }

    /**
     * Acquire a token for making a request
     * @returns Promise that resolves when token is available
     */
    async acquire(): Promise<void> {
        return new Promise((resolve) => {
            const tryAcquire = () => {
                this.refillTokens();
                
                if (this.tokens >= 1) {
                    this.tokens -= 1;
                    resolve();
                } else {
                    // Add to queue and retry later
                    this.queue.push(() => tryAcquire());
                    setTimeout(() => this.processQueue(), this.retryAfterMs);
                }
            };

            tryAcquire();
        });
    }

    /**
     * Refill tokens based on elapsed time
     */
    private refillTokens(): void {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        const tokensToAdd = (elapsed / 1000) * this.refillRate;
        
        this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
        this.lastRefill = now;
    }

    /**
     * Process waiting requests in queue
     */
    private processQueue(): void {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            if (next) {
                next();
            }
        }
    }

    /**
     * Get current available tokens
     */
    getAvailableTokens(): number {
        this.refillTokens();
        return Math.floor(this.tokens);
    }

    /**
     * Reset rate limiter
     */
    reset(): void {
        this.tokens = this.maxTokens;
        this.lastRefill = Date.now();
        this.queue = [];
    }
}

/**
 * Circuit breaker pattern for handling service failures
 */
export class CircuitBreaker {
    private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    private failures = 0;
    private successCount = 0;
    private lastFailureTime = 0;
    private readonly failureThreshold: number;
    private readonly resetTimeMs: number;
    private readonly halfOpenRequests: number;
    private halfOpenAttempts = 0;

    constructor(options: CircuitBreakerOptions) {
        this.failureThreshold = options.failureThreshold;
        this.resetTimeMs = options.resetTimeMs;
        this.halfOpenRequests = options.halfOpenRequests;
    }

    /**
     * Execute operation with circuit breaker protection
     */
    async execute<T>(operation: () => Promise<T>): Promise<T> {
        // Check if circuit should transition to half-open
        if (this.state === 'OPEN' && this.shouldAttemptReset()) {
            this.state = 'HALF_OPEN';
            this.halfOpenAttempts = 0;
        }

        // Reject if circuit is open
        if (this.state === 'OPEN') {
            throw new Error(`Circuit breaker is OPEN. Service is unavailable. Will retry after ${this.resetTimeMs}ms`);
        }

        // Handle half-open state
        if (this.state === 'HALF_OPEN') {
            if (this.halfOpenAttempts >= this.halfOpenRequests) {
                // Transition back to closed if enough successes
                if (this.successCount >= this.halfOpenRequests) {
                    this.state = 'CLOSED';
                    this.reset();
                } else {
                    // Back to open if still failing
                    this.state = 'OPEN';
                    this.lastFailureTime = Date.now();
                }
            }
            this.halfOpenAttempts++;
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    /**
     * Handle successful operation
     */
    private onSuccess(): void {
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= this.halfOpenRequests) {
                this.state = 'CLOSED';
                this.reset();
            }
        } else if (this.state === 'CLOSED') {
            this.failures = 0;
        }
    }

    /**
     * Handle failed operation
     */
    private onFailure(): void {
        this.failures++;
        this.lastFailureTime = Date.now();

        if (this.state === 'HALF_OPEN') {
            // Immediately open on failure in half-open state
            this.state = 'OPEN';
        } else if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }

    /**
     * Check if enough time has passed to attempt reset
     */
    private shouldAttemptReset(): boolean {
        return Date.now() - this.lastFailureTime >= this.resetTimeMs;
    }

    /**
     * Reset circuit breaker state
     */
    private reset(): void {
        this.failures = 0;
        this.successCount = 0;
        this.halfOpenAttempts = 0;
    }

    /**
     * Get current circuit state
     */
    getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
        return this.state;
    }

    /**
     * Force circuit to open state
     */
    trip(): void {
        this.state = 'OPEN';
        this.lastFailureTime = Date.now();
    }

    /**
     * Force circuit to closed state
     */
    close(): void {
        this.state = 'CLOSED';
        this.reset();
    }
}

/**
 * Retry with exponential backoff
 */
export class RetryWithBackoff {
    private readonly maxRetries: number;
    private readonly initialDelayMs: number;
    private readonly maxDelayMs: number;
    private readonly backoffMultiplier: number;

    constructor(
        maxRetries: number = 3,
        initialDelayMs: number = 1000,
        maxDelayMs: number = 30000,
        backoffMultiplier: number = 2
    ) {
        this.maxRetries = maxRetries;
        this.initialDelayMs = initialDelayMs;
        this.maxDelayMs = maxDelayMs;
        this.backoffMultiplier = backoffMultiplier;
    }

    /**
     * Execute operation with retry logic
     */
    async execute<T>(
        operation: () => Promise<T>,
        shouldRetry?: (error: any) => boolean
    ): Promise<T> {
        let lastError: any;
        let delayMs = this.initialDelayMs;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;

                // Check if we should retry
                if (attempt === this.maxRetries) {
                    break;
                }

                if (shouldRetry && !shouldRetry(error)) {
                    throw error;
                }

                // Wait before next attempt
                await this.delay(delayMs);
                
                // Increase delay for next attempt
                delayMs = Math.min(delayMs * this.backoffMultiplier, this.maxDelayMs);
            }
        }

        throw lastError;
    }

    /**
     * Delay helper
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Composite resilience handler combining rate limiting, circuit breaker, and retry
 */
export class ResilienceHandler {
    private rateLimiter?: RateLimiter;
    private circuitBreaker?: CircuitBreaker;
    private retryHandler?: RetryWithBackoff;

    constructor(
        rateLimiterOptions?: RateLimiterOptions,
        circuitBreakerOptions?: CircuitBreakerOptions,
        retryOptions?: {
            maxRetries?: number;
            initialDelayMs?: number;
            maxDelayMs?: number;
            backoffMultiplier?: number;
        }
    ) {
        if (rateLimiterOptions) {
            this.rateLimiter = new RateLimiter(rateLimiterOptions);
        }
        if (circuitBreakerOptions) {
            this.circuitBreaker = new CircuitBreaker(circuitBreakerOptions);
        }
        if (retryOptions) {
            this.retryHandler = new RetryWithBackoff(
                retryOptions.maxRetries,
                retryOptions.initialDelayMs,
                retryOptions.maxDelayMs,
                retryOptions.backoffMultiplier
            );
        }
    }

    /**
     * Execute operation with all resilience patterns
     */
    async execute<T>(
        operation: () => Promise<T>,
        shouldRetry?: (error: any) => boolean
    ): Promise<T> {
        // Apply rate limiting
        if (this.rateLimiter) {
            await this.rateLimiter.acquire();
        }

        // Wrap with circuit breaker
        const wrappedOperation = async () => {
            if (this.circuitBreaker) {
                return await this.circuitBreaker.execute(operation);
            }
            return await operation();
        };

        // Apply retry logic
        if (this.retryHandler) {
            return await this.retryHandler.execute(wrappedOperation, shouldRetry);
        }

        return await wrappedOperation();
    }

    /**
     * Get current state
     */
    getState() {
        return {
            rateLimiter: this.rateLimiter ? {
                availableTokens: this.rateLimiter.getAvailableTokens()
            } : null,
            circuitBreaker: this.circuitBreaker ? {
                state: this.circuitBreaker.getState()
            } : null
        };
    }
}