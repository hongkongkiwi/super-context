/**
 * Content encryption for sensitive code and proprietary information
 * Only encrypts what actually needs protection - the user's sensitive code content
 */

import * as crypto from 'crypto';
import { SecurityUtils } from './security';

export interface EncryptionOptions {
    algorithm?: string;
    keySize?: number;
    ivSize?: number;
}

export interface EncryptedContent {
    data: string;
    iv: string;
    tag?: string;
    encrypted: true; // Type guard
}

export interface SensitivityConfig {
    encryptByDefault?: boolean;
    sensitivePatterns?: RegExp[];
    exemptPatterns?: RegExp[];
    encryptedExtensions?: string[];
    publicExtensions?: string[];
}

/**
 * Smart content encryption that only encrypts sensitive code
 */
export class ContentEncryption {
    private static readonly DEFAULT_OPTIONS: Required<EncryptionOptions> = {
        algorithm: 'aes-256-gcm',
        keySize: 32,
        ivSize: 16
    };

    // Patterns that indicate sensitive content
    private static readonly SENSITIVE_PATTERNS = [
        // API keys and secrets in code
        /api[_-]?key\s*[=:]\s*['"]\w+['"]/i,
        /secret[_-]?key\s*[=:]\s*['"]\w+['"]/i,
        /password\s*[=:]\s*['"]\w+['"]/i,
        /token\s*[=:]\s*['"]\w+['"]/i,
        
        // Database connections
        /connection[_-]?string\s*[=:]/i,
        /mongodb:\/\/.*:\w+@/i,
        /postgres:\/\/.*:\w+@/i,
        
        // Private/internal markers
        /@private/i,
        /@internal/i,
        /\/\*\s*CONFIDENTIAL/i,
        /\/\*\s*PROPRIETARY/i,
        
        // Business logic patterns
        /class.*Strategy/i,
        /class.*Algorithm/i,
        /function.*Calculate.*Price/i,
        /function.*Validate.*License/i,
    ];

    // File extensions that typically contain sensitive business logic
    private static readonly SENSITIVE_EXTENSIONS = [
        '.env', '.secret', '.key', '.pem', '.p12', '.pfx',
        // Business logic files (configurable per project)
        '.business.ts', '.strategy.ts', '.algorithm.ts',
        '.pricing.ts', '.license.ts', '.auth.ts'
    ];

    /**
     * Determine if content should be encrypted
     */
    static shouldEncryptContent(
        content: string, 
        filePath: string, 
        config?: SensitivityConfig
    ): boolean {
        // If explicitly configured
        if (config?.encryptByDefault) return true;
        
        // Check if file extension is in exempt list
        if (config?.publicExtensions) {
            const ext = this.getFileExtension(filePath);
            if (config.publicExtensions.includes(ext)) return false;
        }
        
        // Check if file extension requires encryption
        if (config?.encryptedExtensions) {
            const ext = this.getFileExtension(filePath);
            if (config.encryptedExtensions.includes(ext)) return true;
        }
        
        // Check default sensitive extensions
        const ext = this.getFileExtension(filePath);
        if (this.SENSITIVE_EXTENSIONS.includes(ext)) return true;
        
        // Check for sensitive patterns in content
        const patterns = [...this.SENSITIVE_PATTERNS, ...(config?.sensitivePatterns || [])];
        
        for (const pattern of patterns) {
            if (pattern.test(content)) {
                console.log(`🔐 Detected sensitive content in ${filePath}: ${pattern.source}`);
                return true;
            }
        }
        
        // Check for exempt patterns that override sensitivity
        if (config?.exemptPatterns) {
            for (const pattern of config.exemptPatterns) {
                if (pattern.test(content)) {
                    return false;
                }
            }
        }
        
        return false;
    }

    /**
     * Encrypt sensitive content
     */
    static encryptContent(
        content: string, 
        projectKey: string, 
        options: EncryptionOptions = {}
    ): EncryptedContent {
        const opts = { ...this.DEFAULT_OPTIONS, ...options };
        
        try {
            // Generate random IV
            const iv = crypto.randomBytes(opts.ivSize);
            
            // Derive key from project key
            const key = crypto.pbkdf2Sync(projectKey, 'claude-context-salt', 10000, opts.keySize, 'sha256');
            
            // Create cipher
            const cipher = crypto.createCipheriv(opts.algorithm, key, iv);
            
            // Encrypt
            let encrypted = cipher.update(content, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // Get auth tag
            const tag = (cipher as any).getAuthTag?.()?.toString('hex');
            
            return {
                data: encrypted,
                iv: iv.toString('hex'),
                tag,
                encrypted: true
            };
        } catch (error) {
            throw new Error(`Content encryption failed: ${error}`);
        }
    }

    /**
     * Decrypt content
     */
    static decryptContent(
        encryptedContent: EncryptedContent, 
        projectKey: string, 
        options: EncryptionOptions = {}
    ): string {
        const opts = { ...this.DEFAULT_OPTIONS, ...options };
        
        try {
            // Derive key
            const key = crypto.pbkdf2Sync(projectKey, 'claude-context-salt', 10000, opts.keySize, 'sha256');
            
            // Create decipher
            const iv = Buffer.from(encryptedContent.iv, 'hex');
            const decipher = crypto.createDecipheriv(opts.algorithm, key, iv);
            
            // Set auth tag if present
            if (encryptedContent.tag) {
                (decipher as any).setAuthTag(Buffer.from(encryptedContent.tag, 'hex'));
            }
            
            // Decrypt
            let decrypted = decipher.update(encryptedContent.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error(`Content decryption failed: ${error}`);
        }
    }

    /**
     * Process content for indexing (encrypt if sensitive)
     */
    static processContentForIndexing(
        content: string,
        filePath: string,
        projectKey: string,
        config?: SensitivityConfig
    ): { content: string | EncryptedContent; isEncrypted: boolean } {
        if (this.shouldEncryptContent(content, filePath, config)) {
            return {
                content: this.encryptContent(content, projectKey),
                isEncrypted: true
            };
        }
        
        return {
            content,
            isEncrypted: false
        };
    }

    /**
     * Prepare content for search (decrypt if needed)
     */
    static prepareContentForSearch(
        content: string | EncryptedContent,
        projectKey: string
    ): string {
        if (this.isEncryptedContent(content)) {
            return this.decryptContent(content, projectKey);
        }
        
        return content as string;
    }

    /**
     * Type guard for encrypted content
     */
    static isEncryptedContent(content: any): content is EncryptedContent {
        return content && typeof content === 'object' && content.encrypted === true;
    }

    /**
     * Generate project-specific encryption key
     */
    static generateProjectKey(projectName: string, userSalt?: string): string {
        const baseSalt = userSalt || 'claude-context-default';
        return crypto.pbkdf2Sync(projectName, baseSalt, 50000, 32, 'sha256').toString('hex');
    }

    /**
     * Sanitize content for logging (remove sensitive parts)
     */
    static sanitizeForLogging(content: string, maxLength: number = 200): string {
        // Remove potential secrets before logging
        let sanitized = SecurityUtils.sanitizeSensitiveData(content, '[REDACTED]');
        
        // Truncate for logging
        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength) + '...';
        }
        
        return sanitized;
    }

    /**
     * Create encryption configuration for different project types
     */
    static createConfigForProject(projectType: 'public' | 'private' | 'enterprise'): SensitivityConfig {
        switch (projectType) {
            case 'public':
                return {
                    encryptByDefault: false,
                    publicExtensions: ['.md', '.txt', '.json', '.xml', '.html', '.css'],
                    // Only encrypt obviously sensitive files
                    encryptedExtensions: ['.env', '.secret', '.key']
                };
                
            case 'private':
                return {
                    encryptByDefault: false,
                    exemptPatterns: [
                        /\/\*\s*PUBLIC/i,
                        /\/\/\s*PUBLIC/i
                    ],
                    // Encrypt business logic and config files
                    encryptedExtensions: [
                        '.env', '.secret', '.key', 
                        '.business.ts', '.strategy.ts', 
                        '.config.ts', '.auth.ts'
                    ]
                };
                
            case 'enterprise':
                return {
                    encryptByDefault: true, // Encrypt everything by default
                    exemptPatterns: [
                        /\/\*\s*PUBLIC/i,
                        /\/\/\s*PUBLIC/i,
                        /\/\*\s*SAFE/i
                    ],
                    publicExtensions: ['.md'], // Only markdown is public by default
                };
                
            default:
                return {};
        }
    }

    private static getFileExtension(filePath: string): string {
        const parts = filePath.split('.');
        if (parts.length > 2) {
            // Handle compound extensions like .business.ts
            return '.' + parts.slice(-2).join('.');
        }
        return '.' + (parts.pop() || '');
    }
}