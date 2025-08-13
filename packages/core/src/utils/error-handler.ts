/**
 * Comprehensive error handling and timeout management utilities
 */

export enum ErrorSeverity {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

export enum ErrorCategory {
    NETWORK = 'network',
    AUTHENTICATION = 'authentication',
    AUTHORIZATION = 'authorization', 
    VALIDATION = 'validation',
    RESOURCE = 'resource',
    PARSING = 'parsing',
    FILESYSTEM = 'filesystem',
    DATABASE = 'database',
    TIMEOUT = 'timeout',
    MEMORY = 'memory',
    UNKNOWN = 'unknown'
}

export interface ErrorMetadata {
    category: ErrorCategory;
    severity: ErrorSeverity;
    context?: Record<string, any>;
    timestamp?: string;
    operationId?: string;
    userId?: string;
    retryable?: boolean;
    maxRetries?: number;
}

export class ContextError extends Error {
    public readonly category: ErrorCategory;
    public readonly severity: ErrorSeverity;
    public readonly context?: Record<string, any>;
    public readonly timestamp: string;
    public readonly operationId?: string;
    public readonly userId?: string;
    public readonly retryable: boolean;
    public readonly maxRetries: number;
    public readonly originalError?: Error;

    constructor(message: string, metadata: ErrorMetadata, originalError?: Error) {
        super(message);
        this.name = 'ContextError';
        this.category = metadata.category;
        this.severity = metadata.severity;
        this.context = metadata.context;
        this.timestamp = metadata.timestamp || new Date().toISOString();
        this.operationId = metadata.operationId;
        this.userId = metadata.userId;
        this.retryable = metadata.retryable ?? false;
        this.maxRetries = metadata.maxRetries ?? 0;
        this.originalError = originalError;

        // Maintain proper stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ContextError);
        }
    }

    toJSON(): Record<string, any> {
        return {
            name: this.name,
            message: this.message,
            category: this.category,
            severity: this.severity,
            context: this.context,
            timestamp: this.timestamp,
            operationId: this.operationId,
            userId: this.userId,
            retryable: this.retryable,
            maxRetries: this.maxRetries,
            stack: this.stack,
            originalError: this.originalError ? {
                name: this.originalError.name,
                message: this.originalError.message,
                stack: this.originalError.stack
            } : undefined
        };
    }
}

export interface RetryConfig {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    backoffFactor: number;
    jitter: boolean;
    timeoutMs?: number;
    retryableErrors?: ErrorCategory[];
}

