# Git Integration Guide

## Overview

The Super Context MCP server now includes comprehensive git integration that provides rich context about your codebase history, blame information, and hotspots.

## Access Strategy

The git integration uses a **hybrid approach** for maximum flexibility:

### 🎯 **Priority Order**
1. **Tool Parameter** (highest priority): Pass `repoPath` parameter
2. **Environment Variable**: Set `PROJECT_ROOT` 
3. **Auto-detection**: Walk up from current directory to find `.git`

### 📋 **Usage Patterns**

#### Pattern 1: Explicit Repository Path
```json
{
  "name": "get_git_context",
  "arguments": {
    "filePath": "src/handlers.ts",
    "repoPath": "/absolute/path/to/your/repo"
  }
}
```

#### Pattern 2: Environment Variable
```bash
# Set environment variable
export PROJECT_ROOT="/path/to/your/project"

# Or in Claude Desktop config:
{
  "mcpServers": {
    "super-context": {
      "command": "super-context-mcp",
      "env": {
        "PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

Then use tools without `repoPath`:
```json
{
  "name": "get_git_context", 
  "arguments": {
    "filePath": "src/handlers.ts"
  }
}
```

#### Pattern 3: Auto-detection
If running MCP server from within a git repository, it will auto-detect:
```bash
cd /path/to/your/git/repo
super-context-mcp
```

## Available Tools

### 🔍 **get_git_context**
Get comprehensive git information for a file.

**Parameters:**
- `filePath` (required): Path to file
- `repoPath` (optional): Repository root path

**Returns:**
- Recent commits affecting the file
- Blame information (who wrote each line)
- Hotspot metrics (change frequency, author count)

**Example:**
```json
{
  "name": "get_git_context",
  "arguments": {
    "filePath": "packages/core/src/index.ts"
  }
}
```

### 👤 **get_git_blame**
Detailed blame information showing who last modified each line.

**Parameters:**
- `filePath` (required): Path to file
- `repoPath` (optional): Repository root path

**Returns:**
- Line-by-line author information
- Commit hash for each line
- Original content

**Example:**
```json
{
  "name": "get_git_blame",
  "arguments": {
    "filePath": "src/handlers.ts",
    "repoPath": "/path/to/repo"  
  }
}
```

### 📈 **get_git_history**
Commit history for a specific file.

**Parameters:**
- `filePath` (required): Path to file
- `repoPath` (optional): Repository root path
- `limit` (optional): Max commits to return (default: 20)

**Returns:**
- Chronological commit history
- Author and date information
- Commit messages
- Files changed in each commit

**Example:**
```json
{
  "name": "get_git_history",
  "arguments": {
    "filePath": "packages/mcp/src/index.ts",
    "limit": 10
  }
}
```

### 🔥 **get_git_hotspots**
Repository hotspots - files that change most frequently.

**Parameters:**
- `repoPath` (optional): Repository root path
- `limit` (optional): Max hotspots to return (default: 10)

**Returns:**
- Most frequently changed files
- Change frequency metrics
- Author diversity
- Recent activity timestamps

**Example:**
```json
{
  "name": "get_git_hotspots", 
  "arguments": {
    "limit": 15
  }
}
```

## Configuration Examples

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "super-context": {
      "command": "/path/to/super-context-mcp",
      "env": {
        "PROJECT_ROOT": "/Users/yourname/projects/your-repo",
        "OPENAI_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Shell Environment

```bash
# Set globally
export PROJECT_ROOT="/path/to/your/main/project"

# Or per session
PROJECT_ROOT="/path/to/specific/project" super-context-mcp
```

### Docker/Container Setup

```dockerfile
ENV PROJECT_ROOT=/app
WORKDIR /app
COPY . /app
RUN super-context-mcp
```

## Error Handling

### Common Errors and Solutions

**"No git repository found"**
```
Solution: 
1. Pass repoPath parameter, or
2. Set PROJECT_ROOT env var, or  
3. Run from within git repo
```

**"Provided path is not a git repository"**
```
Solution: Ensure path contains .git directory
```

**"filePath parameter is required"**
```
Solution: Always provide filePath for file-specific tools
```

## Security Considerations

### Path Resolution
- All paths are resolved to absolute paths
- Relative paths are resolved from repository root
- Path traversal attempts are blocked

### Repository Access
- Only accesses repositories you explicitly specify
- No automatic scanning of entire filesystem
- Respects git ignore patterns

### Performance
- Git operations are cached per repository
- Efficient command execution
- Resource cleanup after operations

## Advanced Usage

### Multiple Repositories
```json
// First repo
{
  "name": "get_git_hotspots",
  "arguments": {
    "repoPath": "/path/to/repo1"
  }
}

// Second repo  
{
  "name": "get_git_hotspots",
  "arguments": {
    "repoPath": "/path/to/repo2"
  }
}
```

### Cross-Repository Analysis
```json
// Compare hotspots across projects
{
  "name": "get_git_hotspots",
  "arguments": {
    "repoPath": "/path/to/frontend",
    "limit": 5
  }
}

{
  "name": "get_git_hotspots", 
  "arguments": {
    "repoPath": "/path/to/backend",
    "limit": 5
  }
}
```

### Integration with Code Search
```json
// First search for code
{
  "name": "search_code",
  "arguments": {
    "query": "authentication logic",
    "path": "/path/to/project"
  }
}

// Then get git context for found files
{
  "name": "get_git_context",
  "arguments": {
    "filePath": "src/auth/login.ts",
    "repoPath": "/path/to/project"
  }
}
```

## Best Practices

### 🎯 **For Maximum Reliability**
1. **Always set PROJECT_ROOT** in production environments
2. **Use absolute paths** when possible
3. **Cache git operations** by keeping MCP server running

### ⚡ **For Performance**
1. **Limit history queries** to reasonable ranges
2. **Use hotspots** to identify important files first
3. **Batch related queries** in single session

### 🔒 **For Security**
1. **Validate repository access** in multi-tenant environments  
2. **Use environment variables** instead of hardcoded paths
3. **Monitor git command execution** in production

## Troubleshooting

### Debug Mode
Set debug environment variable:
```bash
DEBUG=git* super-context-mcp
```

### Verbose Logging
```bash  
LOG_LEVEL=debug super-context-mcp
```

### Testing Git Integration
```bash
# Test git detection
cd your-repo
git status  # Should work

# Test MCP server
super-context-mcp
# Then call git tools from Claude
```

The git integration provides rich contextual information to help AI understand your codebase history, ownership, and change patterns! 🚀