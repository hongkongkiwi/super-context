/**
 * Simple authentication and authorization for MCP server
 * Designed for local/self-hosted deployments, not enterprise SSO
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface AuthConfig {
    enabled?: boolean;
    requireAuth?: boolean;
    sessionTimeout?: number; // minutes
    maxSessions?: number;
    allowedOrigins?: string[];
}

export interface User {
    id: string;
    username: string;
    passwordHash: string;
    salt: string;
    created: Date;
    lastLogin?: Date;
    permissions: Permission[];
    metadata?: Record<string, any>;
}

export interface Session {
    id: string;
    userId: string;
    created: Date;
    lastActivity: Date;
    expiresAt: Date;
    metadata?: Record<string, any>;
}

export type Permission = 
    | 'read'       // Can search and view content
    | 'index'      // Can index new content  
    | 'admin'      // Can manage users and settings
    | 'delete';    // Can delete indexes and content

export interface AuthResult {
    success: boolean;
    user?: User;
    session?: Session;
    error?: string;
}

/**
 * Lightweight authentication for self-hosted MCP instances
 */
export class AuthManager {
    private static readonly USERS_FILE = path.join(os.homedir(), '.context', '.users.json');
    private static readonly SESSIONS_FILE = path.join(os.homedir(), '.context', '.sessions.json');
    private static readonly DEFAULT_CONFIG: Required<AuthConfig> = {
        enabled: false,
        requireAuth: false,
        sessionTimeout: 480, // 8 hours
        maxSessions: 5,
        allowedOrigins: ['*']
    };

    private static users = new Map<string, User>();
    private static sessions = new Map<string, Session>();
    private static config: Required<AuthConfig> = this.DEFAULT_CONFIG;
    private static initialized = false;

    /**
     * Initialize auth system
     */
    static async init(config: AuthConfig = {}): Promise<void> {
        if (this.initialized) return;

        this.config = { ...this.DEFAULT_CONFIG, ...config };
        
        try {
            await this.loadUsers();
            await this.loadSessions();
            this.cleanExpiredSessions();
            
            this.initialized = true;
            
            if (this.config.enabled) {
                console.log(`🔐 Authentication enabled (${this.users.size} users, ${this.sessions.size} active sessions)`);
            } else {
                console.log('🔓 Authentication disabled - running in open mode');
            }
        } catch (error) {
            console.warn(`⚠️  Auth initialization failed: ${error}`);
            this.initialized = true; // Continue without auth
        }
    }

    /**
     * Create initial admin user (for first-time setup)
     */
    static async createAdminUser(username: string, password: string): Promise<User> {
        await this.init();
        
        if (this.users.size > 0) {
            throw new Error('Admin user already exists. Use createUser() for additional users.');
        }
        
        const user = this.createUser(username, password, ['read', 'index', 'admin', 'delete']);
        await this.saveUsers();
        
        console.log(`✅ Created admin user: ${username}`);
        return user;
    }

    /**
     * Create a new user
     */
    static createUser(username: string, password: string, permissions: Permission[]): User {
        if (this.users.has(username)) {
            throw new Error(`User ${username} already exists`);
        }
        
        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters long');
        }
        
        const salt = crypto.randomBytes(32).toString('hex');
        const passwordHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
        
        const user: User = {
            id: crypto.randomUUID(),
            username,
            passwordHash,
            salt,
            created: new Date(),
            permissions,
        };
        
