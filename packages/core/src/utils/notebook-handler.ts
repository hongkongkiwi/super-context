/**
 * Enhanced Jupyter Notebook (.ipynb) handling
 */

import * as fs from 'fs';
import { CodeChunk } from '../splitter';

export interface NotebookCell {
    cellType: 'code' | 'markdown' | 'raw';
    source: string[];
    outputs?: any[];
    executionCount?: number;
    metadata?: Record<string, any>;
}

export interface NotebookDocument {
    cells: NotebookCell[];
    metadata: {
        language?: string;
        kernelspec?: {
            name: string;
            language: string;
        };
    };
    nbformat: number;
    nbformatMinor: number;
}

export interface ProcessedNotebookChunk extends CodeChunk {
    cellType: 'code' | 'markdown' | 'raw';
    cellIndex: number;
    hasOutput: boolean;
    outputSummary?: string;
}

/**
 * Handles Jupyter Notebook processing and chunking
 */
export class NotebookHandler {
    private includeOutputs: boolean;
    private includeMarkdown: boolean;
    private maxOutputLength: number;

    constructor(
        includeOutputs: boolean = true,
        includeMarkdown: boolean = true,
        maxOutputLength: number = 500
    ) {
        this.includeOutputs = includeOutputs;
        this.includeMarkdown = includeMarkdown;
        this.maxOutputLength = maxOutputLength;
    }

    /**
     * Parse notebook file
     */
    async parseNotebook(filePath: string): Promise<NotebookDocument> {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        return JSON.parse(content) as NotebookDocument;
    }

    /**
     * Process notebook into chunks
     */
    async processNotebook(
        filePath: string,
        chunkSize: number = 500
    ): Promise<ProcessedNotebookChunk[]> {
        const notebook = await this.parseNotebook(filePath);
        const chunks: ProcessedNotebookChunk[] = [];
        const language = this.detectLanguage(notebook);

        for (let cellIndex = 0; cellIndex < notebook.cells.length; cellIndex++) {
            const cell = notebook.cells[cellIndex];
            
            // Skip empty cells
            if (!cell.source || cell.source.length === 0) {
                continue;
            }

            // Process based on cell type
            if (cell.cellType === 'code') {
                const codeChunks = await this.processCodeCell(
                    cell,
                    cellIndex,
                    language,
                    filePath,
                    chunkSize
                );
                chunks.push(...codeChunks);
            } else if (cell.cellType === 'markdown' && this.includeMarkdown) {
                const markdownChunks = this.processMarkdownCell(
                    cell,
                    cellIndex,
                    filePath,
                    chunkSize
                );
                chunks.push(...markdownChunks);
            }
        }

        // Add notebook-level context
        return this.addNotebookContext(chunks, notebook);
    }

    /**
     * Process code cell
     */
    private async processCodeCell(
        cell: NotebookCell,
        cellIndex: number,
        language: string,
        filePath: string,
        chunkSize: number
    ): Promise<ProcessedNotebookChunk[]> {
        const chunks: ProcessedNotebookChunk[] = [];
        const source = this.joinSource(cell.source);
        
        // Split large code cells
        const codeChunks = this.splitContent(source, chunkSize);
        
        for (let i = 0; i < codeChunks.length; i++) {
            const chunk: ProcessedNotebookChunk = {
                content: codeChunks[i],
                metadata: {
                    startLine: this.calculateStartLine(cell, i),
                    endLine: this.calculateEndLine(cell, i, codeChunks[i]),
                    language,
                    filePath,
                    isNotebook: true,
                    cellNumber: cellIndex + 1
                },
                cellType: 'code',
                cellIndex,
                hasOutput: !!cell.outputs && cell.outputs.length > 0
            };

            // Add output summary if available
            if (this.includeOutputs && cell.outputs && cell.outputs.length > 0) {
                chunk.outputSummary = this.summarizeOutputs(cell.outputs);
                
                // Append output summary to content
                if (chunk.outputSummary) {
                    chunk.content += `\n\n# Output:\n${chunk.outputSummary}`;
                }
            }

            chunks.push(chunk);
        }

        return chunks;
    }

    /**
     * Process markdown cell
     */
    private processMarkdownCell(
        cell: NotebookCell,
        cellIndex: number,
        filePath: string,
        chunkSize: number
    ): ProcessedNotebookChunk[] {
        const chunks: ProcessedNotebookChunk[] = [];
        const source = this.joinSource(cell.source);
        
        // Split large markdown cells
        const markdownChunks = this.splitContent(source, chunkSize);
        
        for (let i = 0; i < markdownChunks.length; i++) {
            chunks.push({
                content: markdownChunks[i],
                metadata: {
                    startLine: this.calculateStartLine(cell, i),
                    endLine: this.calculateEndLine(cell, i, markdownChunks[i]),
                    language: 'markdown',
                    filePath,
                    isNotebook: true,
                    cellNumber: cellIndex + 1
                },
                cellType: 'markdown',
                cellIndex,
                hasOutput: false
            });
        }

        return chunks;
    }

    /**
     * Add notebook-level context to chunks
     */
    private addNotebookContext(
        chunks: ProcessedNotebookChunk[],
        notebook: NotebookDocument
    ): ProcessedNotebookChunk[] {
        // Extract imports and setup code
        const setupCode = this.extractSetupCode(notebook);
        
        if (!setupCode) {
            return chunks;
        }

        // Add setup code as context to non-setup chunks
        return chunks.map(chunk => {
            if (chunk.cellIndex > 2 && chunk.cellType === 'code') {
                // Add setup context
                chunk.content = `# Notebook Setup Context:\n${setupCode}\n\n# Cell ${chunk.cellIndex + 1}:\n${chunk.content}`;
            }
            return chunk;
        });
    }

