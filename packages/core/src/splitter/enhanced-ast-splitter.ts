import Parser from 'tree-sitter';
import { Splitter, CodeChunk } from './index';
import { ResourcePool } from '../utils/mutex';

// Extended language parsers
const JavaScript = require('tree-sitter-javascript');
const TypeScript = require('tree-sitter-typescript').typescript;
const TSX = require('tree-sitter-typescript').tsx;
const Python = require('tree-sitter-python');
const Java = require('tree-sitter-java');
const Cpp = require('tree-sitter-cpp');
const Go = require('tree-sitter-go');
const Rust = require('tree-sitter-rust');
const CSharp = require('tree-sitter-c-sharp');
const Scala = require('tree-sitter-scala');

// Additional language parsers (install these as needed)
// const Kotlin = require('tree-sitter-kotlin');
// const PHP = require('tree-sitter-php');
// const Ruby = require('tree-sitter-ruby');
// const Swift = require('tree-sitter-swift');
// const Dart = require('tree-sitter-dart');
// const Elixir = require('tree-sitter-elixir');
// const Zig = require('tree-sitter-zig');

// Enhanced node types with better JSX/TSX support
const SPLITTABLE_NODE_TYPES = {
    javascript: [
        'function_declaration', 'arrow_function', 'class_declaration', 
        'method_definition', 'export_statement', 'variable_declaration',
        'object_expression', 'array_expression'
    ],
    typescript: [
        'function_declaration', 'arrow_function', 'class_declaration', 
        'method_definition', 'export_statement', 'interface_declaration', 
        'type_alias_declaration', 'enum_declaration', 'namespace_declaration'
    ],
    jsx: [
        'function_declaration', 'arrow_function', 'class_declaration',
        'method_definition', 'jsx_element', 'jsx_self_closing_element',
        'jsx_fragment', 'export_statement', 'variable_declaration'
    ],
    tsx: [
        'function_declaration', 'arrow_function', 'class_declaration',
        'method_definition', 'jsx_element', 'jsx_self_closing_element',
        'jsx_fragment', 'export_statement', 'interface_declaration',
        'type_alias_declaration', 'enum_declaration'
    ],
    python: [
        'function_definition', 'class_definition', 'decorated_definition',
        'async_function_definition', 'with_statement', 'for_statement',
        'while_statement', 'if_statement'
    ],
    java: [
        'method_declaration', 'class_declaration', 'interface_declaration',
        'constructor_declaration', 'enum_declaration', 'annotation_type_declaration',
        'field_declaration', 'static_initializer'
    ],
    kotlin: [
        'function_declaration', 'class_declaration', 'interface_declaration',
        'object_declaration', 'property_declaration', 'companion_object',
        'data_class_declaration', 'sealed_class_declaration'
    ],
    php: [
        'function_definition', 'class_declaration', 'interface_declaration',
        'trait_declaration', 'method_declaration', 'property_declaration',
        'namespace_definition', 'use_declaration'
    ],
    ruby: [
        'method', 'class', 'module', 'singleton_class', 'lambda',
        'do_block', 'block', 'def', 'defs'
    ],
    swift: [
        'function_declaration', 'class_declaration', 'struct_declaration',
        'enum_declaration', 'protocol_declaration', 'extension_declaration',
        'init_declaration', 'computed_property'
    ],
    dart: [
        'function_signature', 'class_definition', 'interface_definition',
        'mixin_declaration', 'enum_declaration', 'extension_declaration',
        'constructor_signature', 'method_signature'
    ],
    elixir: [
        'function', 'module', 'def', 'defp', 'defmacro', 'defprotocol',
        'defimpl', 'defstruct', 'defmodule'
    ],
    zig: [
        'function_declaration', 'struct_declaration', 'enum_declaration',
        'union_declaration', 'test_declaration', 'comptime_declaration'
    ],
    cpp: [
        'function_definition', 'class_specifier', 'namespace_definition',
        'declaration', 'template_declaration', 'struct_specifier',
        'union_specifier', 'enum_specifier'
    ],
    go: [
        'function_declaration', 'method_declaration', 'type_declaration',
        'var_declaration', 'const_declaration', 'interface_type',
        'struct_type', 'type_alias'
    ],
    rust: [
        'function_item', 'impl_item', 'struct_item', 'enum_item',
        'trait_item', 'mod_item', 'macro_definition', 'const_item',
        'static_item', 'type_alias'
    ],
    csharp: [
        'method_declaration', 'class_declaration', 'interface_declaration',
        'struct_declaration', 'enum_declaration', 'delegate_declaration',
        'property_declaration', 'event_declaration', 'namespace_declaration'
    ],
    scala: [
        'function_definition', 'class_definition', 'trait_definition',
        'object_definition', 'case_class_definition', 'val_definition',
        'var_definition', 'type_definition'
    ]
};