        this.users.set(username, user);
        return user;
    }

    /**
     * Authenticate user and create session
     */
    static async login(username: string, password: string): Promise<AuthResult> {
        await this.init();
        
        if (!this.config.enabled) {
            // In disabled mode, create a temporary session
            const guestSession: Session = {
                id: 'guest-session',
                userId: 'guest',
                created: new Date(),
                lastActivity: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            };
            
            return {
                success: true,
                session: guestSession
            };
        }
        
        const user = this.users.get(username);
        if (!user) {
            return { success: false, error: 'Invalid username or password' };
        }
        
        // Verify password
        const passwordHash = crypto.pbkdf2Sync(password, user.salt, 100000, 64, 'sha512').toString('hex');
        if (passwordHash !== user.passwordHash) {
            return { success: false, error: 'Invalid username or password' };
        }
        
        // Clean up old sessions for this user
        this.cleanUserSessions(user.id);
        
        // Create new session
        const session: Session = {
            id: crypto.randomUUID(),
            userId: user.id,
            created: new Date(),
            lastActivity: new Date(),
            expiresAt: new Date(Date.now() + this.config.sessionTimeout * 60 * 1000),
        };
        
        this.sessions.set(session.id, session);
        
        // Update user last login
        user.lastLogin = new Date();
        this.users.set(username, user);
        
        await this.saveSessions();
        await this.saveUsers();
        
        console.log(`✅ User logged in: ${username} (session: ${session.id})`);
        
        return {
            success: true,
            user: { ...user, passwordHash: '', salt: '' }, // Don't return password data
            session
        };
    }

    /**
     * Validate session and check permissions
     */
    static validateSession(sessionId: string, requiredPermission?: Permission): AuthResult {
        if (!this.config.enabled) {
            // In disabled mode, always allow
            return { success: true };
        }
        
        if (!sessionId) {
            return { success: false, error: 'No session provided' };
        }
        
        const session = this.sessions.get(sessionId);
        if (!session) {
            return { success: false, error: 'Invalid session' };
        }
        
        // Check if session expired
        if (new Date() > session.expiresAt) {
            this.sessions.delete(sessionId);
            return { success: false, error: 'Session expired' };
        }
        
        // Update last activity
        session.lastActivity = new Date();
        this.sessions.set(sessionId, session);
        
        // Find user
        const user = Array.from(this.users.values()).find(u => u.id === session.userId);
        if (!user) {
            this.sessions.delete(sessionId);
            return { success: false, error: 'User not found' };
        }
        
        // Check permissions
        if (requiredPermission && !user.permissions.includes(requiredPermission)) {
            return { success: false, error: `Permission denied: requires ${requiredPermission}` };
        }
        
        return {
            success: true,
            user: { ...user, passwordHash: '', salt: '' },
            session
        };
    }

    /**
     * Logout and destroy session
     */
    static async logout(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            this.sessions.delete(sessionId);
            await this.saveSessions();
            console.log(`✅ Session logged out: ${sessionId}`);
        }
    }

    /**
     * Check if auth is required for operation
     */
    static isAuthRequired(): boolean {
        return this.config.enabled && this.config.requireAuth;
    }

    /**
     * Get user permissions
     */
    static getUserPermissions(sessionId: string): Permission[] {
        if (!this.config.enabled) {
            return ['read', 'index', 'admin', 'delete']; // All permissions when disabled
        }
        
        const result = this.validateSession(sessionId);
        return result.user?.permissions || [];
    }

    /**
     * List all users (admin only)
     */
    static listUsers(sessionId: string): User[] {
        const result = this.validateSession(sessionId, 'admin');
        if (!result.success) {
            throw new Error(result.error || 'Access denied');
        }
        
        return Array.from(this.users.values()).map(user => ({
            ...user,
            passwordHash: '', // Never return password hashes
            salt: ''
        }));
    }

    /**
     * Delete user (admin only)
     */
    static async deleteUser(sessionId: string, username: string): Promise<boolean> {
        const result = this.validateSession(sessionId, 'admin');
        if (!result.success) {
            throw new Error(result.error || 'Access denied');
        }
        
        const deleted = this.users.delete(username);
        if (deleted) {
            await this.saveUsers();
            console.log(`🗑️  Deleted user: ${username}`);
        }
        
        return deleted;
    }

    // Private helper methods
    private static cleanExpiredSessions(): void {
        const now = new Date();
        let cleaned = 0;
        
        for (const [id, session] of this.sessions.entries()) {
            if (now > session.expiresAt) {
                this.sessions.delete(id);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} expired sessions`);
        }
    }

    private static cleanUserSessions(userId: string): void {
        const userSessions = Array.from(this.sessions.entries())
            .filter(([_, session]) => session.userId === userId);
        
        // Keep only the most recent sessions up to maxSessions limit
        if (userSessions.length >= this.config.maxSessions) {
            userSessions
                .sort(([_, a], [__, b]) => a.lastActivity.getTime() - b.lastActivity.getTime())
                .slice(0, -this.config.maxSessions + 1)
                .forEach(([id]) => this.sessions.delete(id));
        }
    }

    private static async loadUsers(): Promise<void> {
        if (!fs.existsSync(this.USERS_FILE)) return;
        
        try {
            const data = JSON.parse(fs.readFileSync(this.USERS_FILE, 'utf8'));
            for (const [username, userData] of Object.entries(data)) {
                const user = userData as User;
                user.created = new Date(user.created);
                if (user.lastLogin) user.lastLogin = new Date(user.lastLogin);
                
                this.users.set(username, user);
            }
        } catch (error) {
            console.warn(`⚠️  Failed to load users: ${error}`);
        }
    }

    private static async saveUsers(): Promise<void> {
        try {
            const dir = path.dirname(this.USERS_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
            }
            
            const data = Object.fromEntries(this.users);
            fs.writeFileSync(this.USERS_FILE, JSON.stringify(data, null, 2), {
                mode: 0o600,
                encoding: 'utf8'
            });
        } catch (error) {
            console.error(`❌ Failed to save users: ${error}`);
        }
    }

    private static async loadSessions(): Promise<void> {
        if (!fs.existsSync(this.SESSIONS_FILE)) return;
        
        try {
            const data = JSON.parse(fs.readFileSync(this.SESSIONS_FILE, 'utf8'));
            for (const [id, sessionData] of Object.entries(data)) {
                const session = sessionData as Session;
                session.created = new Date(session.created);
                session.lastActivity = new Date(session.lastActivity);
                session.expiresAt = new Date(session.expiresAt);
                
                this.sessions.set(id, session);
            }
        } catch (error) {
            console.warn(`⚠️  Failed to load sessions: ${error}`);
        }
    }

    private static async saveSessions(): Promise<void> {
        try {
            const dir = path.dirname(this.SESSIONS_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
            }
            
            const data = Object.fromEntries(this.sessions);
            fs.writeFileSync(this.SESSIONS_FILE, JSON.stringify(data, null, 2), {
                mode: 0o600,
                encoding: 'utf8'
            });
        } catch (error) {
            console.error(`❌ Failed to save sessions: ${error}`);
        }
    }
}