    /**
     * Extract setup code (imports, configurations)
     */
    private extractSetupCode(notebook: NotebookDocument): string | null {
        const setupLines: string[] = [];
        const maxSetupCells = 3; // Look at first 3 cells for setup

        for (let i = 0; i < Math.min(maxSetupCells, notebook.cells.length); i++) {
            const cell = notebook.cells[i];
            if (cell.cellType === 'code') {
                const source = this.joinSource(cell.source);
                const lines = source.split('\n');
                
                for (const line of lines) {
                    if (this.isSetupCode(line)) {
                        setupLines.push(line);
                    }
                }
            }
        }

        return setupLines.length > 0 ? setupLines.join('\n') : null;
    }

    /**
     * Check if line is setup code
     */
    private isSetupCode(line: string): boolean {
        const patterns = [
            /^import\s/,
            /^from\s.*import/,
            /^%matplotlib/,
            /^%load_ext/,
            /^!pip install/,
            /^!conda install/,
            /^pd\.set_option/,
            /^np\.set_printoptions/,
            /^plt\.style\.use/,
            /^sns\.set/
        ];
        
        return patterns.some(pattern => pattern.test(line.trim()));
    }

    /**
     * Summarize cell outputs
     */
    private summarizeOutputs(outputs: any[]): string {
        const summaries: string[] = [];
        
        for (const output of outputs) {
            if (output.output_type === 'execute_result' || output.output_type === 'display_data') {
                // Handle different output types
                if (output.data) {
                    if (output.data['text/plain']) {
                        let text = this.joinSource(output.data['text/plain']);
                        if (text.length > this.maxOutputLength) {
                            text = text.substring(0, this.maxOutputLength) + '...';
                        }
                        summaries.push(text);
                    } else if (output.data['text/html']) {
                        summaries.push('[HTML Output]');
                    } else if (output.data['image/png']) {
                        summaries.push('[Image Output]');
                    } else if (output.data['application/json']) {
                        summaries.push('[JSON Output]');
                    }
                }
            } else if (output.output_type === 'stream') {
                let text = this.joinSource(output.text);
                if (text.length > this.maxOutputLength) {
                    text = text.substring(0, this.maxOutputLength) + '...';
                }
                summaries.push(`[${output.name}]: ${text}`);
            } else if (output.output_type === 'error') {
                summaries.push(`[Error]: ${output.ename}: ${output.evalue}`);
            }
        }
        
        return summaries.join('\n');
    }

    /**
     * Detect notebook language
     */
    private detectLanguage(notebook: NotebookDocument): string {
        if (notebook.metadata?.kernelspec?.language) {
            return notebook.metadata.kernelspec.language;
        }
        
        if (notebook.metadata?.language) {
            return notebook.metadata.language;
        }
        
        // Default to Python for Jupyter notebooks
        return 'python';
    }

    /**
     * Join source lines
     */
    private joinSource(source: string | string[]): string {
        if (Array.isArray(source)) {
            return source.join('');
        }
        return source;
    }

    /**
     * Split content into chunks
     */
    private splitContent(content: string, chunkSize: number): string[] {
        const chunks: string[] = [];
        const lines = content.split('\n');
        let currentChunk = '';
        
        for (const line of lines) {
            if (currentChunk.length + line.length > chunkSize && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = line;
            } else {
                currentChunk += (currentChunk ? '\n' : '') + line;
            }
        }
        
        if (currentChunk) {
            chunks.push(currentChunk);
        }
        
        return chunks;
    }

    /**
     * Calculate start line for chunk
     */
    private calculateStartLine(cell: NotebookCell, chunkIndex: number): number {
        // Approximate line number (notebooks don't have traditional line numbers)
        return chunkIndex * 20 + 1;
    }

    /**
     * Calculate end line for chunk
     */
    private calculateEndLine(cell: NotebookCell, chunkIndex: number, content: string): number {
        const lines = content.split('\n').length;
        return this.calculateStartLine(cell, chunkIndex) + lines - 1;
    }

    /**
     * Extract code from all cells
     */
    async extractAllCode(filePath: string): Promise<string> {
        const notebook = await this.parseNotebook(filePath);
        const codeParts: string[] = [];
        
        for (const cell of notebook.cells) {
            if (cell.cellType === 'code') {
                codeParts.push(this.joinSource(cell.source));
            }
        }
        
        return codeParts.join('\n\n');
    }

    /**
     * Extract markdown documentation
     */
    async extractDocumentation(filePath: string): Promise<string> {
        const notebook = await this.parseNotebook(filePath);
        const docParts: string[] = [];
        
        for (const cell of notebook.cells) {
            if (cell.cellType === 'markdown') {
                docParts.push(this.joinSource(cell.source));
            }
        }
        
        return docParts.join('\n\n');
    }

    /**
     * Get notebook statistics
     */
    async getNotebookStats(filePath: string): Promise<{
        totalCells: number;
        codeCells: number;
        markdownCells: number;
        totalLines: number;
        hasOutputs: boolean;
        language: string;
    }> {
        const notebook = await this.parseNotebook(filePath);
        let totalLines = 0;
        let codeCells = 0;
        let markdownCells = 0;
        let hasOutputs = false;
        
        for (const cell of notebook.cells) {
            const source = this.joinSource(cell.source);
            totalLines += source.split('\n').length;
            
            if (cell.cellType === 'code') {
                codeCells++;
                if (cell.outputs && cell.outputs.length > 0) {
                    hasOutputs = true;
                }
            } else if (cell.cellType === 'markdown') {
                markdownCells++;
            }
        }
        
        return {
            totalCells: notebook.cells.length,
            codeCells,
            markdownCells,
            totalLines,
            hasOutputs,
            language: this.detectLanguage(notebook)
        };
    }
}