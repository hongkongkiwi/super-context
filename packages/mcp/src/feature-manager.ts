/**
 * Optional Feature Manager for Super Context MCP Server
 * All features are disabled by default - opt-in only
 */

import { SimpleEncryption } from "@hongkongkiwi/super-context-core";
import { SimpleMCPAuth } from './simple-auth.js';

export interface FeatureConfig {
    // Security features (all optional)
    encryption?: {
        enabled: boolean;
        key?: string;
        minKeyLength?: number;
    };
    authentication?: {
        enabled: boolean;
        token?: string;
        minTokenLength?: number;
    };
    // Transport features (all optional)
    transport?: {
        type: 'stdio' | 'http' | 'https' | 'sse';
        port?: number;
        host?: string;
        cors?: boolean;
        corsOrigins?: string[];
        rateLimit?: number;
        ssl?: {
            keyPath?: string;
            certPath?: string;
        };
    };
    // Logging features (optional)
    logging?: {
        level: 'silent' | 'error' | 'warn' | 'info' | 'debug';
        security: boolean;
        performance: boolean;
    };
}

/**
 * Feature Manager - handles optional feature initialization
 */
export class FeatureManager {
    private static initialized = false;
    private static config: FeatureConfig = {};
    private static enabledFeatures: string[] = [];

    /**
     * Initialize features based on configuration
     * Only enabled features are initialized
     */
    static initialize(config: Partial<FeatureConfig> = {}): void {
        if (this.initialized) {
            console.warn('FeatureManager already initialized');
            return;
        }

        this.config = this.mergeWithDefaults(config);
        this.enabledFeatures = [];

        // Initialize encryption (optional)
        if (this.config.encryption?.enabled) {
            try {
                const success = SimpleEncryption.init();
                if (success) {
                    this.enabledFeatures.push('encryption');
                    if (this.config.logging?.security) {
                        console.log('✅ Content encryption feature enabled');
                    }
                } else {
                    if (this.config.logging?.level !== 'silent') {
                        console.warn('⚠️  Encryption requested but ENCRYPTION_KEY not valid');
                    }
                }
            } catch (error) {
                if (this.config.logging?.level !== 'silent') {
                    console.warn('⚠️  Failed to initialize encryption:', error);
                }
            }
        }

        // Initialize authentication (optional)
        if (this.config.authentication?.enabled) {
            try {
                const success = SimpleMCPAuth.init();
                if (success) {
                    this.enabledFeatures.push('authentication');
                    if (this.config.logging?.security) {
                        console.log('✅ Authentication feature enabled');
                    }
                } else {
                    if (this.config.logging?.level !== 'silent') {
                        console.warn('⚠️  Authentication requested but ACCESS_TOKEN not valid');
                    }
                }
            } catch (error) {
                if (this.config.logging?.level !== 'silent') {
                    console.warn('⚠️  Failed to initialize authentication:', error);
                }
            }
        }

        this.initialized = true;

        if (this.config.logging?.level === 'info' || this.config.logging?.level === 'debug') {
            this.logFeatureStatus();
        }
    }

    /**
     * Initialize from environment variables (completely optional)
     */
    static initializeFromEnv(): void {
        const config: Partial<FeatureConfig> = {};

        // Check if user wants encryption (opt-in)
        if (process.env.ENABLE_ENCRYPTION === 'true' || process.env.ENCRYPTION_KEY) {
            config.encryption = {
                enabled: true,
                key: process.env.ENCRYPTION_KEY,
            };
        }

        // Check if user wants authentication (opt-in)
        if (process.env.ENABLE_AUTH === 'true' || process.env.ACCESS_TOKEN) {
            config.authentication = {
                enabled: true,
                token: process.env.ACCESS_TOKEN,
            };
        }

        // Transport configuration (defaults to stdio)
        const transport = (process.env.MCP_TRANSPORT || 'stdio') as 'stdio' | 'http' | 'https' | 'sse';
        config.transport = {
            type: transport,
            port: process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : undefined,
            host: process.env.MCP_HOST,
            cors: process.env.MCP_CORS === 'true',
            corsOrigins: process.env.MCP_CORS_ORIGINS?.split(','),
            rateLimit: process.env.MCP_RATE_LIMIT ? parseInt(process.env.MCP_RATE_LIMIT) : undefined,
        };

        if (transport === 'https') {
            config.transport.ssl = {
                keyPath: process.env.MCP_SSL_KEY_PATH,
                certPath: process.env.MCP_SSL_CERT_PATH,
            };
        }

        // Logging configuration (defaults to minimal)
        const logLevel = (process.env.LOG_LEVEL || 'warn') as 'silent' | 'error' | 'warn' | 'info' | 'debug';
        config.logging = {
            level: logLevel,
            security: process.env.LOG_SECURITY === 'true',
            performance: process.env.LOG_PERFORMANCE === 'true',
        };

        this.initialize(config);
    }

