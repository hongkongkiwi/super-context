/**
 * Simple consumer-level encryption for sensitive code content
 * Enabled by setting ENCRYPTION_KEY environment variable
 * Designed for personal/team use, not enterprise deployments
 */

import * as crypto from 'crypto';

export interface EncryptedContent {
    data: string;
    iv: string;
    tag: string;
    encrypted: true;
}

/**
 * Simple encryption for consumer use - just set ENCRYPTION_KEY env var
 */
export class SimpleEncryption {
    private static encryptionKey: string | null = null;
    private static initialized = false;

    /**
     * Initialize encryption if ENCRYPTION_KEY is provided
     */
    static init(): boolean {
        if (this.initialized) return !!this.encryptionKey;

        const key = process.env.ENCRYPTION_KEY;
        if (key && key.length >= 32) {
            this.encryptionKey = key;
            console.log('🔐 Content encryption enabled');
        } else if (key && key.length < 32) {
            console.warn('⚠️  ENCRYPTION_KEY too short (minimum 32 characters). Encryption disabled.');
        } else {
            console.log('🔓 Content encryption disabled (no ENCRYPTION_KEY)');
        }
        
        this.initialized = true;
        return !!this.encryptionKey;
    }

    /**
     * Check if encryption is enabled
     */
    static isEnabled(): boolean {
        return this.init();
    }

    /**
     * Encrypt content if encryption is enabled
     */
    static encrypt(content: string): string | EncryptedContent {
        if (!this.isEnabled()) return content;

        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey!, iv);
            
            let encrypted = cipher.update(content, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const tag = cipher.getAuthTag().toString('hex');
            
            return {
                data: encrypted,
                iv: iv.toString('hex'),
                tag,
                encrypted: true
            };
        } catch (error) {
            console.warn(`⚠️  Encryption failed, storing as plain text: ${error}`);
            return content;
        }
    }

    /**
     * Decrypt content if it's encrypted
     */
    static decrypt(content: string | EncryptedContent): string {
        if (!this.isEncrypted(content)) return content as string;
        if (!this.isEnabled()) {
            throw new Error('Cannot decrypt: ENCRYPTION_KEY not provided');
        }

        try {
            const encrypted = content as EncryptedContent;
            const iv = Buffer.from(encrypted.iv, 'hex');
            const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey!, iv);
            decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
            
            let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error(`Decryption failed: ${error}`);
        }
    }

    /**
     * Check if content should be encrypted (basic heuristics)
     */
    static shouldEncrypt(content: string, filePath?: string): boolean {
        if (!this.isEnabled()) return false;

        // Check file path for sensitive indicators
        if (filePath) {
            const path = filePath.toLowerCase();
            const sensitiveFiles = [
                '.env', '.secret', '.key', '.pem', '.p12', '.pfx',
                'secret', 'private', 'credential', 'token', 'auth'
            ];
            
            if (sensitiveFiles.some(indicator => path.includes(indicator))) {
                return true;
            }
        }

        // Check content for sensitive patterns
        const sensitivePatterns = [
            /api[_-]?key\s*[=:]/i,
            /secret[_-]?key\s*[=:]/i, 
            /password\s*[=:]/i,
            /token\s*[=:]/i,
            /connection[_-]?string/i,
            /private[_-]?key/i,
            /@private\b/i,
            /@internal\b/i,
            /\bconfidential\b/i,
            /\bproprietary\b/i
        ];

        return sensitivePatterns.some(pattern => pattern.test(content));
    }

    /**
     * Process content for storage (encrypt if needed)
     */
    static processForStorage(content: string, filePath?: string): string | EncryptedContent {
        if (this.shouldEncrypt(content, filePath)) {
            return this.encrypt(content);
        }
        return content;
    }

    /**
     * Process content for search (decrypt if needed)  
     */
    static processForSearch(content: string | EncryptedContent): string {
        return this.decrypt(content);
    }

    /**
     * Type guard to check if content is encrypted
     */
    static isEncrypted(content: any): content is EncryptedContent {
        return content && 
               typeof content === 'object' && 
               content.encrypted === true &&
               typeof content.data === 'string' &&
               typeof content.iv === 'string' &&
               typeof content.tag === 'string';
    }

    /**
     * Safe content logging (doesn't log sensitive content)
     */
    static safeLog(content: string | EncryptedContent, maxLength: number = 100): string {
        if (this.isEncrypted(content)) {
            return `[ENCRYPTED ${content.data.length} chars]`;
        }
        
        const str = content as string;
        if (this.shouldEncrypt(str)) {
            return `[SENSITIVE ${str.length} chars]`;
        }
        
        return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    }
}

// No auto-initialization - encryption is completely optional
// Call SimpleEncryption.init() explicitly if you want to use encryption