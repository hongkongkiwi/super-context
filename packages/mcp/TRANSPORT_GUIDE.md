# Multi-Transport MCP Server Guide

The Super Context MCP server now supports multiple transport protocols with integrated security features. This guide explains how to configure and use each transport type.

## 🚀 Quick Start

### Default STDIO (Best for Claude)
```bash
npm start
# or
npm run start:multi
```

### HTTP API Server
```bash
npm run start:http
# or
MCP_TRANSPORT=http MCP_PORT=3000 npm run start:multi
```

### HTTPS Secure Server
```bash
MCP_TRANSPORT=https \
MCP_PORT=3000 \
MCP_SSL_KEY_PATH=./key.pem \
MCP_SSL_CERT_PATH=./cert.pem \
npm run start:multi
```

### Server-Sent Events (SSE)
```bash
npm run start:sse
# or
MCP_TRANSPORT=sse MCP_PORT=3001 npm run start:multi
```

## 🌐 Transport Types

### 1. STDIO (Default)
- **Best for**: Claude Desktop integration, CLI tools
- **Protocol**: Standard input/output streams
- **Security**: Process isolation, local-only access
- **Configuration**: No additional setup required

```bash
MCP_TRANSPORT=stdio npm run start:multi
```

### 2. HTTP 
- **Best for**: Web applications, REST clients, development
- **Protocol**: HTTP JSON-RPC over REST
- **Security**: Optional authentication, CORS support
- **Default Port**: 3000

```bash
MCP_TRANSPORT=http \
MCP_PORT=3000 \
MCP_CORS=true \
ACCESS_TOKEN=your-secure-token \
npm run start:multi
```

**Example HTTP Request:**
```bash
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

### 3. HTTPS
- **Best for**: Production web applications, secure clients
- **Protocol**: HTTPS JSON-RPC over REST
- **Security**: TLS encryption + authentication
- **Default Port**: 3000
- **Requirements**: SSL certificate and key files

```bash
MCP_TRANSPORT=https \
MCP_PORT=3000 \
MCP_SSL_KEY_PATH=./server.key \
MCP_SSL_CERT_PATH=./server.crt \
ACCESS_TOKEN=your-secure-token \
npm run start:multi
```

**Generate Self-Signed Certificate for Testing:**
```bash
openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.crt -days 365 -nodes
```

### 4. Server-Sent Events (SSE)
- **Best for**: Real-time web applications, browser clients
- **Protocol**: SSE with JSON-RPC
- **Security**: Optional authentication, CORS support
- **Default Port**: 3001

```bash
MCP_TRANSPORT=sse \
MCP_PORT=3001 \
MCP_SSE_ENDPOINT=/mcp/sse \
ACCESS_TOKEN=your-secure-token \
npm run start:multi
```

**Example JavaScript Client:**
```javascript
const eventSource = new EventSource('http://localhost:3001/mcp/sse');
eventSource.onmessage = function(event) {
  const response = JSON.parse(event.data);
  console.log('MCP Response:', response);
};
```

## 🔐 Security Configuration

### Authentication
Enable authentication by setting an access token:

```bash
ACCESS_TOKEN=your-secure-token-16-chars npm run start:multi
```

- **Minimum length**: 16 characters
- **HTTP/HTTPS**: Sent via `Authorization: Bearer <token>` header
- **STDIO/SSE**: Transport-level validation

### Content Encryption
Enable automatic encryption of sensitive code content:

```bash
ENCRYPTION_KEY=your-32-character-encryption-key npm run start:multi
```

- **Minimum length**: 32 characters
- **Automatic detection**: Encrypts files with sensitive patterns
- **Transparent**: Decrypted automatically during search

### Rate Limiting
Limit requests per minute to prevent abuse:

```bash
MCP_RATE_LIMIT=60 npm run start:multi  # 60 requests per minute
```

### CORS (Cross-Origin Resource Sharing)
Enable CORS for web client access:

```bash
MCP_CORS=true \
MCP_CORS_ORIGINS=https://myapp.com,https://anotherapp.com \
npm run start:multi
```

## 📋 Environment Variables

### Transport Configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT` | `stdio` | Transport type: `stdio`, `http`, `https`, `sse` |
| `MCP_PORT` | `3000`/`3001` | Server port (HTTP/HTTPS: 3000, SSE: 3001) |
| `MCP_HOST` | `localhost` | Server hostname |
| `MCP_SSE_ENDPOINT` | `/mcp/sse` | SSE endpoint path |

### SSL/TLS Configuration
| Variable | Description |
|----------|-------------|
| `MCP_SSL_KEY_PATH` | Path to SSL private key file (required for HTTPS) |
| `MCP_SSL_CERT_PATH` | Path to SSL certificate file (required for HTTPS) |

### Security Configuration
| Variable | Description |
|----------|-------------|
| `ACCESS_TOKEN` | Authentication token (16+ characters) |
| `ENCRYPTION_KEY` | Content encryption key (32+ characters) |
| `MCP_RATE_LIMIT` | Requests per minute limit (0 = no limit) |

### CORS Configuration
| Variable | Description |
|----------|-------------|
| `MCP_CORS` | Enable CORS (`true`/`false`) |
| `MCP_CORS_ORIGINS` | Comma-separated list of allowed origins |