/**
 * Enhanced AST Code Splitter with improved language support
 */
export class EnhancedAstCodeSplitter implements Splitter {
    private chunkSize: number = 500; // Optimal size based on 2025 research
    private chunkOverlap: number = 100; // Smaller overlap for efficiency
    private parserPool: ResourcePool<Parser>;
    private langchainFallback: any;
    private treeCleanupQueue: Set<Parser.Tree> = new Set();
    private includeContext: boolean = true;
    private contextLines: number = 3; // Lines of context to include

    constructor(chunkSize?: number, chunkOverlap?: number, includeContext: boolean = true) {
        if (chunkSize) this.chunkSize = chunkSize;
        if (chunkOverlap) this.chunkOverlap = chunkOverlap;
        this.includeContext = includeContext;
        
        // Create a resource pool for parsers
        this.parserPool = new ResourcePool<Parser>(
            () => new Parser(),
            (parser: Parser) => {
                try {
                    parser.reset();
                } catch (error) {
                    console.warn(`⚠️  Warning: Failed to reset parser: ${error}`);
                }
            },
            3, // Initial pool size
            10 // Max pool size
        );

        // Initialize fallback splitter
        const { LangChainCodeSplitter } = require('./langchain-splitter');
        this.langchainFallback = new LangChainCodeSplitter(chunkSize, chunkOverlap);
    }

    async split(code: string, language: string, filePath?: string): Promise<CodeChunk[]> {
        const langConfig = this.getLanguageConfig(language);
        
        if (!langConfig) {
            console.log(`📝 Language ${language} not supported by AST, using fallback for: ${filePath || 'unknown'}`);
            return await this.langchainFallback.split(code, language, filePath);
        }

        return await this.parserPool.runWithResource(async (parser: Parser) => {
            let tree: Parser.Tree | null = null;
            try {
                console.log(`🌳 Using enhanced AST splitter for ${language} file: ${filePath || 'unknown'}`);

                parser.setLanguage(langConfig.parser);
                tree = parser.parse(code);

                if (!tree?.rootNode) {
                    console.warn(`⚠️  Failed to parse AST, falling back: ${filePath || 'unknown'}`);
                    return await this.langchainFallback.split(code, language, filePath);
                }

                // Extract chunks with context preservation
                const chunks = this.extractChunksWithContext(
                    tree.rootNode,
                    code,
                    langConfig.nodeTypes,
                    language,
                    filePath
                );

                // Add natural language descriptions if needed
                const enhancedChunks = this.enhanceChunksWithDescriptions(chunks, language);

                return enhancedChunks;
            } catch (error) {
                console.warn(`⚠️  Enhanced AST splitter failed, falling back: ${error}`);
                return await this.langchainFallback.split(code, language, filePath);
            } finally {
                this.cleanupTree(tree);
            }
        });
    }

