import Parser from 'tree-sitter';
import { Splitter, CodeChunk } from './index';
import { ResourcePool } from '../utils/mutex';

// Language parsers
const JavaScript = require('tree-sitter-javascript');
const TypeScript = require('tree-sitter-typescript').typescript;
const Python = require('tree-sitter-python');
const Java = require('tree-sitter-java');
const Cpp = require('tree-sitter-cpp');
const Go = require('tree-sitter-go');
const Rust = require('tree-sitter-rust');
const CSharp = require('tree-sitter-c-sharp');
const Scala = require('tree-sitter-scala');

// Node types that represent logical code units
const SPLITTABLE_NODE_TYPES = {
    javascript: ['function_declaration', 'arrow_function', 'class_declaration', 'method_definition', 'export_statement'],
    typescript: ['function_declaration', 'arrow_function', 'class_declaration', 'method_definition', 'export_statement', 'interface_declaration', 'type_alias_declaration'],
    python: ['function_definition', 'class_definition', 'decorated_definition', 'async_function_definition'],
    java: ['method_declaration', 'class_declaration', 'interface_declaration', 'constructor_declaration'],
    cpp: ['function_definition', 'class_specifier', 'namespace_definition', 'declaration'],
    go: ['function_declaration', 'method_declaration', 'type_declaration', 'var_declaration', 'const_declaration'],
    rust: ['function_item', 'impl_item', 'struct_item', 'enum_item', 'trait_item', 'mod_item'],
    csharp: ['method_declaration', 'class_declaration', 'interface_declaration', 'struct_declaration', 'enum_declaration'],
    scala: ['method_declaration', 'class_declaration', 'interface_declaration', 'constructor_declaration']
};

export class AstCodeSplitter implements Splitter {
    private chunkSize: number = 2500;
    private chunkOverlap: number = 300;
    private parserPool: ResourcePool<Parser>;
    private langchainFallback: any | null = null; // Lazy-initialized LangChainCodeSplitter for fallback
    private treeCleanupQueue: Set<Parser.Tree> = new Set();

    constructor(chunkSize?: number, chunkOverlap?: number) {
        if (chunkSize) this.chunkSize = chunkSize;
        if (chunkOverlap) this.chunkOverlap = chunkOverlap;
        
        // Create a resource pool for parsers to prevent memory leaks
        this.parserPool = new ResourcePool<Parser>(
            () => new Parser(),
            (parser: Parser) => {
                // Cleanup parser resources
                try {
                    // Delete any existing language to free memory
                    parser.reset();
                } catch (error) {
                    console.warn(`⚠️  Warning: Failed to reset parser during cleanup: ${error}`);
                }
            },
            2, // Initial pool size
            5  // Max pool size
        );

        // Fallback splitter will be lazily imported to avoid circular imports and bundler issues
        this.langchainFallback = null;
    }

