/**
 * Secure environment variable management with practical API key handling
 * 
 * Since API keys must be passed as env vars, we focus on:
 * 1. Secure storage of user-managed credentials  
 * 2. Runtime protection and sanitization
 * 3. Credential rotation and validation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { EncryptionUtils, EncryptedData } from './encryption';
import { SecurityUtils } from './security';

export interface SecureCredential {
    name: string;
    value: EncryptedData;
    created: Date;
    lastUsed?: Date;
    rotationInterval?: number; // Days
    metadata?: Record<string, any>;
}

export interface CredentialPolicy {
    requireRotation?: boolean;
    rotationDays?: number;
    requireValidation?: boolean;
    allowedPatterns?: RegExp[];
    forbiddenPatterns?: RegExp[];
}

/**
 * Secure credential management for user-stored API keys
 * Env vars are handled separately for runtime security
 */
export class SecureEnvironment {
    private static readonly CREDENTIALS_FILE = path.join(os.homedir(), '.context', '.credentials.enc');
    private static readonly POLICIES_FILE = path.join(os.homedir(), '.context', '.policies.json');
    
    private static credentials = new Map<string, SecureCredential>();
    private static policies = new Map<string, CredentialPolicy>();
    private static initialized = false;

    /**
     * Initialize secure environment (load encrypted credentials)
     */
    static async init(): Promise<void> {
        if (this.initialized) return;
        
        try {
            await this.loadCredentials();
            await this.loadPolicies();
            this.initialized = true;
            console.log('🔐 Secure environment initialized');
        } catch (error) {
            console.warn(`⚠️  Failed to initialize secure environment: ${error}`);
            // Continue without stored credentials
            this.initialized = true;
        }
    }

    /**
     * Store API key securely (encrypted at rest)
     * Use this for user-managed keys, not runtime env vars
     */
    static async storeCredential(
        name: string, 
        value: string, 
        policy?: CredentialPolicy
    ): Promise<void> {
        await this.init();
        
        // Validate credential format
        this.validateCredential(name, value, policy);
        
        // Encrypt and store
        const encrypted = EncryptionUtils.encryptCredentials({ [name]: value });
        
        this.credentials.set(name, {
            name,
            value: encrypted,
            created: new Date(),
            metadata: { source: 'user-stored' }
        });
        
        if (policy) {
            this.policies.set(name, policy);
        }
        
        await this.saveCredentials();
        await this.savePolicies();
        
        console.log(`🔐 Stored encrypted credential: ${name}`);
    }

    /**
     * Retrieve stored credential (decrypt)
     */
    static async getCredential(name: string): Promise<string | null> {
        await this.init();
        
        const credential = this.credentials.get(name);
        if (!credential) return null;
        
        try {
            const decrypted = EncryptionUtils.decryptCredentials(credential.value);
            
            // Update last used
            credential.lastUsed = new Date();
            this.credentials.set(name, credential);
            
            // Check if rotation needed
            this.checkRotationNeeded(name, credential);
            
            return decrypted[name] || null;
        } catch (error) {
            console.error(`❌ Failed to decrypt credential ${name}: ${error}`);
            return null;
        }
    }

    /**
     * Get environment variable with security checks
     * This handles runtime API keys passed as env vars
     */
    static getSecureEnvVar(name: string, options: {
        required?: boolean;
        maskInLogs?: boolean;
        validatePattern?: RegExp;
        fallbackToStored?: boolean;
    } = {}): string | undefined {
        // 1. Try environment variable first (runtime API keys)
        let value = process.env[name];
        
        // 2. Fallback to stored credential if enabled
        if (!value && options.fallbackToStored) {
            try {
                // This is synchronous to avoid async issues in constructors
                const storedValue = this.credentials.get(name);
                if (storedValue) {
                    value = EncryptionUtils.decryptCredentials(storedValue.value)[name];
                }
            } catch (error) {
                console.warn(`⚠️  Failed to retrieve stored credential ${name}`);
            }
        }
        
        if (!value) {
            if (options.required) {
                throw new Error(`Required environment variable ${name} is not set`);
            }
            return undefined;
        }
        
        // 3. Validate pattern if specified
        if (options.validatePattern && !options.validatePattern.test(value)) {
            throw new Error(`Environment variable ${name} does not match required pattern`);
        }
        
        // 4. Check if it contains sensitive data
        const isSensitive = SecurityUtils.containsSensitiveData(name) || (options.maskInLogs || false);
        
        if (isSensitive) {
            console.debug(`🔐 Accessing sensitive environment variable: ${name} (length: ${value.length})`);
        }
        
        // 5. Store usage info for security monitoring
        this.logCredentialAccess(name, isSensitive);
        
        return value;
    }

