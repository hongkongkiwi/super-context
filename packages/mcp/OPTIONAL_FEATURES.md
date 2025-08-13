# Optional Features Guide

Super Context MCP Server provides three different server variants with different levels of features:

## 🎯 Server Variants

### 1. **Minimal Server** (Recommended for most users)
- **Command**: `npm run start:minimal` or `super-context-mcp-minimal`
- **Features**: Core indexing and search only
- **Transport**: STDIO only (perfect for Claude Desktop)
- **Security**: None (maximum compatibility)
- **Use case**: Basic Claude Desktop integration, minimal setup

### 2. **Original Server** (Legacy)
- **Command**: `npm start` or `super-context-mcp`  
- **Features**: Core functionality with some built-in features
- **Transport**: STDIO only
- **Security**: Basic
- **Use case**: Backward compatibility

### 3. **Multi-Transport Server** (Advanced users)
- **Command**: `npm run start:multi` or `super-context-mcp-multi`
- **Features**: All optional features available
- **Transport**: STDIO, HTTP, HTTPS, SSE
- **Security**: All security features (opt-in)
- **Use case**: Production deployments, web integration, advanced setups

## 🔧 Optional Features (Multi-Transport Server Only)

All features are **disabled by default** and require explicit opt-in via environment variables.

### 🔐 Content Encryption
Automatically encrypts sensitive code content at rest.

**Enable**: Set `ENCRYPTION_KEY` environment variable
```bash
# Enable content encryption
ENCRYPTION_KEY=your-32-character-or-longer-encryption-key

# Examples
ENCRYPTION_KEY=$(openssl rand -hex 32)  # Generate random key
ENCRYPTION_KEY=mysecretkey123456789012345678901234  # Custom key (32+ chars)
```

**What it does**:
- Detects sensitive files (`.env`, `.secret`, API keys in code)
- Encrypts content before storing in vector database
- Automatically decrypts during search
- Uses AES-256-GCM encryption

**Auto-detection patterns**:
- Files: `.env`, `.secret`, `.key`, `.pem`, etc.
- Content: `api_key=`, `secret_key=`, `password=`, `token=`, etc.

### 🔑 Authentication
Requires clients to provide an access token.

**Enable**: Set `ACCESS_TOKEN` environment variable
```bash
# Enable authentication
ACCESS_TOKEN=your-16-character-or-longer-token

# Examples  
ACCESS_TOKEN=$(openssl rand -hex 16)  # Generate random token
ACCESS_TOKEN=myaccesstoken12345  # Custom token (16+ chars)
```

**How it works**:
- HTTP/HTTPS: `Authorization: Bearer <token>` header
- STDIO: No authentication needed (process-level security)
- Returns 401 Unauthorized for invalid/missing tokens

### 🌐 Multi-Transport Support
Enable different transport protocols beyond STDIO.

**Configure**: Set `MCP_TRANSPORT` environment variable
```bash
# Available transports
MCP_TRANSPORT=stdio   # Default - for Claude Desktop
MCP_TRANSPORT=http    # HTTP REST API  
MCP_TRANSPORT=https   # HTTPS REST API (requires SSL certs)
MCP_TRANSPORT=sse     # Server-Sent Events (planned)
```

**HTTP/HTTPS Configuration**:
```bash
MCP_TRANSPORT=http
MCP_PORT=3000         # Server port (default: 3000)
MCP_HOST=localhost    # Server host (default: localhost)
```

**HTTPS Configuration**:
```bash
MCP_TRANSPORT=https
MCP_PORT=3000
MCP_SSL_KEY_PATH=/path/to/server.key      # Required for HTTPS
MCP_SSL_CERT_PATH=/path/to/server.crt     # Required for HTTPS
```

### 🌍 CORS Support
Enable Cross-Origin Resource Sharing for web clients.

**Enable**: Set `MCP_CORS=true`
```bash
# Enable CORS
MCP_CORS=true

# Restrict to specific origins (optional)
MCP_CORS_ORIGINS=https://myapp.com,https://anotherapp.com

# Allow all origins (development only)
MCP_CORS=true  # Defaults to allowing all origins
```

### ⚡ Rate Limiting
Prevent abuse by limiting requests per minute per client IP.

**Enable**: Set `MCP_RATE_LIMIT` to a positive number
```bash
# Enable rate limiting
MCP_RATE_LIMIT=100    # 100 requests per minute per IP
MCP_RATE_LIMIT=60     # 60 requests per minute per IP

# Disable rate limiting (default)
# MCP_RATE_LIMIT=0 or omit the variable
```

### 📊 Logging Configuration
Control logging verbosity and security event logging.

**Configure**: Set logging level and options
```bash
LOG_LEVEL=warn        # silent, error, warn, info, debug (default: warn)
LOG_SECURITY=true     # Log security events (default: false)
LOG_PERFORMANCE=true  # Log performance metrics (default: false)
```