    /**
     * Get current feature configuration
     */
    static getConfig(): FeatureConfig {
        return { ...this.config };
    }

    /**
     * Check if a feature is enabled
     */
    static isFeatureEnabled(feature: string): boolean {
        return this.enabledFeatures.includes(feature);
    }

    /**
     * Get list of enabled features
     */
    static getEnabledFeatures(): string[] {
        return [...this.enabledFeatures];
    }

    /**
     * Get feature status for display
     */
    static getFeatureStatus(): Record<string, boolean> {
        return {
            encryption: this.isFeatureEnabled('encryption'),
            authentication: this.isFeatureEnabled('authentication'),
            corsEnabled: this.config.transport?.cors || false,
            rateLimitEnabled: (this.config.transport?.rateLimit || 0) > 0,
            sslEnabled: this.config.transport?.type === 'https',
        };
    }

    /**
     * Reset feature manager (mainly for testing)
     */
    static reset(): void {
        this.initialized = false;
        this.config = {};
        this.enabledFeatures = [];
    }

    /**
     * Merge user config with sensible defaults
     */
    private static mergeWithDefaults(userConfig: Partial<FeatureConfig>): FeatureConfig {
        return {
            encryption: {
                enabled: false,
                minKeyLength: 32,
                ...userConfig.encryption,
            },
            authentication: {
                enabled: false,
                minTokenLength: 16,
                ...userConfig.authentication,
            },
            transport: {
                type: 'stdio',
                host: 'localhost',
                cors: false,
                rateLimit: 0, // No rate limiting by default
                ...userConfig.transport,
            },
            logging: {
                level: 'warn', // Minimal logging by default
                security: false,
                performance: false,
                ...userConfig.logging,
            },
        };
    }

    /**
     * Log current feature status (for debugging)
     */
    private static logFeatureStatus(): void {
        console.log('🔧 Super Context MCP Server - Feature Status:');
        console.log(`   📡 Transport: ${this.config.transport?.type || 'stdio'}`);
        
        if (this.config.transport?.port) {
            console.log(`   🌐 Port: ${this.config.transport.port}`);
        }
        
        const status = this.getFeatureStatus();
        console.log(`   🔐 Encryption: ${status.encryption ? '✅ Enabled' : '❌ Disabled'}`);
        console.log(`   🔑 Authentication: ${status.authentication ? '✅ Enabled' : '❌ Disabled'}`);
        console.log(`   🌍 CORS: ${status.corsEnabled ? '✅ Enabled' : '❌ Disabled'}`);
        console.log(`   ⏱️  Rate Limiting: ${status.rateLimitEnabled ? `✅ ${this.config.transport?.rateLimit}/min` : '❌ Disabled'}`);
        console.log(`   🔒 SSL: ${status.sslEnabled ? '✅ Enabled' : '❌ Disabled'}`);
        
        if (this.enabledFeatures.length === 0) {
            console.log('   ℹ️  Running with default configuration (no optional features enabled)');
        } else {
            console.log(`   ✨ Optional features enabled: ${this.enabledFeatures.join(', ')}`);
        }
    }

    /**
     * Validate configuration before initialization
     */
    static validateConfig(config: Partial<FeatureConfig>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Validate encryption config
        if (config.encryption?.enabled) {
            const key = config.encryption.key || process.env.ENCRYPTION_KEY;
            const minLength = config.encryption.minKeyLength || 32;
            
            if (!key) {
                errors.push('Encryption enabled but no ENCRYPTION_KEY provided');
            } else if (key.length < minLength) {
                errors.push(`Encryption key too short (${key.length} < ${minLength} characters)`);
            }
        }

        // Validate authentication config
        if (config.authentication?.enabled) {
            const token = config.authentication.token || process.env.ACCESS_TOKEN;
            const minLength = config.authentication.minTokenLength || 16;
            
            if (!token) {
                errors.push('Authentication enabled but no ACCESS_TOKEN provided');
            } else if (token.length < minLength) {
                errors.push(`Access token too short (${token.length} < ${minLength} characters)`);
            }
        }

        // Validate transport config
        if (config.transport?.type === 'https') {
            if (!config.transport.ssl?.keyPath && !process.env.MCP_SSL_KEY_PATH) {
                errors.push('HTTPS transport requires SSL key path');
            }
            if (!config.transport.ssl?.certPath && !process.env.MCP_SSL_CERT_PATH) {
                errors.push('HTTPS transport requires SSL certificate path');
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }
}