    /**
     * Sanitize environment for logging/debugging
     */
    static sanitizeEnvironment(): Record<string, string> {
        const env = { ...process.env };
        const sanitized: Record<string, string> = {};
        
        for (const [key, value] of Object.entries(env)) {
            if (SecurityUtils.containsSensitiveData(key)) {
                sanitized[key] = '***REDACTED***';
            } else if (value && value.length > 50 && /^[A-Za-z0-9+/=_-]+$/.test(value)) {
                // Looks like an encoded key/token
                sanitized[key] = `***REDACTED*** (length: ${value.length})`;
            } else {
                sanitized[key] = value || '';
            }
        }
        
        return sanitized;
    }

    /**
     * Rotate stored credential
     */
    static async rotateCredential(name: string, newValue: string): Promise<void> {
        await this.init();
        
        const existing = this.credentials.get(name);
        if (!existing) {
            throw new Error(`Credential ${name} not found`);
        }
        
        // Validate new credential
        const policy = this.policies.get(name);
        this.validateCredential(name, newValue, policy);
        
        // Encrypt and store new value
        const encrypted = EncryptionUtils.encryptCredentials({ [name]: newValue });
        
        this.credentials.set(name, {
            ...existing,
            value: encrypted,
            created: new Date(),
            metadata: { 
                ...existing.metadata,
                rotated: true,
                previousRotation: existing.created
            }
        });
        
        await this.saveCredentials();
        console.log(`🔄 Rotated credential: ${name}`);
    }

    /**
     * List stored credentials (metadata only, not values)
     */
    static async listCredentials(): Promise<Array<{
        name: string;
        created: Date;
        lastUsed?: Date;
        needsRotation: boolean;
    }>> {
        await this.init();
        
        return Array.from(this.credentials.entries()).map(([name, cred]) => ({
            name,
            created: cred.created,
            lastUsed: cred.lastUsed,
            needsRotation: this.isRotationNeeded(name, cred)
        }));
    }

    /**
     * Remove stored credential
     */
    static async removeCredential(name: string): Promise<boolean> {
        await this.init();
        
        const removed = this.credentials.delete(name);
        this.policies.delete(name);
        
        if (removed) {
            await this.saveCredentials();
            await this.savePolicies();
            console.log(`🗑️  Removed credential: ${name}`);
        }
        
        return removed;
    }

    // Private helper methods
    private static validateCredential(name: string, value: string, policy?: CredentialPolicy): void {
        if (!value || value.trim().length === 0) {
            throw new Error(`Credential ${name} cannot be empty`);
        }
        
        if (value.length < 10) {
            throw new Error(`Credential ${name} appears too short to be a valid API key`);
        }
        
        if (policy?.allowedPatterns) {
            const matches = policy.allowedPatterns.some(pattern => pattern.test(value));
            if (!matches) {
                throw new Error(`Credential ${name} does not match allowed patterns`);
            }
        }
        
        if (policy?.forbiddenPatterns) {
            const forbidden = policy.forbiddenPatterns.some(pattern => pattern.test(value));
            if (forbidden) {
                throw new Error(`Credential ${name} matches forbidden patterns`);
            }
        }
    }