### Core Configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_STATELESS_MODE` | `false` | Enable stateless mode (no filesystem access) |
| `OPENAI_API_KEY` | | OpenAI API key for embeddings |
| `MILVUS_ADDRESS` | `localhost:19530` | Milvus vector database address |

## 🛠 Usage Examples

### Example 1: Development HTTP Server with Security
```bash
#!/bin/bash
export MCP_TRANSPORT=http
export MCP_PORT=3000
export MCP_CORS=true
export MCP_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
export ACCESS_TOKEN=dev-token-1234567890
export ENCRYPTION_KEY=dev-encryption-key-1234567890123456
export MCP_RATE_LIMIT=100
export OPENAI_API_KEY=your-openai-key

npm run start:multi
```

### Example 2: Production HTTPS Server
```bash
#!/bin/bash
export MCP_TRANSPORT=https
export MCP_PORT=443
export MCP_HOST=0.0.0.0
export MCP_SSL_KEY_PATH=/etc/ssl/private/server.key
export MCP_SSL_CERT_PATH=/etc/ssl/certs/server.crt
export ACCESS_TOKEN=$(openssl rand -hex 32)
export ENCRYPTION_KEY=$(openssl rand -hex 32)
export MCP_RATE_LIMIT=1000
export MCP_CORS=true
export MCP_CORS_ORIGINS=https://myapp.com
export OPENAI_API_KEY=your-openai-key
export MILVUS_ADDRESS=milvus-server:19530

npm run start:multi
```

### Example 3: Real-time SSE Server
```bash
#!/bin/bash
export MCP_TRANSPORT=sse
export MCP_PORT=3001
export MCP_SSE_ENDPOINT=/api/mcp/events
export ACCESS_TOKEN=sse-token-1234567890
export MCP_CORS=true
export ENCRYPTION_KEY=sse-encryption-key-1234567890123456
export OPENAI_API_KEY=your-openai-key

npm run start:multi
```

## 🔍 Security Status Tool

Check your current security configuration:

```bash
# Using the security status tool
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

## 🧪 Testing

Test each transport type:

```bash
# Test STDIO (requires manual input)
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | npm run start:multi

# Test HTTP
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Test HTTPS (with self-signed cert)
curl -k -X POST https://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Test SSE
curl -N -H "Accept: text/event-stream" http://localhost:3001/mcp/sse
```

## 📊 Performance Considerations

### Transport Performance (Latency & Throughput)
1. **STDIO**: Lowest latency, highest throughput (local IPC)
2. **HTTP**: Medium latency, high throughput (single connections)
3. **HTTPS**: Medium latency, high throughput (with TLS overhead)
4. **SSE**: Higher latency, medium throughput (persistent connections)

### Security vs Performance Trade-offs
- **No Security**: Maximum performance
- **Authentication Only**: Minimal overhead
- **Content Encryption**: Medium overhead (CPU-bound)
- **HTTPS + Auth + Encryption**: Highest security, some performance cost

### Recommended Configurations

#### Development
```bash
MCP_TRANSPORT=http
MCP_CORS=true
# No authentication for local development
```

#### Production
```bash
MCP_TRANSPORT=https
ACCESS_TOKEN=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32) 
MCP_RATE_LIMIT=1000
```

#### Claude Desktop Integration
```bash
MCP_TRANSPORT=stdio
ENCRYPTION_KEY=your-encryption-key-for-sensitive-code
# STDIO is the standard for Claude Desktop
```

## 🐛 Troubleshooting

### Common Issues

#### "Port already in use"
```bash
# Find and kill process using the port
lsof -ti:3000 | xargs kill -9
```

#### "SSL certificate errors"
```bash
# Generate new self-signed certificate
openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.crt -days 365 -nodes -subj "/CN=localhost"
```

#### "Authentication failed"
- Ensure `ACCESS_TOKEN` is at least 16 characters
- Check `Authorization: Bearer <token>` header format
- Verify token matches server configuration

#### "CORS errors"
- Set `MCP_CORS=true`
- Add client origin to `MCP_CORS_ORIGINS`
- Check preflight OPTIONS requests

### Debug Mode
Enable detailed logging:

```bash
DEBUG=mcp:* npm run start:multi
```

## 🔗 Integration Examples

### Node.js Client
```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { HTTPClientTransport } from '@modelcontextprotocol/sdk/client/http.js';

const client = new Client({
  name: 'my-client',
  version: '1.0.0'
});

const transport = new HTTPClientTransport('http://localhost:3000', {
  headers: {
    'Authorization': 'Bearer your-token'
  }
});

await client.connect(transport);
const tools = await client.listTools();
console.log(tools);
```

### Python Client
```python
import requests

def call_mcp_tool(method, params=None):
    response = requests.post('http://localhost:3000', 
        headers={
            'Content-Type': 'application/json',
            'Authorization': 'Bearer your-token'
        },
        json={
            'jsonrpc': '2.0',
            'method': method,
            'params': params,
            'id': 1
        }
    )
    return response.json()

# List available tools
tools = call_mcp_tool('tools/list')
print(tools)
```

This guide provides comprehensive coverage of all transport types with security features. Each transport is optimized for different use cases while maintaining consistent security standards.