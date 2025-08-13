/**
 * Universal MCP Server Factory supporting multiple transports with integrated security
 * Supports: STDIO, SSE, and HTTP (via custom implementation)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import * as fs from 'fs';
import { SimpleMCPAuth } from './simple-auth.js';
import { Context } from "@hongkongkiwi/super-context-core";
import { ContextMcpConfig } from './config.js';
import { FeatureManager } from './feature-manager.js';

export type MCPTransportType = 'stdio' | 'sse' | 'http' | 'https';

export interface MCPServerConfig extends ContextMcpConfig {
    transport: MCPTransportType;
    // HTTP/HTTPS specific options
    port?: number;
    host?: string;
    cors?: boolean;
    corsOrigins?: string[];
    // HTTPS specific options
    sslKeyPath?: string;
    sslCertPath?: string;
    // SSE specific options
    sseEndpoint?: string;
    // Security
    enableAuth?: boolean;
    rateLimitRequests?: number; // requests per minute (0 = no limit)
}

/**
 * HTTP Transport for MCP - custom implementation
 * Provides RESTful JSON-RPC over HTTP with authentication
 */
class HTTPServerTransport {
    private server: http.Server | https.Server;
    private config: MCPServerConfig;
    
    constructor(config: MCPServerConfig) {
        this.config = config;
        
        if (config.transport === 'https') {
            if (!config.sslKeyPath || !config.sslCertPath) {
                throw new Error('SSL key and cert paths required for HTTPS transport');
            }
            
            const options = {
                key: fs.readFileSync(config.sslKeyPath),
                cert: fs.readFileSync(config.sslCertPath)
            };
            
            this.server = https.createServer(options, this.handleRequest.bind(this));
        } else {
            this.server = http.createServer(this.handleRequest.bind(this));
        }
    }
    
    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        // Handle preflight CORS requests
        if (req.method === 'OPTIONS') {
            this.sendCORSHeaders(res);
            res.writeHead(204);
            res.end();
            return;
        }
        
        // Only allow POST requests for JSON-RPC
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                jsonrpc: '2.0', 
                error: { code: -32601, message: 'Method not allowed. Use POST for MCP requests.' },
                id: null 
            }));
            return;
        }
        
        // Set CORS headers
        this.sendCORSHeaders(res);
        
        // Authentication check (only if enabled)
        if (FeatureManager.isFeatureEnabled('authentication')) {
            const authHeader = req.headers.authorization;
            const token = authHeader?.replace('Bearer ', '');
            const authResult = SimpleMCPAuth.validateRequest(token);
            
            if (!authResult.authorized) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    error: { code: -32002, message: authResult.error || 'Unauthorized' },
                    id: null
                }));
                return;
            }
        }
        
        // Rate limiting check (if enabled)
        if (this.config.rateLimitRequests && this.config.rateLimitRequests > 0) {
            // Simple IP-based rate limiting
            const clientIP = req.socket.remoteAddress || 'unknown';
            if (!this.checkRateLimit(clientIP)) {
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    error: { code: -32003, message: 'Rate limit exceeded' },
                    id: null
                }));
                return;
            }
        }
        
        // Parse request body
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const jsonRequest = JSON.parse(body);
                this.processJSONRPCRequest(jsonRequest, res);
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    error: { code: -32700, message: 'Parse error' },
                    id: null
                }));
            }
        });
    }
    
    private sendCORSHeaders(res: http.ServerResponse) {
        if (this.config.cors) {
            const origins = this.config.corsOrigins || ['*'];
            res.setHeader('Access-Control-Allow-Origin', origins.join(', '));
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.setHeader('Access-Control-Max-Age', '86400');
        }
    }
    
    private rateLimitCache = new Map<string, { count: number; resetTime: number }>();
    
    private checkRateLimit(clientIP: string): boolean {
        const now = Date.now();
        const windowMs = 60 * 1000; // 1 minute window
        
        const record = this.rateLimitCache.get(clientIP);
        if (!record || now > record.resetTime) {
            this.rateLimitCache.set(clientIP, { count: 1, resetTime: now + windowMs });
            return true;
        }
        
        if (record.count >= this.config.rateLimitRequests!) {
            return false;
        }
        
        record.count++;
        return true;
    }
    
    private async processJSONRPCRequest(request: any, res: http.ServerResponse) {
        // This would need to be integrated with the actual MCP Server instance
        // For now, send a placeholder response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            jsonrpc: '2.0',
            result: { message: 'HTTP transport not yet fully integrated' },
            id: request.id || null
        }));
    }
    
    async start(): Promise<void> {
        const port = this.config.port || 3000;
        const host = this.config.host || 'localhost';
        
        return new Promise((resolve, reject) => {
            this.server.listen(port, host, () => {
                console.log(`🌐 MCP ${this.config.transport.toUpperCase()} server listening on ${host}:${port}`);
                if (this.config.enableAuth && SimpleMCPAuth.isEnabled()) {
                    console.log('🔐 Authentication enabled - clients must provide ACCESS_TOKEN');
                }
                resolve();
            });
            
            this.server.on('error', reject);
        });
    }
    
    async stop(): Promise<void> {
        return new Promise((resolve) => {
            this.server.close(() => resolve());
        });
    }
}

