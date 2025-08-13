/**
 * Simple MCP-compatible authentication
 * Uses standard HTTP headers that MCP clients can set
 * Enable with ACCESS_TOKEN environment variable
 */

export interface AuthResult {
    authorized: boolean;
    error?: string;
}

/**
 * Simple token-based authentication for MCP
 */
export class SimpleMCPAuth {
    private static accessToken: string | null = null;
    private static initialized = false;

    /**
     * Initialize authentication
     */
    static init(): boolean {
        if (this.initialized) return !!this.accessToken;

        const token = process.env.ACCESS_TOKEN;
        if (token && token.length >= 16) {
            this.accessToken = token;
            console.log('🔐 MCP authentication enabled');
        } else if (token && token.length < 16) {
            console.warn('⚠️  ACCESS_TOKEN too short (minimum 16 characters). Auth disabled.');
        } else {
            console.log('🔓 MCP authentication disabled (no ACCESS_TOKEN)');
        }
        
        this.initialized = true;
        return !!this.accessToken;
    }

    /**
     * Check if authentication is enabled
     */
    static isEnabled(): boolean {
        return this.init();
    }

    /**
     * Validate request (can be extended to check headers in future MCP versions)
     */
    static validateRequest(providedToken?: string): AuthResult {
        if (!this.isEnabled()) {
            return { authorized: true };
        }

        // For now, just check if token matches
        // In future MCP versions, this could read from request headers
        if (providedToken === this.accessToken) {
            return { authorized: true };
        }

        return { 
            authorized: false, 
            error: 'Invalid or missing access token' 
        };
    }

    /**
     * Get auth status for logging
     */
    static getStatus(): { enabled: boolean; tokenLength?: number } {
        return {
            enabled: this.isEnabled(),
            tokenLength: this.accessToken?.length
        };
    }
}

// No auto-initialization - authentication is completely optional
// Call SimpleMCPAuth.init() explicitly if you want to use authentication