## 🚀 Common Configuration Examples

### Example 1: Minimal Setup (Most Users)
```bash
# Just use the minimal server - no configuration needed
npm run start:minimal
```

### Example 2: Basic HTTP Server with Authentication
```bash
export MCP_TRANSPORT=http
export MCP_PORT=3000
export ACCESS_TOKEN=$(openssl rand -hex 16)
export LOG_LEVEL=info

npm run start:multi
```

### Example 3: Secure HTTPS Server with All Features
```bash
export MCP_TRANSPORT=https
export MCP_PORT=443
export MCP_SSL_KEY_PATH=/etc/ssl/private/server.key
export MCP_SSL_CERT_PATH=/etc/ssl/certs/server.crt
export ACCESS_TOKEN=$(openssl rand -hex 32)
export ENCRYPTION_KEY=$(openssl rand -hex 32)
export MCP_CORS=true
export MCP_CORS_ORIGINS=https://myapp.com
export MCP_RATE_LIMIT=1000
export LOG_LEVEL=info
export LOG_SECURITY=true

npm run start:multi
```

### Example 4: Development HTTP Server with CORS
```bash
export MCP_TRANSPORT=http
export MCP_PORT=3000
export MCP_CORS=true
export LOG_LEVEL=debug

npm run start:multi
```

### Example 5: Claude Desktop with Encryption (Private Projects)
```bash
export ENCRYPTION_KEY=your-secret-key-for-private-code-12345678901234

npm run start:multi  # Still uses STDIO by default
```

## 🔍 Feature Status Tool

All server variants include a status tool to check current configuration:

### For Multi-Transport Server:
```bash
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call", 
    "params": {
      "name": "get_security_status",
      "arguments": {}
    },
    "id": 1
  }'
```

This returns a detailed report showing:
- Which optional features are enabled/disabled
- Current transport and security configuration  
- Quick examples for enabling disabled features

## 🔒 Security Best Practices

### Development
```bash
# Minimal security for development
MCP_TRANSPORT=http
MCP_CORS=true
LOG_LEVEL=debug
# No authentication or encryption needed for local development
```

### Staging
```bash  
# Medium security for staging
MCP_TRANSPORT=https
ACCESS_TOKEN=$(openssl rand -hex 32)
MCP_CORS=true
MCP_CORS_ORIGINS=https://staging.myapp.com
MCP_RATE_LIMIT=500
LOG_LEVEL=info
```

### Production
```bash
# High security for production  
MCP_TRANSPORT=https
ACCESS_TOKEN=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
MCP_CORS=true
MCP_CORS_ORIGINS=https://myapp.com
MCP_RATE_LIMIT=1000
LOG_LEVEL=warn
LOG_SECURITY=true
```

### Claude Desktop (Personal Use)
```bash
# High privacy for sensitive personal projects
ENCRYPTION_KEY=your-personal-encryption-key-1234567890123456
LOG_LEVEL=error

npm run start:multi  # Uses STDIO by default - perfect for Claude Desktop
```

## 🎛️ Configuration Matrix

| Feature | Minimal Server | Original Server | Multi-Transport Server | Environment Variable |
|---------|---------------|-----------------|----------------------|---------------------|
| Core Indexing/Search | ✅ | ✅ | ✅ | _(always enabled)_ |
| STDIO Transport | ✅ | ✅ | ✅ | _(default)_ |
| HTTP Transport | ❌ | ❌ | ✅ | `MCP_TRANSPORT=http` |
| HTTPS Transport | ❌ | ❌ | ✅ | `MCP_TRANSPORT=https` |
| Content Encryption | ❌ | ❌ | ✅ | `ENCRYPTION_KEY=...` |
| Authentication | ❌ | ❌ | ✅ | `ACCESS_TOKEN=...` |
| CORS Support | ❌ | ❌ | ✅ | `MCP_CORS=true` |
| Rate Limiting | ❌ | ❌ | ✅ | `MCP_RATE_LIMIT=N` |
| Security Logging | ❌ | ❌ | ✅ | `LOG_SECURITY=true` |

## 🏁 Getting Started

### For Most Users (Claude Desktop Integration)
```bash
npm run start:minimal
# Zero configuration needed - just works!
```

### For Web Developers  
```bash
MCP_TRANSPORT=http MCP_CORS=true npm run start:multi
# HTTP server with CORS for web development
```

### For Production Deployments
```bash
# Set up HTTPS certificates first, then:
MCP_TRANSPORT=https \
ACCESS_TOKEN=$(openssl rand -hex 32) \
ENCRYPTION_KEY=$(openssl rand -hex 32) \
npm run start:multi
```

### For Private/Sensitive Code
```bash
ENCRYPTION_KEY=your-secure-key-32-chars-minimum npm run start:multi
# Encrypts sensitive content automatically
```

All features are completely optional and can be mixed and matched based on your needs. The minimal server provides the same core functionality as the advanced server, just without the optional features.