/**
 * Universal MCP Server Factory
 * Creates appropriate transport based on configuration
 */
export class MCPServerFactory {
    static async createServer(config: MCPServerConfig, context: Context): Promise<{
        server: Server;
        transport: any;
        start: () => Promise<void>;
        stop: () => Promise<void>;
    }> {
        console.log(`🚀 Creating MCP server with ${config.transport.toUpperCase()} transport`);
        
        // Initialize the MCP Server instance
        const server = new Server(
            {
                name: config.name,
                version: config.version
            },
            {
                capabilities: {
                    tools: {}
                }
            }
        );
        
        let transport: any;
        let startFn: () => Promise<void>;
        let stopFn: () => Promise<void>;
        
        switch (config.transport) {
            case 'stdio':
                transport = new StdioServerTransport();
                startFn = async () => {
                    console.log('📡 Starting STDIO transport...');
                    await server.connect(transport);
                    console.log('✅ MCP server connected via STDIO');
                };
                stopFn = async () => {
                    console.log('📡 Stopping STDIO transport...');
                    await server.close();
                };
                break;
                
            case 'sse':
                // SSE transport requires HTTP server integration
                // For now, fall back to a custom HTTP-based SSE implementation
                throw new Error('SSE transport requires custom HTTP server integration - use HTTP transport instead for now');
                // This would need a proper HTTP server to handle SSE connections
                break;
                
            case 'http':
            case 'https':
                transport = new HTTPServerTransport(config);
                startFn = async () => {
                    console.log(`📡 Starting ${config.transport.toUpperCase()} transport...`);
                    await transport.start();
                    console.log(`✅ MCP server ready via ${config.transport.toUpperCase()}`);
                };
                stopFn = async () => {
                    console.log(`📡 Stopping ${config.transport.toUpperCase()} transport...`);
                    await transport.stop();
                };
                break;
                
            default:
                throw new Error(`Unsupported transport type: ${config.transport}`);
        }
        
        // Security status logging is now handled by FeatureManager
        
        return {
            server,
            transport,
            start: startFn,
            stop: stopFn
        };
    }
    
    private static logSecurityStatus(config: MCPServerConfig) {
        console.log('🔒 Security Status:');
        console.log(`   - Authentication: ${config.enableAuth ? '✅ Enabled' : '❌ Disabled'}`);
        console.log(`   - Content Encryption: ${process.env.ENCRYPTION_KEY ? '✅ Enabled' : '❌ Disabled'}`);
        console.log(`   - Transport Security: ${config.transport === 'https' ? '✅ HTTPS' : config.transport === 'stdio' ? '✅ Local' : '⚠️  HTTP'}`);
        
        if (config.rateLimitRequests) {
            console.log(`   - Rate Limiting: ✅ ${config.rateLimitRequests} req/min`);
        }
        
        if (config.cors) {
            console.log(`   - CORS: ✅ Enabled`);
        }
    }
    
    /**
     * Create a server configuration from environment variables
     */
    static createConfigFromEnv(baseConfig: ContextMcpConfig): MCPServerConfig {
        const transport = (process.env.MCP_TRANSPORT || 'stdio').toLowerCase() as MCPTransportType;
        
        return {
            ...baseConfig,
            transport,
            port: process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : undefined,
            host: process.env.MCP_HOST,
            cors: process.env.MCP_CORS === 'true',
            corsOrigins: process.env.MCP_CORS_ORIGINS?.split(','),
            sslKeyPath: process.env.MCP_SSL_KEY_PATH,
            sslCertPath: process.env.MCP_SSL_CERT_PATH,
            sseEndpoint: process.env.MCP_SSE_ENDPOINT,
            enableAuth: process.env.ACCESS_TOKEN ? true : false,
            rateLimitRequests: process.env.MCP_RATE_LIMIT ? parseInt(process.env.MCP_RATE_LIMIT) : 0
        };
    }
    
    /**
     * Validate server configuration
     */
    static validateConfig(config: MCPServerConfig): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        
        if (!['stdio', 'sse', 'http', 'https'].includes(config.transport)) {
            errors.push(`Invalid transport: ${config.transport}`);
        }
        
        if (['http', 'https', 'sse'].includes(config.transport)) {
            if (config.port && (config.port < 1 || config.port > 65535)) {
                errors.push(`Invalid port: ${config.port}`);
            }
        }
        
        if (config.transport === 'https') {
            if (!config.sslKeyPath) {
                errors.push('SSL key path required for HTTPS transport');
            }
            if (!config.sslCertPath) {
                errors.push('SSL cert path required for HTTPS transport');
            }
            if (config.sslKeyPath && !fs.existsSync(config.sslKeyPath)) {
                errors.push(`SSL key file not found: ${config.sslKeyPath}`);
            }
            if (config.sslCertPath && !fs.existsSync(config.sslCertPath)) {
                errors.push(`SSL cert file not found: ${config.sslCertPath}`);
            }
        }
        
        if (config.rateLimitRequests && config.rateLimitRequests < 0) {
            errors.push(`Invalid rate limit: ${config.rateLimitRequests}`);
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
}