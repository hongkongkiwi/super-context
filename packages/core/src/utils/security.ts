/**
 * Security utilities for preventing path traversal, credential exposure, and other vulnerabilities
 */

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

export interface SecurePathOptions {
    allowedExtensions?: string[];
    maxDepth?: number;
    allowSymlinks?: boolean;
    allowedDirectories?: string[];
}

export class SecurityError extends Error {
    constructor(message: string, public readonly type: 'path_traversal' | 'invalid_extension' | 'max_depth_exceeded' | 'symlink_blocked' | 'directory_blocked') {
        super(message);
        this.name = 'SecurityError';
    }
}

export class SecurityUtils {
    private static readonly SENSITIVE_PATTERNS = [
        // API Keys and tokens
        /api[_-]?key/i,
        /access[_-]?token/i,
        /bearer[_-]?token/i,
        /auth[_-]?token/i,
        /jwt[_-]?token/i,
        /refresh[_-]?token/i,
        
        // Credentials
        /password/i,
        /passwd/i,
        /secret/i,
        /credential/i,
        /private[_-]?key/i,
        
        // Database connections
        /connection[_-]?string/i,
        /database[_-]?url/i,
        /db[_-]?url/i,
        /mongodb[_-]?uri/i,
        /postgres[_-]?url/i,
        
        // Cloud credentials
        /aws[_-]?access[_-]?key/i,
        /aws[_-]?secret/i,
        /google[_-]?credentials/i,
        /azure[_-]?key/i,
        
        // Third-party services
        /openai[_-]?api[_-]?key/i,
        /anthropic[_-]?api[_-]?key/i,
        /pinecone[_-]?api[_-]?key/i,
        /huggingface[_-]?token/i
    ];

    private static readonly BLOCKED_PATHS = [
        // System directories
        '/etc',
        '/root',
        '/boot',
        '/sys',
        '/proc',
        '/dev',
        
        // Windows system
        'C:\\Windows',
        'C:\\System32',
        'C:\\Program Files',
        
        // Common sensitive dirs
        '/.ssh',
        '/.aws',
        '/.config',
        '/usr/local/etc',
        
        // Relative traversal attempts
        '../',
        '..\\',
        '..\\//',
        '..//../',
        '..../',
        '%2e%2e%2f',
        '%2e%2e\\',
        '..%2f',
        '..%5c'
    ];