export class ErrorHandler {
    private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffFactor: 2,
        jitter: true,
        timeoutMs: 120000,
        retryableErrors: [ErrorCategory.NETWORK, ErrorCategory.TIMEOUT, ErrorCategory.DATABASE]
    };

    /**
     * Execute an operation with comprehensive error handling and retry logic
     */
    static async withRetry<T>(
        operation: () => Promise<T>,
        operationName: string,
        config: Partial<RetryConfig> = {},
        context?: Record<string, any>
    ): Promise<T> {
        const finalConfig = { ...this.DEFAULT_RETRY_CONFIG, ...config };
        const operationId = this.generateOperationId();
        
        let lastError: Error | undefined;
        let attempt = 0;

        while (attempt <= finalConfig.maxRetries) {
            try {
                // Apply timeout if specified
                if (finalConfig.timeoutMs) {
                    return await this.withTimeout(operation, finalConfig.timeoutMs, operationName);
                } else {
                    return await operation();
                }
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                attempt++;

                // Categorize the error
                const errorCategory = this.categorizeError(lastError);
                const isRetryable = finalConfig.retryableErrors?.includes(errorCategory) ?? false;

                // Create structured error
                const contextError = new ContextError(
                    `Operation '${operationName}' failed on attempt ${attempt}`,
                    {
                        category: errorCategory,
                        severity: attempt > finalConfig.maxRetries ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM,
                        context: { ...context, attempt, maxRetries: finalConfig.maxRetries },
                        operationId,
                        retryable: isRetryable,
                        maxRetries: finalConfig.maxRetries
                    },
                    lastError
                );

                // Log the error with appropriate severity
                this.logError(contextError);

                // Check if we should retry
                if (attempt > finalConfig.maxRetries || !isRetryable) {
                    // Transform to final error with high severity
                    throw new ContextError(
                        `Operation '${operationName}' failed after ${attempt} attempts: ${lastError.message}`,
                        {
                            category: errorCategory,
                            severity: ErrorSeverity.HIGH,
                            context: { ...context, totalAttempts: attempt },
                            operationId,
                            retryable: false
                        },
                        lastError
                    );
                }

                // Calculate delay with exponential backoff and optional jitter
                const delay = this.calculateDelay(attempt, finalConfig);
                console.warn(`⚠️  Retrying operation '${operationName}' in ${delay}ms (attempt ${attempt + 1}/${finalConfig.maxRetries + 1})`);
                
                await this.sleep(delay);
            }
        }

        // This should never be reached, but TypeScript requires it
        throw lastError!;
    }

    /**
     * Execute operation with timeout
     */
    static async withTimeout<T>(
        operation: () => Promise<T>,
        timeoutMs: number,
        operationName: string
    ): Promise<T> {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(new ContextError(
                    `Operation '${operationName}' timed out after ${timeoutMs}ms`,
                    {
                        category: ErrorCategory.TIMEOUT,
                        severity: ErrorSeverity.MEDIUM,
                        retryable: true
                    }
                ));
            }, timeoutMs);
        });

        return Promise.race([operation(), timeoutPromise]);
    }

    /**
     * Categorize error based on error message, type, and properties
     */
    private static categorizeError(error: Error): ErrorCategory {
        const message = error.message.toLowerCase();
        const name = error.name.toLowerCase();

        // Network errors
        if (message.includes('network') || message.includes('connection') || 
            message.includes('fetch') || message.includes('enotfound') ||
            message.includes('econnrefused') || message.includes('timeout')) {
            return ErrorCategory.NETWORK;
        }

        // Authentication/Authorization
        if (message.includes('unauthorized') || message.includes('401') ||
            message.includes('forbidden') || message.includes('403') ||
            message.includes('api key') || message.includes('token')) {
            return ErrorCategory.AUTHENTICATION;
        }

        // Validation errors
        if (message.includes('validation') || message.includes('invalid') ||
            message.includes('required') || message.includes('format') ||
            name.includes('validation') || message.includes('400')) {
            return ErrorCategory.VALIDATION;
        }

        // File system errors
        if (message.includes('enoent') || message.includes('file') ||
            message.includes('directory') || message.includes('path') ||
            message.includes('permission') || message.includes('eacces')) {
            return ErrorCategory.FILESYSTEM;
        }

        // Database/Vector DB errors
        if (message.includes('database') || message.includes('collection') ||
            message.includes('index') || message.includes('vector') ||
            message.includes('milvus') || message.includes('qdrant') ||
            message.includes('pinecone') || message.includes('chroma')) {
            return ErrorCategory.DATABASE;
        }

        // Memory errors
        if (message.includes('memory') || message.includes('heap') ||
            message.includes('out of memory') || message.includes('allocation')) {
            return ErrorCategory.MEMORY;
        }

        // Parsing errors
        if (message.includes('parse') || message.includes('syntax') ||
            message.includes('json') || message.includes('yaml') ||
            name.includes('syntax')) {
            return ErrorCategory.PARSING;
        }

        // Resource errors
        if (message.includes('resource') || message.includes('limit') ||
            message.includes('quota') || message.includes('429')) {
            return ErrorCategory.RESOURCE;
        }

        return ErrorCategory.UNKNOWN;
    }

    /**
     * Calculate delay with exponential backoff and optional jitter
     */
    private static calculateDelay(attempt: number, config: RetryConfig): number {
        let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt - 1);
        delay = Math.min(delay, config.maxDelay);

        if (config.jitter) {
            // Add ±25% jitter to prevent thundering herd
            const jitterRange = delay * 0.25;
            delay += (Math.random() - 0.5) * 2 * jitterRange;
        }

        return Math.max(delay, 100); // Minimum 100ms delay
    }

    /**
     * Sleep for specified milliseconds
     */
    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate unique operation ID for tracking
     */
    private static generateOperationId(): string {
        return `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * Log error with appropriate level based on severity
     */
    private static logError(error: ContextError): void {
        const logData = {
            message: error.message,
            category: error.category,
            severity: error.severity,
            operationId: error.operationId,
            context: error.context,
            timestamp: error.timestamp
        };

        switch (error.severity) {
            case ErrorSeverity.LOW:
                console.debug('🔍 Error (Low):', JSON.stringify(logData, null, 2));
                break;
            case ErrorSeverity.MEDIUM:
                console.warn('⚠️  Error (Medium):', JSON.stringify(logData, null, 2));
                break;
            case ErrorSeverity.HIGH:
                console.error('❌ Error (High):', JSON.stringify(logData, null, 2));
                break;
            case ErrorSeverity.CRITICAL:
                console.error('🚨 CRITICAL ERROR:', JSON.stringify(logData, null, 2));
                break;
        }

        // Also log original error stack if available
        if (error.originalError?.stack) {
            console.error('Original error stack:', error.originalError.stack);
        }
    }

    /**
     * Sanitize sensitive data from context before logging
     */
    static sanitizeContext(context: Record<string, any>): Record<string, any> {
        const sensitiveKeys = [
            'password', 'token', 'key', 'secret', 'credential', 'auth',
            'apiKey', 'api_key', 'accessToken', 'access_token', 'jwt'
        ];

        const sanitized: Record<string, any> = {};

        for (const [key, value] of Object.entries(context)) {
            const lowerKey = key.toLowerCase();
            const isSensitive = sensitiveKeys.some(sensitive => lowerKey.includes(sensitive));

            if (isSensitive) {
                sanitized[key] = '***REDACTED***';
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = this.sanitizeContext(value);
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }
}

/**
 * Decorator for methods that need comprehensive error handling
 */
export function withErrorHandling(
    operationName?: string,
    config?: Partial<RetryConfig>
) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;
        const finalOperationName = operationName || `${target.constructor.name}.${propertyKey}`;

        descriptor.value = async function (...args: any[]) {
            return ErrorHandler.withRetry(
                () => originalMethod.apply(this, args),
                finalOperationName,
                config,
                { class: target.constructor.name, method: propertyKey }
            );
        };

        return descriptor;
    };
}