    /**
     * Extract chunks with preserved context
     */
    private extractChunksWithContext(
        node: Parser.SyntaxNode,
        code: string,
        splittableTypes: string[],
        language: string,
        filePath?: string
    ): CodeChunk[] {
        const chunks: CodeChunk[] = [];
        const codeLines = code.split('\n');
        
        // Extract imports and global context
        const globalContext = this.extractGlobalContext(code, language);
        
        const traverse = (currentNode: Parser.SyntaxNode, parentContext: string = '') => {
            // Check if this node should be a chunk
            if (splittableTypes.includes(currentNode.type)) {
                const startLine = currentNode.startPosition.row;
                const endLine = currentNode.endPosition.row;
                
                // Get the chunk content
                let chunkContent = codeLines.slice(startLine, endLine + 1).join('\n');
                
                // Add context if enabled
                if (this.includeContext) {
                    const context = this.buildContext(
                        globalContext,
                        parentContext,
                        codeLines,
                        startLine,
                        language
                    );
                    
                    if (context) {
                        chunkContent = context + '\n\n' + chunkContent;
                    }
                }
                
                // Only add if chunk is meaningful size
                if (chunkContent.length >= 50) {
                    chunks.push({
                        content: chunkContent,
                        metadata: {
                            startLine: startLine + 1,
                            endLine: endLine + 1,
                            language,
                            filePath,
                            nodeType: currentNode.type,
                            hasContext: this.includeContext
                        }
                    });
                }
                
                // Update parent context for children
                if (this.isContainerNode(currentNode.type, language)) {
                    parentContext = this.extractNodeSignature(currentNode, codeLines);
                }
            }
            
            // Traverse children
            for (let i = 0; i < currentNode.childCount; i++) {
                const child = currentNode.child(i);
                if (child) {
                    traverse(child, parentContext);
                }
            }
        };
        
        traverse(node);
        return chunks;
    }

    /**
     * Extract global context (imports, type definitions, etc.)
     */
    private extractGlobalContext(code: string, language: string): string {
        const lines = code.split('\n');
        const contextLines: string[] = [];
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Language-specific import/include patterns
            if (this.isImportStatement(trimmed, language) || 
                this.isTypeDefinition(trimmed, language) ||
                this.isGlobalDeclaration(trimmed, language)) {
                contextLines.push(line);
            }
            
            // Stop at first function/class definition
            if (this.isMainContentStart(trimmed, language)) {
                break;
            }
        }
        
