/**
 * Simple audit logging for tracking security-relevant events
 * Logs to local files with rotation, suitable for self-hosted deployments
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SecurityUtils } from './security';

export type AuditEventType = 
    | 'auth_login'
    | 'auth_logout' 
    | 'auth_failed'
    | 'index_create'
    | 'index_delete'
    | 'search_query'
    | 'content_access'
    | 'config_change'
    | 'error'
    | 'security_violation';

export interface AuditEvent {
    timestamp: Date;
    type: AuditEventType;
    userId?: string;
    sessionId?: string;
    action: string;
    resource?: string;
    details?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    error?: string;
}

export interface AuditConfig {
    enabled?: boolean;
    logLevel?: 'minimal' | 'standard' | 'detailed';
    maxFileSize?: number; // MB
    maxFiles?: number;
    retentionDays?: number;
    logDirectory?: string;
}

/**
 * Lightweight audit logging for security events
 */
export class AuditLogger {
    private static readonly DEFAULT_CONFIG: Required<AuditConfig> = {
        enabled: true,
        logLevel: 'standard',
        maxFileSize: 10, // 10MB
        maxFiles: 5,
        retentionDays: 90,
        logDirectory: path.join(os.homedir(), '.context', 'logs')
    };

    private static config: Required<AuditConfig> = this.DEFAULT_CONFIG;
    private static currentLogFile: string = '';
    private static initialized = false;

    /**
     * Initialize audit logging
     */
    static init(config: AuditConfig = {}): void {
        if (this.initialized) return;

        this.config = { ...this.DEFAULT_CONFIG, ...config };
        
        if (!this.config.enabled) {
            console.log('📋 Audit logging disabled');
            this.initialized = true;
            return;
        }

        try {
            // Ensure log directory exists
            if (!fs.existsSync(this.config.logDirectory)) {
                fs.mkdirSync(this.config.logDirectory, { recursive: true, mode: 0o750 });
            }

            // Initialize current log file
            this.currentLogFile = this.getCurrentLogFile();
            
            // Clean old logs
            this.cleanOldLogs();
            
            this.initialized = true;
            console.log(`📋 Audit logging enabled: ${this.config.logDirectory}`);
            
            // Log initialization
            this.log({
                type: 'config_change',
                action: 'audit_log_initialized',
                details: { logLevel: this.config.logLevel },
                success: true
            });
        } catch (error) {
            console.warn(`⚠️  Audit log initialization failed: ${error}`);
            this.initialized = true; // Continue without audit logging
        }
    }

    /**
     * Log an audit event
     */
    static log(event: Omit<AuditEvent, 'timestamp'>): void {
        if (!this.config.enabled) return;

        try {
            const auditEvent: AuditEvent = {
                timestamp: new Date(),
                ...event
            };

            // Sanitize sensitive data
            if (auditEvent.details) {
                auditEvent.details = SecurityUtils.sanitizeSensitiveData(auditEvent.details);
            }

            // Format log entry based on level
            const logEntry = this.formatLogEntry(auditEvent);
            
            // Write to file
            this.writeLogEntry(logEntry);
            
            // Also log security violations to console
            if (event.type === 'security_violation' || (event.type === 'auth_failed' && !event.success)) {
                console.warn(`🚨 SECURITY: ${event.action} - ${event.error || 'Failed'}`);
            }
        } catch (error) {
            console.error(`❌ Failed to write audit log: ${error}`);
        }
    }

    /**
     * Log authentication events
     */
    static logAuth(type: 'login' | 'logout' | 'failed', userId?: string, sessionId?: string, details?: Record<string, any>): void {
        this.log({
            type: type === 'failed' ? 'auth_failed' : `auth_${type}` as AuditEventType,
            userId,
            sessionId,
            action: `user_${type}`,
            details,
            success: type !== 'failed'
        });
    }

    /**
     * Log indexing operations
     */
    static logIndexing(action: 'create' | 'delete', resource: string, userId?: string, success: boolean = true, error?: string): void {
        this.log({
            type: action === 'create' ? 'index_create' : 'index_delete',
            userId,
            action: `index_${action}`,
            resource,
            success,
            error
        });
    }

    /**
     * Log search queries
     */
    static logSearch(query: string, userId?: string, resultCount?: number, success: boolean = true): void {
        this.log({
            type: 'search_query',
            userId,
            action: 'search_executed',
            details: {
                queryLength: query.length,
                resultCount,
                // Don't log the actual query content for privacy
                hasContent: query.length > 0
            },
            success
        });
    }

    /**
     * Log content access
     */
    static logContentAccess(resource: string, userId?: string, action: string = 'access'): void {
        this.log({
            type: 'content_access',
            userId,
            action,
            resource,
            success: true
        });
    }