    /**
     * Split generic text using the fallback splitter
     */
    splitText(text: string): string[] {
        if (!text) return [];
        const approximateSize = this.chunkSize;
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += approximateSize) {
            chunks.push(text.slice(i, Math.min(i + approximateSize, text.length)));
        }
        return chunks;
    }

    private async getFallbackSplitter(): Promise<any> {
        if (this.langchainFallback) return this.langchainFallback;
        try {
            const mod = await import('./langchain-splitter');
            this.langchainFallback = new (mod as any).LangChainCodeSplitter(this.chunkSize, this.chunkOverlap);
        } catch (e) {
            console.warn('Failed to load langchain-splitter, using basic splitter fallback');
            // If langchain-splitter fails to load, return a basic splitter
            this.langchainFallback = {
                split: async (code: string, language: string, filePath?: string) => {
                    // Basic fallback implementation
                    const lines = code.split('\n');
                    const chunks: any[] = [];
                    let currentChunk = '';
                    let startLine = 1;
                    
                    for (let i = 0; i < lines.length; i++) {
                        currentChunk += lines[i] + '\n';
                        if (currentChunk.length > this.chunkSize || i === lines.length - 1) {
                            chunks.push({
                                content: currentChunk.trim(),
                                metadata: {
                                    startLine,
                                    endLine: i + 1,
                                    language,
                                    filePath
                                }
                            });
                            currentChunk = '';
                            startLine = i + 2;
                        }
                    }
                    return chunks;
                }
            };
        }
        return this.langchainFallback;
    }

    async split(code: string, language: string, filePath?: string): Promise<CodeChunk[]> {
        // Check if language is supported by AST splitter
        const langConfig = this.getLanguageConfig(language);
        if (!langConfig) {
            console.log(`📝 Language ${language} not supported by AST, using LangChain splitter for: ${filePath || 'unknown'}`);
            const fallback = await this.getFallbackSplitter();
            return await fallback.split(code, language, filePath);
        }

        // Use resource pool to get a parser and ensure proper cleanup
        return await this.parserPool.runWithResource(async (parser: Parser) => {
            let tree: Parser.Tree | null = null;
            try {
                console.log(`🌳 Using AST splitter for ${language} file: ${filePath || 'unknown'}`);

                parser.setLanguage(langConfig.parser);
                tree = parser.parse(code);

                if (!tree?.rootNode) {
                console.warn(`⚠️  Failed to parse AST for ${language}, falling back to LangChain: ${filePath || 'unknown'}`);
                const fallback = await this.getFallbackSplitter();
                return await fallback.split(code, language, filePath);
                }

                // Extract chunks based on AST nodes
                const chunks = this.extractChunks(tree.rootNode, code, langConfig.nodeTypes, language, filePath);

                // If chunks are too large, split them further
                const refinedChunks = await this.refineChunks(chunks, code);

                return refinedChunks;
            } catch (error) {
                console.warn(`⚠️  AST splitter failed for ${language}, falling back to LangChain: ${error}`);
                const fallback = await this.getFallbackSplitter();
                return await fallback.split(code, language, filePath);
            } finally {
                // CRITICAL: Always clean up the tree to prevent memory leaks
                this.cleanupTree(tree);
            }
        });
    }

    setChunkSize(chunkSize: number): void {
        this.chunkSize = chunkSize;
        this.langchainFallback.setChunkSize(chunkSize);
    }

    setChunkOverlap(chunkOverlap: number): void {
        this.chunkOverlap = chunkOverlap;
        this.langchainFallback.setChunkOverlap(chunkOverlap);
    }

    private getLanguageConfig(language: string): { parser: any; nodeTypes: string[] } | null {
        const langMap: Record<string, { parser: any; nodeTypes: string[] }> = {
            'javascript': { parser: JavaScript, nodeTypes: SPLITTABLE_NODE_TYPES.javascript },
            'js': { parser: JavaScript, nodeTypes: SPLITTABLE_NODE_TYPES.javascript },
            'typescript': { parser: TypeScript, nodeTypes: SPLITTABLE_NODE_TYPES.typescript },
            'ts': { parser: TypeScript, nodeTypes: SPLITTABLE_NODE_TYPES.typescript },
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
            'scala': { parser: Scala, nodeTypes: SPLITTABLE_NODE_TYPES.scala }
        };

        return langMap[language.toLowerCase()] || null;
    }

    private extractChunks(
        node: Parser.SyntaxNode,
        code: string,
        splittableTypes: string[],
        language: string,
        filePath?: string
    ): CodeChunk[] {
        const chunks: CodeChunk[] = [];
        const codeLines = code.split('\n');

        const traverse = (currentNode: Parser.SyntaxNode) => {
            // Check if this node type should be split into a chunk
            if (splittableTypes.includes(currentNode.type)) {
                const startLine = currentNode.startPosition.row + 1;
                const endLine = currentNode.endPosition.row + 1;
                const nodeText = code.slice(currentNode.startIndex, currentNode.endIndex);

                // Only create chunk if it has meaningful content
                if (nodeText.trim().length > 0) {
                    chunks.push({
                        content: nodeText,
                        metadata: {
                            startLine,
                            endLine,
                            language,
                            filePath,
                        }
                    });
                }
            }

            // Continue traversing child nodes
            for (const child of currentNode.children) {
                traverse(child);
            }
        };

        traverse(node);

        // If no meaningful chunks found, create a single chunk with the entire code
        if (chunks.length === 0) {
            chunks.push({
                content: code,
                metadata: {
                    startLine: 1,
                    endLine: codeLines.length,
                    language,
                    filePath,
                }
            });
        }

        return chunks;
    }

    private async refineChunks(chunks: CodeChunk[], originalCode: string): Promise<CodeChunk[]> {
        const refinedChunks: CodeChunk[] = [];

        for (const chunk of chunks) {
            if (chunk.content.length <= this.chunkSize) {
                refinedChunks.push(chunk);
            } else {
                // Split large chunks using character-based splitting
                const subChunks = this.splitLargeChunk(chunk, originalCode);
                refinedChunks.push(...subChunks);
            }
        }

        return this.addOverlap(refinedChunks);
    }

    private splitLargeChunk(chunk: CodeChunk, originalCode: string): CodeChunk[] {
        const lines = chunk.content.split('\n');
        const subChunks: CodeChunk[] = [];
        let currentChunk = '';
        let currentStartLine = chunk.metadata.startLine;
        let currentLineCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineWithNewline = i === lines.length - 1 ? line : line + '\n';

            if (currentChunk.length + lineWithNewline.length > this.chunkSize && currentChunk.length > 0) {
                // Create a sub-chunk
                subChunks.push({
                    content: currentChunk.trim(),
                    metadata: {
                        startLine: currentStartLine,
                        endLine: currentStartLine + currentLineCount - 1,
                        language: chunk.metadata.language,
                        filePath: chunk.metadata.filePath,
                    }
                });

                currentChunk = lineWithNewline;
                currentStartLine = chunk.metadata.startLine + i;
                currentLineCount = 1;
            } else {
                currentChunk += lineWithNewline;
                currentLineCount++;
            }
        }

        // Add the last sub-chunk
        if (currentChunk.trim().length > 0) {
            subChunks.push({
                content: currentChunk.trim(),
                metadata: {
                    startLine: currentStartLine,
                    endLine: currentStartLine + currentLineCount - 1,
                    language: chunk.metadata.language,
                    filePath: chunk.metadata.filePath,
                }
            });
        }

        return subChunks;
    }

    private addOverlap(chunks: CodeChunk[]): CodeChunk[] {
        if (chunks.length <= 1 || this.chunkOverlap <= 0) {
            return chunks;
        }

        const overlappedChunks: CodeChunk[] = [];

        for (let i = 0; i < chunks.length; i++) {
            let content = chunks[i].content;
            const metadata = { ...chunks[i].metadata };

            // Add overlap from previous chunk
            if (i > 0 && this.chunkOverlap > 0) {
                const prevChunk = chunks[i - 1];
                const overlapText = prevChunk.content.slice(-this.chunkOverlap);
                content = overlapText + '\n' + content;
                metadata.startLine = Math.max(1, metadata.startLine - this.getLineCount(overlapText));
            }

            overlappedChunks.push({
                content,
                metadata
            });
        }

        return overlappedChunks;
    }

    private getLineCount(text: string): number {
        return text.split('\n').length;
    }

    /**
     * Check if AST splitting is supported for the given language
     */
    static isLanguageSupported(language: string): boolean {
        const supportedLanguages = [
            'javascript', 'js', 'typescript', 'ts', 'python', 'py',
            'java', 'cpp', 'c++', 'c', 'go', 'rust', 'rs', 'cs', 'csharp', 'scala'
        ];
        return supportedLanguages.includes(language.toLowerCase());
    }

    /**
     * Return list of supported languages for AST-based splitting
     */
    static getSupportedLanguages(): string[] {
        return [
            'javascript', 'js', 'typescript', 'ts', 'python', 'py',
            'java', 'cpp', 'c++', 'c', 'go', 'rust', 'rs', 'cs', 'csharp', 'scala'
        ];
    }

    /**
     * Safely cleanup tree-sitter tree to prevent memory leaks
     */
    private cleanupTree(tree: Parser.Tree | null): void {
        if (!tree) return;
        
        try {
            // Mark tree for cleanup
            this.treeCleanupQueue.add(tree);
            
            // Tree-sitter trees need explicit deletion to free native memory
            if (typeof (tree as any).delete === 'function') {
                (tree as any).delete();
                this.treeCleanupQueue.delete(tree);
            } else {
                // Fallback: let GC handle it but warn
                console.warn(`⚠️  Warning: Tree delete method not available, relying on GC`);
            }
        } catch (error) {
            console.warn(`⚠️  Warning: Failed to cleanup tree: ${error}`);
            // Remove from queue even on error to prevent memory buildup
            this.treeCleanupQueue.delete(tree);
        }
    }

    /**
     * Force cleanup of any remaining trees
     */
    private forceCleanupAllTrees(): void {
        if (this.treeCleanupQueue.size > 0) {
            console.warn(`⚠️  Forcing cleanup of ${this.treeCleanupQueue.size} remaining trees`);
            for (const tree of this.treeCleanupQueue) {
                try {
                    if (typeof (tree as any).delete === 'function') {
                        (tree as any).delete();
                    }
                } catch (error) {
                    // Ignore errors during forced cleanup
                }
            }
            this.treeCleanupQueue.clear();
        }
    }

    /**
     * Dispose of all resources and clean up memory
     * IMPORTANT: Call this when done using the AST splitter to prevent memory leaks
     */
    dispose(): void {
        try {
            console.log('🧹 Disposing AST splitter resources...');
            
            // Force cleanup any remaining trees
            this.forceCleanupAllTrees();
            
            // Destroy parser pool
            this.parserPool.destroy();
            
            // Also dispose the LangChain fallback if it has a dispose method
            if (this.langchainFallback && typeof this.langchainFallback.dispose === 'function') {
                this.langchainFallback.dispose();
            }
            
            console.log('✅ AST splitter resources disposed');
        } catch (error) {
            console.warn(`⚠️  Warning: Failed to dispose AST splitter resources: ${error}`);
        }
    }
}
