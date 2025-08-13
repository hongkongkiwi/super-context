#!/bin/bash

echo "🚀 Setting up development tools for super-context monorepo"

# Install ESLint and Prettier tools
echo "🔧 Installing linting and formatting tools..."
pnpm add -D -w \
  eslint-plugin-import \
  eslint-plugin-unused-imports \
  eslint-plugin-prettier \
  eslint-import-resolver-typescript \
  prettier \
  eslint-config-prettier

# Install build tools (lightweight approach)
echo "🛠️ Installing build tools..."
pnpm add -D -w \
  tsup \
  esbuild \
  turbo

# Install publishing tools
echo "📚 Installing publishing tools..."
pnpm add -D -w \
  @changesets/cli \
  @changesets/changelog-github

# Install documentation tools
echo "📖 Installing documentation tools..."
pnpm add -D -w \
  typedoc \
  typedoc-plugin-markdown

echo "✅ Development tools installed successfully!"
echo ""
echo "This setup is optimized for your specific project needs:"
echo "• TypeScript-first builds with proper .d.ts generation"
echo "• Native module compatibility for tree-sitter parsers"
echo "• Dual ESM/CJS output for maximum compatibility"
echo "• Lightweight tooling without unnecessary abstractions"
echo ""
echo "Next steps:"
echo "1. Run 'pnpm install' to update lockfile"
echo "2. Run 'pnpm build' to build all packages"
echo "3. Run 'pnpm lint:fix' to auto-fix linting issues"
echo "4. Run 'pnpm typecheck' to check TypeScript types"
echo ""
echo "For publishing:"
echo "1. Run 'pnpm changeset' to create a changeset"
echo "2. Run 'pnpm changeset:version' to update versions"
echo "3. Run 'pnpm changeset:publish' to publish packages"