    /**
     * Log security violations
     */
    static logSecurityViolation(violation: string, details?: Record<string, any>, userId?: string): void {
        this.log({
            type: 'security_violation',
            userId,
            action: 'security_violation',
            details: { violation, ...details },
            success: false,
            error: violation
        });
    }

    /**
     * Log errors
     */
    static logError(error: Error | string, action: string, userId?: string): void {
        this.log({
            type: 'error',
            userId,
            action,
            success: false,
            error: error instanceof Error ? error.message : error
        });
    }

    /**
     * Get recent audit events (for admin dashboard)
     */
    static getRecentEvents(limit: number = 100, type?: AuditEventType): AuditEvent[] {
        if (!this.config.enabled) return [];

        try {
            const events: AuditEvent[] = [];
            const logFiles = this.getLogFiles().slice(-3); // Read last 3 files
            
            for (const file of logFiles) {
                const content = fs.readFileSync(path.join(this.config.logDirectory, file), 'utf8');
                const lines = content.trim().split('\n');
                
                for (const line of lines.reverse()) {
                    if (!line.trim()) continue;
                    
                    try {
                        const event = JSON.parse(line) as AuditEvent;
                        event.timestamp = new Date(event.timestamp);
                        
                        if (!type || event.type === type) {
                            events.push(event);
                        }
                        
                        if (events.length >= limit) break;
                    } catch {
                        // Skip invalid JSON lines
                    }
                }
                
                if (events.length >= limit) break;
            }
            
            return events.slice(0, limit);
        } catch (error) {
            console.error(`❌ Failed to read audit events: ${error}`);
            return [];
        }
    }

    /**
     * Get audit statistics
     */
    static getStats(days: number = 30): Record<AuditEventType, number> {
        const events = this.getRecentEvents(10000);
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        
        const stats: Record<string, number> = {};
        
        for (const event of events) {
            if (event.timestamp >= cutoff) {
                stats[event.type] = (stats[event.type] || 0) + 1;
            }
        }
        
        return stats as Record<AuditEventType, number>;
    }

    // Private helper methods
    private static formatLogEntry(event: AuditEvent): string {
        const timestamp = event.timestamp.toISOString();
        
        if (this.config.logLevel === 'minimal') {
            return JSON.stringify({
                ts: timestamp,
                type: event.type,
                action: event.action,
                success: event.success
            });
        } else if (this.config.logLevel === 'standard') {
            return JSON.stringify({
                timestamp,
                type: event.type,
                userId: event.userId,
                action: event.action,
                resource: event.resource,
                success: event.success,
                error: event.error
            });
        } else {
            // detailed
            return JSON.stringify(event);
        }
    }

    private static writeLogEntry(entry: string): void {
        // Check if we need to rotate logs
        if (this.shouldRotateLog()) {
            this.rotateLog();
        }
        
        const logLine = entry + '\n';
        fs.appendFileSync(this.currentLogFile, logLine, { encoding: 'utf8' });
    }

    private static getCurrentLogFile(): string {
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        return path.join(this.config.logDirectory, `audit-${date}.log`);
    }

    private static shouldRotateLog(): boolean {
        if (!fs.existsSync(this.currentLogFile)) return false;
        
        const stats = fs.statSync(this.currentLogFile);
        return stats.size > this.config.maxFileSize * 1024 * 1024;
    }

    private static rotateLog(): void {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFile = this.currentLogFile.replace('.log', `-${timestamp}.log`);
        
        fs.renameSync(this.currentLogFile, rotatedFile);
        this.currentLogFile = this.getCurrentLogFile();
        
        console.log(`📋 Rotated audit log: ${path.basename(rotatedFile)}`);
    }

    private static getLogFiles(): string[] {
        try {
            return fs.readdirSync(this.config.logDirectory)
                .filter(file => file.startsWith('audit-') && file.endsWith('.log'))
                .sort();
        } catch {
            return [];
        }
    }

    private static cleanOldLogs(): void {
        const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
        const logFiles = this.getLogFiles();
        let cleaned = 0;
        
        for (const file of logFiles) {
            const filePath = path.join(this.config.logDirectory, file);
            const stats = fs.statSync(filePath);
            
            if (stats.mtime < cutoffDate) {
                fs.unlinkSync(filePath);
                cleaned++;
            }
        }
        
        // Also clean if we have too many files
        const remainingFiles = this.getLogFiles();
        if (remainingFiles.length > this.config.maxFiles) {
            const toDelete = remainingFiles
                .slice(0, remainingFiles.length - this.config.maxFiles);
                
            for (const file of toDelete) {
                fs.unlinkSync(path.join(this.config.logDirectory, file));
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} old audit log files`);
        }
    }
}