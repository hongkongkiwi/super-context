# Super Context MCP Server - Feature Options

Three server variants to match your needs:

## 🔧 Quick Start (Choose One)

### Option 1: Minimal Server (Recommended)
**Perfect for Claude Desktop integration**
```bash
npm run start:minimal
```
- ✅ Core indexing and search
- ✅ STDIO transport (Claude Desktop)  
- ❌ No optional features
- 🎯 Zero configuration needed

### Option 2: Multi-Transport Server (Advanced)
**For web apps, production, or custom setups**
```bash
npm run start:multi
```
- ✅ All optional features available
- ✅ Multiple transport protocols
- 🔐 Optional security features
- 🎛️ Full customization

### Option 3: Original Server (Legacy)
**For backward compatibility**  
```bash
npm start
```

## ⚡ Optional Features (Multi-Transport Only)

All features are **OFF by default**. Enable only what you need:

| Feature | Environment Variable | Example |
|---------|---------------------|---------|
| **Content Encryption** | `ENCRYPTION_KEY=...` | `ENCRYPTION_KEY=$(openssl rand -hex 32)` |
| **Authentication** | `ACCESS_TOKEN=...` | `ACCESS_TOKEN=$(openssl rand -hex 16)` |  
| **HTTP Transport** | `MCP_TRANSPORT=http` | `MCP_TRANSPORT=http MCP_PORT=3000` |
| **HTTPS Transport** | `MCP_TRANSPORT=https` | `MCP_TRANSPORT=https MCP_SSL_KEY_PATH=./key.pem` |
| **CORS Support** | `MCP_CORS=true` | `MCP_CORS=true MCP_CORS_ORIGINS=https://myapp.com` |
| **Rate Limiting** | `MCP_RATE_LIMIT=100` | `MCP_RATE_LIMIT=100` |

## 🚀 Common Scenarios

### Claude Desktop (Personal Use)
```bash
# Basic: No features needed
npm run start:minimal

# With encryption for sensitive code:
ENCRYPTION_KEY=your-secret-key-32-chars npm run start:multi
```

### Web Development  
```bash
MCP_TRANSPORT=http MCP_CORS=true npm run start:multi
```

### Production Deployment
```bash
MCP_TRANSPORT=https \
ACCESS_TOKEN=$(openssl rand -hex 32) \
ENCRYPTION_KEY=$(openssl rand -hex 32) \
MCP_RATE_LIMIT=1000 \
npm run start:multi
```

## 📖 Documentation

- **[OPTIONAL_FEATURES.md](./OPTIONAL_FEATURES.md)** - Complete feature guide
- **[TRANSPORT_GUIDE.md](./TRANSPORT_GUIDE.md)** - Transport protocol details

## 🔍 Check Your Configuration

Use the status tool to see which features are active:

```bash
# For HTTP server:
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_security_status","arguments":{}},"id":1}'
```

Shows enabled/disabled features and how to enable them.

---

**Key Principle**: Start minimal, add features only as needed. The minimal server works perfectly for most Claude Desktop users with zero configuration required.