        return contextLines.join('\n');
    }

    /**
     * Build context for a chunk
     */
    private buildContext(
        globalContext: string,
        parentContext: string,
        codeLines: string[],
        startLine: number,
        language: string
    ): string {
        const contextParts: string[] = [];
        
        // Add global context for certain languages
        if (['typescript', 'javascript', 'java', 'csharp'].includes(language)) {
            if (globalContext) {
                contextParts.push(globalContext);
            }
        }
        
        // Add parent context (e.g., class definition)
        if (parentContext) {
            contextParts.push(parentContext);
        }
        
        // Add surrounding context lines
        if (this.contextLines > 0 && startLine > 0) {
            const contextStart = Math.max(0, startLine - this.contextLines);
            const contextEnd = startLine;
            const surroundingContext = codeLines.slice(contextStart, contextEnd)
                .filter(line => line.trim().length > 0)
                .join('\n');
            
            if (surroundingContext) {
                contextParts.push('// Context:\n' + surroundingContext);
            }
        }
        
        return contextParts.join('\n');
    }

    /**
     * Enhance chunks with natural language descriptions
     */
    private enhanceChunksWithDescriptions(chunks: CodeChunk[], language: string): CodeChunk[] {
        return chunks.map(chunk => {
            const description = this.generateSimpleDescription(chunk.content, language);
            return {
                ...chunk,
                metadata: {
                    ...chunk.metadata,
                    description
                }
            };
        });
    }

    /**
     * Generate simple description for code chunk
     */
    private generateSimpleDescription(content: string, language: string): string {
        const lines = content.split('\n');
        const firstLine = lines.find(l => l.trim().length > 0) || '';
        
        // Extract function/class name
        let description = 'Code block';
        
        if (firstLine.includes('function') || firstLine.includes('def')) {
            const match = firstLine.match(/(?:function|def)\s+(\w+)/);
            if (match) {
                description = `Function: ${match[1]}`;
            }
        } else if (firstLine.includes('class')) {
            const match = firstLine.match(/class\s+(\w+)/);
            if (match) {
                description = `Class: ${match[1]}`;
            }
        } else if (firstLine.includes('interface')) {
            const match = firstLine.match(/interface\s+(\w+)/);
            if (match) {
                description = `Interface: ${match[1]}`;
            }
        }
        
        return description;
    }

    /**
     * Get language configuration
     */
    private getLanguageConfig(language: string): { parser: any; nodeTypes: string[] } | null {
        const normalizedLang = language.toLowerCase();
        const langMap: Record<string, { parser: any; nodeTypes: string[] }> = {
            'javascript': { parser: JavaScript, nodeTypes: SPLITTABLE_NODE_TYPES.javascript },
            'js': { parser: JavaScript, nodeTypes: SPLITTABLE_NODE_TYPES.javascript },
            'jsx': { parser: JavaScript, nodeTypes: SPLITTABLE_NODE_TYPES.jsx },
            'typescript': { parser: TypeScript, nodeTypes: SPLITTABLE_NODE_TYPES.typescript },
            'ts': { parser: TypeScript, nodeTypes: SPLITTABLE_NODE_TYPES.typescript },
            'tsx': { parser: TSX, nodeTypes: SPLITTABLE_NODE_TYPES.tsx },
            'python': { parser: Python, nodeTypes: SPLITTABLE_NODE_TYPES.python },
            'py': { parser: Python, nodeTypes: SPLITTABLE_NODE_TYPES.python },
            'java': { parser: Java, nodeTypes: SPLITTABLE_NODE_TYPES.java },
            'cpp': { parser: Cpp, nodeTypes: SPLITTABLE_NODE_TYPES.cpp },
            'c++': { parser: Cpp, nodeTypes: SPLITTABLE_NODE_TYPES.cpp },
            'c': { parser: Cpp, nodeTypes: SPLITTABLE_NODE_TYPES.cpp },
            'go': { parser: Go, nodeTypes: SPLITTABLE_NODE_TYPES.go },
            'rust': { parser: Rust, nodeTypes: SPLITTABLE_NODE_TYPES.rust },
            'rs': { parser: Rust, nodeTypes: SPLITTABLE_NODE_TYPES.rust },
            'cs': { parser: CSharp, nodeTypes: SPLITTABLE_NODE_TYPES.csharp },
            'csharp': { parser: CSharp, nodeTypes: SPLITTABLE_NODE_TYPES.csharp },
            'scala': { parser: Scala, nodeTypes: SPLITTABLE_NODE_TYPES.scala },
            
            // Additional languages (uncomment when parsers are installed)
            // 'kotlin': { parser: Kotlin, nodeTypes: SPLITTABLE_NODE_TYPES.kotlin },
            // 'kt': { parser: Kotlin, nodeTypes: SPLITTABLE_NODE_TYPES.kotlin },
            // 'php': { parser: PHP, nodeTypes: SPLITTABLE_NODE_TYPES.php },
            // 'ruby': { parser: Ruby, nodeTypes: SPLITTABLE_NODE_TYPES.ruby },
            // 'rb': { parser: Ruby, nodeTypes: SPLITTABLE_NODE_TYPES.ruby },
            // 'swift': { parser: Swift, nodeTypes: SPLITTABLE_NODE_TYPES.swift },
            // 'dart': { parser: Dart, nodeTypes: SPLITTABLE_NODE_TYPES.dart },
            // 'elixir': { parser: Elixir, nodeTypes: SPLITTABLE_NODE_TYPES.elixir },
            // 'ex': { parser: Elixir, nodeTypes: SPLITTABLE_NODE_TYPES.elixir },
            // 'zig': { parser: Zig, nodeTypes: SPLITTABLE_NODE_TYPES.zig },
        };
        
        return langMap[normalizedLang] || null;
    }

    /**
     * Check if statement is an import
     */
    private isImportStatement(line: string, language: string): boolean {
        const patterns: Record<string, RegExp[]> = {
            javascript: [/^import\s/, /^const\s+\w+\s*=\s*require/],
            typescript: [/^import\s/, /^const\s+\w+\s*=\s*require/],
            python: [/^import\s/, /^from\s/],
            java: [/^import\s/],
            csharp: [/^using\s/],
            go: [/^import\s/],
            rust: [/^use\s/],
            php: [/^use\s/, /^require/, /^include/],
            ruby: [/^require\s/, /^require_relative/],
            kotlin: [/^import\s/],
            swift: [/^import\s/],
        };
        
        const langPatterns = patterns[language] || [];
        return langPatterns.some(pattern => pattern.test(line));
    }

    /**
     * Check if statement is a type definition
     */
    private isTypeDefinition(line: string, language: string): boolean {
        const patterns: Record<string, RegExp[]> = {
            typescript: [/^type\s/, /^interface\s/, /^enum\s/],
            java: [/^@interface\s/],
            csharp: [/^delegate\s/],
            kotlin: [/^typealias\s/],
            swift: [/^typealias\s/, /^protocol\s/],
        };
        
        const langPatterns = patterns[language] || [];
        return langPatterns.some(pattern => pattern.test(line));
    }

    /**
     * Check if statement is a global declaration
     */
    private isGlobalDeclaration(line: string, language: string): boolean {
        const patterns: Record<string, RegExp[]> = {
            javascript: [/^const\s+[A-Z_]+\s*=/, /^let\s+[A-Z_]+\s*=/],
            typescript: [/^const\s+[A-Z_]+\s*=/, /^let\s+[A-Z_]+\s*=/],
            python: [/^[A-Z_]+\s*=/],
            java: [/^public\s+static\s+final/],
            csharp: [/^public\s+const/, /^public\s+static\s+readonly/],
        };
        
        const langPatterns = patterns[language] || [];
        return langPatterns.some(pattern => pattern.test(line));
    }

    /**
     * Check if main content starts
     */
    private isMainContentStart(line: string, language: string): boolean {
        const keywords = ['class', 'function', 'def', 'interface', 'struct', 'enum'];
        return keywords.some(keyword => line.startsWith(keyword));
    }

    /**
     * Check if node is a container
     */
    private isContainerNode(nodeType: string, language: string): boolean {
        const containerTypes = [
            'class_declaration', 'class_definition', 'interface_declaration',
            'struct_declaration', 'enum_declaration', 'module_definition'
        ];
        return containerTypes.includes(nodeType);
    }

    /**
     * Extract node signature (e.g., class definition line)
     */
    private extractNodeSignature(node: Parser.SyntaxNode, codeLines: string[]): string {
        const startLine = node.startPosition.row;
        const line = codeLines[startLine];
        
        // For classes/interfaces, get the declaration line
        if (line.includes('{')) {
            return line.substring(0, line.indexOf('{') + 1);
        }
        
        return line;
    }

    /**
     * Cleanup tree to prevent memory leaks
     */
    private cleanupTree(tree: Parser.Tree | null): void {
        if (!tree) return;
        
        try {
            this.treeCleanupQueue.add(tree);
            if (typeof (tree as any).delete === 'function') {
                (tree as any).delete();
                this.treeCleanupQueue.delete(tree);
            }
        } catch (error) {
            console.warn(`⚠️  Warning: Failed to cleanup tree: ${error}`);
            this.treeCleanupQueue.delete(tree);
        }
    }

    /**
     * Get supported languages
     */
    static getSupportedLanguages(): string[] {
        return [
            'javascript', 'js', 'jsx',
            'typescript', 'ts', 'tsx',
            'python', 'py',
            'java',
            'cpp', 'c++', 'c',
            'go',
            'rust', 'rs',
            'csharp', 'cs',
            'scala',
            // Additional when parsers installed:
            // 'kotlin', 'kt',
            // 'php',
            // 'ruby', 'rb',
            // 'swift',
            // 'dart',
            // 'elixir', 'ex',
            // 'zig'
        ];
    }

    setChunkSize(chunkSize: number): void {
        this.chunkSize = chunkSize;
        this.langchainFallback.setChunkSize(chunkSize);
    }

    setChunkOverlap(chunkOverlap: number): void {
        this.chunkOverlap = chunkOverlap;
        this.langchainFallback.setChunkOverlap(chunkOverlap);
    }

    dispose(): void {
        try {
            console.log('🧹 Disposing Enhanced AST splitter resources...');
            
            // Cleanup remaining trees
            for (const tree of this.treeCleanupQueue) {
                try {
                    if (typeof (tree as any).delete === 'function') {
                        (tree as any).delete();
                    }
                } catch (error) {
                    // Ignore errors during cleanup
                }
            }
            this.treeCleanupQueue.clear();
            
            // Destroy parser pool
            this.parserPool.destroy();
            
            // Dispose fallback
            if (this.langchainFallback && typeof this.langchainFallback.dispose === 'function') {
                this.langchainFallback.dispose();
            }
            
            console.log('✅ Enhanced AST splitter resources disposed');
        } catch (error) {
            console.warn(`⚠️  Warning: Failed to dispose Enhanced AST splitter: ${error}`);
        }
    }
}