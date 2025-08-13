/**
 * Encryption utilities for securing sensitive data at rest and in transit
 */

import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { SecurityUtils } from './security';

export interface EncryptionConfig {
    algorithm?: string;
    keySize?: number;
    ivSize?: number;
    iterations?: number;
    saltSize?: number;
}

export interface EncryptedData {
    data: string;
    iv: string;
    salt: string;
    tag?: string; // For authenticated encryption
}

export interface KeyDerivationOptions {
    password: string;
    salt: Buffer;
    iterations: number;
    keySize: number;
}

/**
 * Secure encryption utility for protecting sensitive data
 */
export class EncryptionUtils {
    private static readonly DEFAULT_CONFIG: Required<EncryptionConfig> = {
        algorithm: 'aes-256-gcm', // Authenticated encryption
        keySize: 32, // 256 bits
        ivSize: 16,  // 128 bits
        iterations: 100000, // PBKDF2 iterations
        saltSize: 32 // 256 bits
    };

    private static readonly MASTER_KEY_FILE = path.join(os.homedir(), '.context', '.master.key');

    /**
     * Encrypt sensitive data using AES-256-GCM
     */
    static encrypt(
        plaintext: string, 
        password: string, 
        config: EncryptionConfig = {}
    ): EncryptedData {
        const cfg = { ...this.DEFAULT_CONFIG, ...config };
        
        // Generate random salt and IV
        const salt = crypto.randomBytes(cfg.saltSize);
        const iv = crypto.randomBytes(cfg.ivSize);
        
        // Derive key from password
        const key = crypto.pbkdf2Sync(password, salt, cfg.iterations, cfg.keySize, 'sha512');
        
        // Create cipher
        const cipher = crypto.createCipheriv(cfg.algorithm, key, iv);
        
        // Encrypt data
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        // Get authentication tag for GCM mode
        const tag = (cipher as any).getAuthTag?.()?.toString('hex') || '';
        
        return {
            data: encrypted,
            iv: iv.toString('hex'),
            salt: salt.toString('hex'),
            tag
        };
    }