    /**
     * Validate and sanitize file path to prevent path traversal attacks
     */
    static validatePath(
        inputPath: string, 
        basePath: string, 
        options: SecurePathOptions = {}
    ): string {
        if (!inputPath || !basePath) {
            throw new SecurityError('Path and base path are required', 'path_traversal');
        }

        // Normalize and resolve paths
        const normalizedInput = path.normalize(inputPath);
        const normalizedBase = path.normalize(path.resolve(basePath));
        
        // Check for blocked path patterns
        for (const blockedPattern of this.BLOCKED_PATHS) {
            if (normalizedInput.toLowerCase().includes(blockedPattern.toLowerCase())) {
                throw new SecurityError(`Path contains blocked pattern: ${blockedPattern}`, 'path_traversal');
            }
        }

        // Resolve the full path
        const resolvedPath = path.resolve(normalizedBase, normalizedInput);
        
        // Ensure the resolved path is within the base directory
        if (!resolvedPath.startsWith(normalizedBase + path.sep) && resolvedPath !== normalizedBase) {
            throw new SecurityError(
                `Path traversal attempt detected: ${inputPath} resolves outside base directory ${basePath}`,
                'path_traversal'
            );
        }

        // Check file extension if specified
        if (options.allowedExtensions && options.allowedExtensions.length > 0) {
            const ext = path.extname(resolvedPath).toLowerCase();
            if (!options.allowedExtensions.map(e => e.toLowerCase()).includes(ext)) {
                throw new SecurityError(
                    `File extension ${ext} not allowed. Allowed: ${options.allowedExtensions.join(', ')}`,
                    'invalid_extension'
                );
            }
        }

        // Check directory depth
        if (options.maxDepth !== undefined) {
            const relativePath = path.relative(normalizedBase, resolvedPath);
            const depth = relativePath.split(path.sep).length - 1;
            if (depth > options.maxDepth) {
                throw new SecurityError(
                    `Path depth ${depth} exceeds maximum allowed depth ${options.maxDepth}`,
                    'max_depth_exceeded'
                );
            }
        }

        // Check for symlinks if not allowed
        if (options.allowSymlinks === false) {
            try {
                const stats = fs.lstatSync(resolvedPath);
                if (stats.isSymbolicLink()) {
                    throw new SecurityError('Symbolic links are not allowed', 'symlink_blocked');
                }
            } catch (error) {
                // File doesn't exist yet, which is fine for validation
                if ((error as any).code !== 'ENOENT') {
                    throw error;
                }
            }
        }

        // Check allowed directories
        if (options.allowedDirectories && options.allowedDirectories.length > 0) {
            const isInAllowedDir = options.allowedDirectories.some(allowedDir => {
                const normalizedAllowed = path.normalize(path.resolve(allowedDir));
                return resolvedPath.startsWith(normalizedAllowed + path.sep) || resolvedPath === normalizedAllowed;
            });

            if (!isInAllowedDir) {
                throw new SecurityError(
                    `Path ${resolvedPath} is not in allowed directories: ${options.allowedDirectories.join(', ')}`,
                    'directory_blocked'
                );
            }
        }

        return resolvedPath;
    }

    /**
     * Sanitize sensitive data from objects, strings, or any value
     */
    static sanitizeSensitiveData(data: any, replacement: string = '***REDACTED***'): any {
        if (data === null || data === undefined) {
            return data;
        }

        if (typeof data === 'string') {
            return this.sanitizeString(data, replacement);
        }

        if (Array.isArray(data)) {
            return data.map(item => this.sanitizeSensitiveData(item, replacement));
        }

        if (typeof data === 'object') {
            const sanitized: any = {};
            for (const [key, value] of Object.entries(data)) {
                // Check if key itself is sensitive
                const isSensitiveKey = this.SENSITIVE_PATTERNS.some(pattern => 
                    pattern.test(key)
                );

                if (isSensitiveKey) {
                    sanitized[key] = replacement;
                } else {
                    sanitized[key] = this.sanitizeSensitiveData(value, replacement);
                }
            }
            return sanitized;
        }

        return data;
    }