    private static async loadCredentials(): Promise<void> {
        if (!fs.existsSync(this.CREDENTIALS_FILE)) return;
        
        try {
            const encrypted = fs.readFileSync(this.CREDENTIALS_FILE, 'utf8');
            const data = JSON.parse(encrypted) as Record<string, SecureCredential>;
            
            for (const [name, cred] of Object.entries(data)) {
                // Convert date strings back to Date objects
                cred.created = new Date(cred.created);
                if (cred.lastUsed) cred.lastUsed = new Date(cred.lastUsed);
                
                this.credentials.set(name, cred);
            }
        } catch (error) {
            console.warn(`⚠️  Failed to load credentials: ${error}`);
        }
    }

    private static async saveCredentials(): Promise<void> {
        try {
            const dir = path.dirname(this.CREDENTIALS_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
            }
            
            const data = Object.fromEntries(this.credentials);
            fs.writeFileSync(this.CREDENTIALS_FILE, JSON.stringify(data, null, 2), {
                mode: 0o600,
                encoding: 'utf8'
            });
        } catch (error) {
            console.error(`❌ Failed to save credentials: ${error}`);
        }
    }

    private static async loadPolicies(): Promise<void> {
        if (!fs.existsSync(this.POLICIES_FILE)) return;
        
        try {
            const data = JSON.parse(fs.readFileSync(this.POLICIES_FILE, 'utf8'));
            for (const [name, policy] of Object.entries(data)) {
                this.policies.set(name, policy as CredentialPolicy);
            }
        } catch (error) {
            console.warn(`⚠️  Failed to load policies: ${error}`);
        }
    }

    private static async savePolicies(): Promise<void> {
        try {
            const dir = path.dirname(this.POLICIES_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
            }
            
            const data = Object.fromEntries(this.policies);
            fs.writeFileSync(this.POLICIES_FILE, JSON.stringify(data, null, 2), {
                mode: 0o600,
                encoding: 'utf8'
            });
        } catch (error) {
            console.error(`❌ Failed to save policies: ${error}`);
        }
    }

    private static checkRotationNeeded(name: string, credential: SecureCredential): void {
        if (this.isRotationNeeded(name, credential)) {
            console.warn(`⚠️  Credential ${name} needs rotation (created: ${credential.created.toDateString()})`);
        }
    }

    private static isRotationNeeded(name: string, credential: SecureCredential): boolean {
        const policy = this.policies.get(name);
        if (!policy?.requireRotation) return false;
        
        const rotationDays = policy.rotationDays || 90;
        const daysSinceCreated = (Date.now() - credential.created.getTime()) / (1000 * 60 * 60 * 24);
        
        return daysSinceCreated > rotationDays;
    }

    private static logCredentialAccess(name: string, isSensitive: boolean): void {
        // Simple access logging - in production you'd want structured logging
        const timestamp = new Date().toISOString();
        const logEntry = `${timestamp} - Accessed ${isSensitive ? 'sensitive' : 'normal'} credential: ${name}`;
        
        // For now just debug log, but you could write to secure audit log
        console.debug(logEntry);
    }
}

// Export default policies for common API keys
export const DEFAULT_CREDENTIAL_POLICIES: Record<string, CredentialPolicy> = {
    'OPENAI_API_KEY': {
        requireRotation: true,
        rotationDays: 90,
        allowedPatterns: [/^sk-[A-Za-z0-9]{48}$/], // OpenAI key format
        requireValidation: true
    },
    'ANTHROPIC_API_KEY': {
        requireRotation: true,
        rotationDays: 90,
        allowedPatterns: [/^sk-ant-api03-[A-Za-z0-9_-]{95}$/], // Anthropic key format
        requireValidation: true
    },
    'VOYAGEAI_API_KEY': {
        requireRotation: true,
        rotationDays: 90,
        requireValidation: true
    },
    'QDRANT_API_KEY': {
        requireRotation: true,
        rotationDays: 30, // Shorter rotation for vector DB
        requireValidation: true
    }
};

// Auto-initialize on module load
SecureEnvironment.init().catch(error => {
    console.warn(`⚠️  Failed to auto-initialize secure environment: ${error}`);
});