    /**
     * Decrypt data encrypted with encrypt()
     */
    static decrypt(
        encryptedData: EncryptedData, 
        password: string, 
        config: EncryptionConfig = {}
    ): string {
        const cfg = { ...this.DEFAULT_CONFIG, ...config };
        
        try {
            // Convert hex strings back to buffers
            const salt = Buffer.from(encryptedData.salt, 'hex');
            const iv = Buffer.from(encryptedData.iv, 'hex');
            
            // Derive key from password
            const key = crypto.pbkdf2Sync(password, salt, cfg.iterations, cfg.keySize, 'sha512');
            
            // Create decipher
            const decipher = crypto.createDecipheriv(cfg.algorithm, key, iv);
            
            // Set auth tag for GCM mode
            if (encryptedData.tag && (decipher as any).setAuthTag) {
                (decipher as any).setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
            }
            
            // Decrypt data
            let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Encrypt API keys and credentials for secure storage
     */
    static encryptCredentials(credentials: Record<string, string>): EncryptedData {
        const masterKey = this.getMasterKey();
        const serialized = JSON.stringify(credentials);
        return this.encrypt(serialized, masterKey);
    }

    /**
     * Decrypt stored credentials
     */
    static decryptCredentials(encryptedData: EncryptedData): Record<string, string> {
        const masterKey = this.getMasterKey();
        const decrypted = this.decrypt(encryptedData, masterKey);
        return JSON.parse(decrypted);
    }

    /**
     * Encrypt code content for sensitive repositories
     */
    static encryptCodeContent(content: string, projectKey: string): EncryptedData {
        // Use project-specific key derivation
        const derivedKey = crypto.pbkdf2Sync(
            projectKey,
            'claude-context-project',
            50000,
            32,
            'sha256'
        ).toString('hex');
        
        return this.encrypt(content, derivedKey);
    }

    /**
     * Decrypt code content
     */
    static decryptCodeContent(encryptedData: EncryptedData, projectKey: string): string {
        const derivedKey = crypto.pbkdf2Sync(
            projectKey,
            'claude-context-project',
            50000,
            32,
            'sha256'
        ).toString('hex');
        
        return this.decrypt(encryptedData, derivedKey);
    }

    /**
     * Generate or retrieve master encryption key
     */
    private static getMasterKey(): string {
        try {
            // Try to read existing master key
            if (fs.existsSync(this.MASTER_KEY_FILE)) {
                const keyData = fs.readFileSync(this.MASTER_KEY_FILE, 'utf8');
                return keyData.trim();
            }
            
            // Generate new master key
            console.log('🔐 Generating new master encryption key...');
            const masterKey = crypto.randomBytes(64).toString('hex');
            
            // Ensure directory exists
            const keyDir = path.dirname(this.MASTER_KEY_FILE);
            if (!fs.existsSync(keyDir)) {
                fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
            }
            
            // Write key with restrictive permissions
            fs.writeFileSync(this.MASTER_KEY_FILE, masterKey, { 
                mode: 0o600, // Read/write for owner only
                encoding: 'utf8' 
            });
            
            console.log(`✅ Master key saved to: ${this.MASTER_KEY_FILE}`);
            return masterKey;
            
        } catch (error) {
            throw new Error(`Failed to access master encryption key: ${error}`);
        }
    }

    /**
     * Securely hash passwords with salt
     */
    static hashPassword(password: string): { hash: string; salt: string } {
        const salt = crypto.randomBytes(32).toString('hex');
        const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
        return { hash, salt };
    }

    /**
     * Verify password against hash
     */
    static verifyPassword(password: string, hash: string, salt: string): boolean {
        const computed = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
        return computed === hash;
    }

    /**
     * Generate secure random tokens
     */
    static generateSecureToken(length: number = 32): string {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Encrypt vector embeddings for sensitive projects
     */
    static encryptEmbedding(embedding: number[], projectKey: string): EncryptedData {
        const serialized = JSON.stringify(embedding);
        return this.encryptCodeContent(serialized, projectKey);
    }

    /**
     * Decrypt vector embeddings
     */
    static decryptEmbedding(encryptedData: EncryptedData, projectKey: string): number[] {
        const decrypted = this.decryptCodeContent(encryptedData, projectKey);
        return JSON.parse(decrypted);
    }

    /**
     * Wipe sensitive data from memory
     */
    static wipeSensitiveString(str: string): void {
        // In JavaScript, we can't directly overwrite memory, but we can at least
        // clear references and suggest garbage collection
        if (str && typeof str === 'string') {
            str = '';
        }
        
        // Force garbage collection if available (Node.js with --expose-gc flag)
        if (global.gc) {
            global.gc();
        }
    }

    /**
     * Generate project-specific encryption key
     */
    static generateProjectKey(projectName: string, userSecret?: string): string {
        const masterKey = this.getMasterKey();
        const combinedSecret = `${masterKey}:${projectName}:${userSecret || ''}`;
        
        return crypto.createHash('sha256')
            .update(combinedSecret)
            .digest('hex');
    }

    /**
     * Create encrypted backup of project data
     */
    static createEncryptedBackup(
        data: any, 
        projectName: string, 
        userSecret?: string
    ): EncryptedData {
        const projectKey = this.generateProjectKey(projectName, userSecret);
        const serialized = JSON.stringify(data);
        return this.encrypt(serialized, projectKey);
    }

    /**
     * Restore data from encrypted backup
     */
    static restoreFromEncryptedBackup(
        encryptedData: EncryptedData, 
        projectName: string, 
        userSecret?: string
    ): any {
        const projectKey = this.generateProjectKey(projectName, userSecret);
        const decrypted = this.decrypt(encryptedData, projectKey);
        return JSON.parse(decrypted);
    }
}