    /**
     * Sanitize sensitive patterns from strings
     */
    private static sanitizeString(str: string, replacement: string): string {
        let sanitized = str;

        // Redact common credential patterns
        const credentialPatterns = [
            // API key patterns
            /([a-zA-Z0-9_-]*api[_-]?key[_-]?[=:\s]+)[a-zA-Z0-9+/=_-]{20,}/gi,
            /([a-zA-Z0-9_-]*token[_-]?[=:\s]+)[a-zA-Z0-9+/=_-]{20,}/gi,
            /([a-zA-Z0-9_-]*secret[_-]?[=:\s]+)[a-zA-Z0-9+/=_-]{20,}/gi,
            
            // JWT tokens
            /eyJ[a-zA-Z0-9+/=_-]+\.[a-zA-Z0-9+/=_-]+\.[a-zA-Z0-9+/=_-]+/g,
            
            // Database connection strings
            /(mongodb:\/\/[^:]+:)[^@]+([@])/gi,
            /(postgres:\/\/[^:]+:)[^@]+([@])/gi,
            /(mysql:\/\/[^:]+:)[^@]+([@])/gi,
            
            // Generic password patterns
            /(password[_-]?[=:\s]+)[^\s&;,"']+/gi,
            /(passwd[_-]?[=:\s]+)[^\s&;,"']+/gi,
        ];

        for (const pattern of credentialPatterns) {
            sanitized = sanitized.replace(pattern, (match, prefix, suffix = '') => {
                return prefix + replacement + suffix;
            });
        }

        return sanitized;
    }

    /**
     * Generate secure random string for IDs, tokens, etc.
     */
    static generateSecureId(length: number = 16): string {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Hash sensitive data for secure storage/comparison
     */
    static hashSensitiveData(data: string, salt?: string): { hash: string; salt: string } {
        const finalSalt = salt || crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(data, finalSalt, 10000, 64, 'sha512').toString('hex');
        return { hash, salt: finalSalt };
    }

    /**
     * Verify hashed sensitive data
     */
    static verifySensitiveData(data: string, hash: string, salt: string): boolean {
        const computed = crypto.pbkdf2Sync(data, salt, 10000, 64, 'sha512').toString('hex');
        return computed === hash;
    }

    /**
     * Check if a string contains potentially sensitive information
     */
    static containsSensitiveData(str: string): boolean {
        return this.SENSITIVE_PATTERNS.some(pattern => pattern.test(str));
    }

    /**
     * Validate environment variable access
     */
    static getSecureEnvVar(
        varName: string, 
        options: { required?: boolean; defaultValue?: string; allowEmpty?: boolean } = {}
    ): string | undefined {
        const value = process.env[varName];

        // Log access to sensitive environment variables (without the value)
        if (this.containsSensitiveData(varName)) {
            console.debug(`🔐 Accessing sensitive environment variable: ${varName}`);
        }

        if (value === undefined) {
            if (options.required && options.defaultValue === undefined) {
                throw new Error(`Required environment variable ${varName} is not set`);
            }
            return options.defaultValue;
        }

        if (!options.allowEmpty && value.trim() === '') {
            if (options.required) {
                throw new Error(`Environment variable ${varName} is empty`);
            }
            return options.defaultValue;
        }

        return value;
    }

    /**
     * Safe file reading with path validation
     */
    static async readFileSecurely(
        filePath: string, 
        basePath: string, 
        options: SecurePathOptions & { encoding?: BufferEncoding; maxSize?: number } = {}
    ): Promise<string | Buffer> {
        const safePath = this.validatePath(filePath, basePath, options);

        // Check file size if maxSize is specified
        if (options.maxSize !== undefined) {
            const stats = await fs.promises.stat(safePath);
            if (stats.size > options.maxSize) {
                throw new SecurityError(
                    `File size ${stats.size} exceeds maximum allowed size ${options.maxSize}`,
                    'path_traversal'
                );
            }
        }

        const encoding = options.encoding || 'utf8';
        return await fs.promises.readFile(safePath, encoding);
    }

    /**
     * Safe file writing with path validation
     */
    static async writeFileSecurely(
        filePath: string,
        data: string | Buffer,
        basePath: string,
        options: SecurePathOptions & { encoding?: BufferEncoding; mode?: number } = {}
    ): Promise<void> {
        const safePath = this.validatePath(filePath, basePath, options);
        
        // Ensure directory exists
        const dir = path.dirname(safePath);
        await fs.promises.mkdir(dir, { recursive: true, mode: 0o755 });

        const encoding = options.encoding || 'utf8';
        const mode = options.mode || 0o644;
        
        await fs.promises.writeFile(safePath, data, { encoding, mode });
    }

    /**
     * Check if path exists securely
     */
    static async pathExistsSecurely(
        filePath: string,
        basePath: string,
        options: SecurePathOptions = {}
    ): Promise<boolean> {
        try {
            const safePath = this.validatePath(filePath, basePath, options);
            await fs.promises.access(safePath);
            return true;
        } catch (error) {
            if ((error as any).code === 'ENOENT' || error instanceof SecurityError) {
                return false;
            }
            throw error;
        }
    }
}