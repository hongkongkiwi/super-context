# Publishing Guide

This guide covers publishing packages to both NPM and JSR registries.

## Prerequisites

### NPM Setup
1. **NPM Account**: Create account at [npmjs.com](https://npmjs.com)
2. **Organization**: Set up `@hongkongkiwi` organization
3. **Access Token**: Generate automation token with publish permissions
4. **2FA**: Enable two-factor authentication

### JSR Setup
1. **JSR Account**: Sign up at [jsr.io](https://jsr.io)
2. **Scope**: Create `@hongkongkiwi` scope
3. **GitHub Integration**: Link your repository for provenance

### Environment Setup
```bash
# Install JSR CLI globally (alternative to npx/pnpm dlx)
npm install -g @jsr/cli

# Verify setup
npm whoami
jsr --version
```

## Package Configuration

### Modern NPM Best Practices ✅

Both packages follow 2024+ standards:

- **ESM-first** with `"type": "module"`
- **Dual exports** ESM/CJS with proper `exports` field
- **Subpath exports** for tree-shaking (core package only)
- **Provenance** enabled for supply chain security
- **Package validation** with publint and attw
- **TypeScript support** with proper .d.ts generation
- **Node.js 20+** minimum requirement

### Key Features

```json
{
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "default": "./dist/index.js"
    }
  },
  "sideEffects": false,
  "publishConfig": {
    "provenance": true
  }
}
```

## Dual Build Strategy

### TypeScript Compiler (Primary)
- **Production builds**: Reliable, compatible
- **Native modules**: Works with tree-sitter bindings
- **Type generation**: Perfect .d.ts files

### tsup (Modern Alternative)
- **Development**: Faster iteration
- **Modern targets**: ES2022 features
- **Bundle optimization**: Tree-shaking, minification

```bash
# Primary build (for publishing)
pnpm build         # Uses TypeScript compiler

# Modern build (for development)
pnpm build:modern  # Uses tsup
```

## Publishing Workflow

### 1. Local Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Validate packages
pnpm validate:packages

# Check what would be published
cd packages/core
pnpm pack --dry-run
publint
attw --pack

cd ../mcp
pnpm pack --dry-run
publint
attw --pack
```

### 2. Version Management (Changesets)

```bash
# Create changeset for your changes
pnpm changeset

# Preview version bumps
pnpm changeset:version

# Commit version changes
git add .
git commit -m "chore: version packages"
```

### 3. Publishing Options

#### Option A: Automated (Recommended)
Push to main branch and let GitHub Actions handle publishing:

```bash
git push origin main
# GitHub Actions will:
# 1. Build and validate packages
# 2. Create release PR (if needed)
# 3. Publish to NPM when PR merged
```

#### Option B: Manual NPM Publishing

```bash
# Publish to NPM
pnpm publish:npm
# or individual packages
pnpm release:core
pnpm release:mcp
```

#### Option C: Manual JSR Publishing

```bash
# Publish to JSR
pnpm publish:jsr

# Or individual packages
cd packages/core && pnpm dlx jsr publish
cd packages/mcp && pnpm dlx jsr publish
```

#### Option D: Dual Publishing

```bash
# Publish to both registries
pnpm publish:all
```

## Registry Differences

### NPM Registry
- **Built packages**: Publishes `dist/` folder with compiled JS/TS
- **Dependencies**: Full dependency tree with node_modules
- **Compatibility**: Works with all Node.js package managers
- **Binary support**: Can include native extensions

### JSR Registry
- **Source publishing**: Publishes TypeScript source files directly
- **ESM only**: Modern JavaScript/TypeScript only
- **Built-in TypeScript**: No build step needed for consumers
- **Cross-runtime**: Works with Node.js, Deno, Bun

## Package Validation

Both packages include validation steps:

```bash
# Run all validations
pnpm validate:packages

# Individual checks
pnpm lint           # ESLint
pnpm typecheck      # TypeScript
publint            # Package.json validation
attw --pack         # TypeScript exports validation
```

## Troubleshooting

### Common Issues

**NPM Authentication**
```bash
npm login
npm whoami
```

**JSR Authentication**
```bash
# JSR uses browser-based auth
cd packages/core
pnpm dlx jsr publish  # Will open browser for auth
```

**Build Issues**
```bash
# Clean and rebuild
pnpm clean
pnpm install
pnpm build
```

**Type Errors**
```bash
# Check TypeScript configuration
pnpm typecheck
# Check exports compatibility
attw --pack packages/core
```

### Version Conflicts

If versions get out of sync:

```bash
# Reset to clean state
git stash
pnpm clean
pnpm install
pnpm build

# Manually sync versions if needed
pnpm changeset:version
```

## Security

### Supply Chain Protection

- **Provenance**: Enabled for NPM packages
- **2FA**: Required for NPM publishing
- **Dependency scanning**: Automated via GitHub
- **Lock files**: Committed for reproducible builds

### Access Control

- **NPM**: Organization-level access control
- **JSR**: GitHub integration for permissions
- **GitHub**: Repository access controls publishing

## Monitoring

### After Publishing

1. **NPM Package Pages**:
   - https://npmjs.com/package/@hongkongkiwi/super-context-core
   - https://npmjs.com/package/@hongkongkiwi/super-context-mcp

2. **JSR Package Pages**:
   - https://jsr.io/@hongkongkiwi/super-context-core
   - https://jsr.io/@hongkongkiwi/super-context-mcp

3. **Usage Analytics**: Available in NPM dashboard
4. **Download Stats**: Via npm-stat or similar tools

### Unpublishing (Emergency)

```bash
# NPM (limited time window)
npm unpublish @hongkongkiwi/super-context-core@version --force

# JSR (contact support)
# JSR doesn't support unpublishing - contact JSR team
```

## Best Practices

1. **Always validate** before publishing
2. **Use semantic versioning** strictly
3. **Test in CI** before publishing
4. **Monitor downloads** and issues
5. **Keep documentation** up to date
6. **Respond to issues** promptly
7. **Security updates** as highest priority