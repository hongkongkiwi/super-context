/**
 * Code similarity detection and duplicate finding
 */

import * as crypto from 'crypto';

export interface SimilarityResult {
    file1: string;
    file2: string;
    similarity: number;
    type: 'exact' | 'near' | 'structural';
    details?: {
        matchedLines?: number;
        totalLines?: number;
        matchedTokens?: number;
        totalTokens?: number;
    };
}

export interface CodeFingerprint {
    hash: string;
    structure: string;
    tokens: string[];
    metrics: {
        lines: number;
        complexity: number;
        uniqueTokens: number;
    };
}

/**
 * Advanced code similarity analyzer
 */
export class CodeSimilarityAnalyzer {
    private fingerprintCache = new Map<string, CodeFingerprint>();
    private similarityThreshold = 0.8;

    constructor(similarityThreshold: number = 0.8) {
        this.similarityThreshold = similarityThreshold;
    }

    /**
     * Find duplicate or similar code blocks
     */
    async findDuplicates(
        codeBlocks: Array<{ id: string; content: string; language: string }>
    ): Promise<SimilarityResult[]> {
        const results: SimilarityResult[] = [];
        const fingerprints = new Map<string, CodeFingerprint>();

        // Generate fingerprints for all blocks
        for (const block of codeBlocks) {
            const fingerprint = this.generateFingerprint(block.content, block.language);
            fingerprints.set(block.id, fingerprint);
        }

        // Compare all pairs
        const blockIds = Array.from(fingerprints.keys());
        for (let i = 0; i < blockIds.length; i++) {
            for (let j = i + 1; j < blockIds.length; j++) {
                const id1 = blockIds[i];
                const id2 = blockIds[j];
                const fp1 = fingerprints.get(id1)!;
                const fp2 = fingerprints.get(id2)!;

                const similarity = this.calculateSimilarity(fp1, fp2);
                
                if (similarity >= this.similarityThreshold) {
                    results.push({
                        file1: id1,
                        file2: id2,
                        similarity,
                        type: this.classifySimilarity(similarity),
                        details: {
                            matchedTokens: this.countMatchingTokens(fp1.tokens, fp2.tokens),
                            totalTokens: Math.max(fp1.tokens.length, fp2.tokens.length)
                        }
                    });
                }
            }
        }

        return results;
    }

    /**
     * Generate fingerprint for code block
     */
    generateFingerprint(content: string, language: string): CodeFingerprint {
        // Check cache
        const cacheKey = this.hashContent(content);
        if (this.fingerprintCache.has(cacheKey)) {
            return this.fingerprintCache.get(cacheKey)!;
        }

        // Tokenize and normalize
        const tokens = this.tokenize(content, language);
        const normalizedTokens = this.normalizeTokens(tokens);
        
        // Extract structure
        const structure = this.extractStructure(content, language);
        
        // Calculate metrics
        const metrics = {
            lines: content.split('\n').length,
            complexity: this.calculateComplexity(content, language),
            uniqueTokens: new Set(normalizedTokens).size
        };

        const fingerprint: CodeFingerprint = {
            hash: cacheKey,
            structure,
            tokens: normalizedTokens,
            metrics
        };

        this.fingerprintCache.set(cacheKey, fingerprint);
        return fingerprint;
    }

    /**
     * Tokenize code content
     */
    private tokenize(content: string, language: string): string[] {
        // Remove comments based on language
        const withoutComments = this.removeComments(content, language);
        
        // Split into tokens
        const tokens = withoutComments
            .split(/[\s\{\}\(\)\[\];,.<>!=\+\-\*\/\&\|\^~\?:]+/)
            .filter(token => token.length > 0);

        return tokens;
    }

    /**
     * Remove comments from code
     */
    private removeComments(content: string, language: string): string {
        let result = content;

        // Language-specific comment removal
        if (['javascript', 'typescript', 'java', 'cpp', 'c', 'go', 'rust'].includes(language)) {
            // Remove single-line comments
            result = result.replace(/\/\/.*$/gm, '');
            // Remove multi-line comments
            result = result.replace(/\/\*[\s\S]*?\*\//g, '');
        } else if (['python', 'ruby', 'shell'].includes(language)) {
            // Remove # comments
            result = result.replace(/#.*$/gm, '');
            // Remove Python docstrings
            if (language === 'python') {
                result = result.replace(/"""[\s\S]*?"""/g, '');
                result = result.replace(/'''[\s\S]*?'''/g, '');
            }
        }

        return result;
    }

    /**
     * Normalize tokens for comparison
     */
    private normalizeTokens(tokens: string[]): string[] {
        return tokens.map(token => {
            // Normalize variable names to generic placeholders
            if (this.isVariableName(token)) {
                return 'VAR';
            }
            // Normalize string literals
            if (this.isStringLiteral(token)) {
                return 'STR';
            }
            // Normalize numbers
            if (this.isNumber(token)) {
                return 'NUM';
            }
            return token.toLowerCase();
        });
    }

    /**
     * Extract structural signature
     */
    private extractStructure(content: string, language: string): string {
        const lines = content.split('\n');
        const structure: string[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            
            // Extract structural keywords
            if (this.isStructuralLine(trimmed, language)) {
                // Remove specific names, keep structure
                const genericized = trimmed
                    .replace(/\b[a-zA-Z_]\w*\b/g, (match) => {
                        if (this.isKeyword(match, language)) {
                            return match;
                        }
                        return '_';
                    });
                structure.push(genericized);
            }
        }

        return structure.join('|');
    }

    /**
     * Check if line is structural
     */
    private isStructuralLine(line: string, language: string): boolean {
        const structuralKeywords: Record<string, string[]> = {
            javascript: ['function', 'class', 'if', 'for', 'while', 'switch', 'return'],
            typescript: ['function', 'class', 'interface', 'type', 'if', 'for', 'while', 'switch', 'return'],
            python: ['def', 'class', 'if', 'for', 'while', 'return', 'yield'],
            java: ['class', 'interface', 'public', 'private', 'protected', 'if', 'for', 'while', 'switch', 'return'],
            go: ['func', 'type', 'struct', 'interface', 'if', 'for', 'switch', 'return'],
            rust: ['fn', 'struct', 'enum', 'impl', 'trait', 'if', 'for', 'while', 'match', 'return']
        };

        const keywords = structuralKeywords[language] || [];
        return keywords.some(keyword => line.startsWith(keyword));
    }

    /**
     * Check if token is a keyword
     */
    private isKeyword(token: string, language: string): boolean {
        const keywords: Record<string, Set<string>> = {
            javascript: new Set(['function', 'class', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'new', 'this']),
            typescript: new Set(['function', 'class', 'interface', 'type', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'new', 'this']),
            python: new Set(['def', 'class', 'if', 'elif', 'else', 'for', 'while', 'return', 'yield', 'import', 'from', 'as']),
            java: new Set(['class', 'interface', 'public', 'private', 'protected', 'static', 'final', 'if', 'else', 'for', 'while', 'return', 'new', 'this']),
            go: new Set(['func', 'type', 'struct', 'interface', 'if', 'else', 'for', 'switch', 'return', 'defer', 'go', 'chan']),
            rust: new Set(['fn', 'struct', 'enum', 'impl', 'trait', 'if', 'else', 'for', 'while', 'match', 'return', 'let', 'mut', 'self'])
        };

        return keywords[language]?.has(token) || false;
    }

    /**
     * Calculate code complexity
     */
    private calculateComplexity(content: string, language: string): number {
        let complexity = 1; // Base complexity

        // Count decision points
        const decisionKeywords = ['if', 'else', 'elif', 'for', 'while', 'case', 'catch', 'switch'];
        for (const keyword of decisionKeywords) {
            const regex = new RegExp(`\\b${keyword}\\b`, 'g');
            const matches = content.match(regex);
            complexity += matches ? matches.length : 0;
        }

        // Count nesting depth
        let maxDepth = 0;
        let currentDepth = 0;
        for (const char of content) {
            if (char === '{' || char === '(') {
                currentDepth++;
                maxDepth = Math.max(maxDepth, currentDepth);
            } else if (char === '}' || char === ')') {
                currentDepth--;
            }
        }
        complexity += Math.floor(maxDepth / 2);

        return complexity;
    }

    /**
     * Calculate similarity between fingerprints
     */
    private calculateSimilarity(fp1: CodeFingerprint, fp2: CodeFingerprint): number {
        // Exact match
        if (fp1.hash === fp2.hash) {
            return 1.0;
        }

        // Weighted similarity calculation
        const tokenSimilarity = this.jaccardSimilarity(fp1.tokens, fp2.tokens);
        const structureSimilarity = this.levenshteinSimilarity(fp1.structure, fp2.structure);
        const metricSimilarity = this.metricSimilarity(fp1.metrics, fp2.metrics);

        // Weighted average
        return (tokenSimilarity * 0.5) + (structureSimilarity * 0.3) + (metricSimilarity * 0.2);
    }

    /**
     * Jaccard similarity for token sets
     */
    private jaccardSimilarity(tokens1: string[], tokens2: string[]): number {
        const set1 = new Set(tokens1);
        const set2 = new Set(tokens2);
        
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        if (union.size === 0) return 0;
        return intersection.size / union.size;
    }

    /**
     * Levenshtein similarity for strings
     */
    private levenshteinSimilarity(str1: string, str2: string): number {
        if (str1 === str2) return 1.0;
        if (!str1 || !str2) return 0;

        const distance = this.levenshteinDistance(str1, str2);
        const maxLength = Math.max(str1.length, str2.length);
        
        if (maxLength === 0) return 1.0;
        return 1 - (distance / maxLength);
    }

    /**
     * Calculate Levenshtein distance
     */
    private levenshteinDistance(str1: string, str2: string): number {
        const matrix: number[][] = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,      // insertion
                        matrix[i - 1][j] + 1       // deletion
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * Calculate metric similarity
     */
    private metricSimilarity(m1: any, m2: any): number {
        const lineSim = 1 - Math.abs(m1.lines - m2.lines) / Math.max(m1.lines, m2.lines);
        const complexitySim = 1 - Math.abs(m1.complexity - m2.complexity) / Math.max(m1.complexity, m2.complexity);
        const tokenSim = 1 - Math.abs(m1.uniqueTokens - m2.uniqueTokens) / Math.max(m1.uniqueTokens, m2.uniqueTokens);
        
        return (lineSim + complexitySim + tokenSim) / 3;
    }

    /**
     * Classify similarity type
     */
    private classifySimilarity(score: number): 'exact' | 'near' | 'structural' {
        if (score >= 0.95) return 'exact';
        if (score >= 0.85) return 'near';
        return 'structural';
    }

    /**
     * Count matching tokens
     */
    private countMatchingTokens(tokens1: string[], tokens2: string[]): number {
        const set1 = new Set(tokens1);
        const set2 = new Set(tokens2);
        return [...set1].filter(x => set2.has(x)).length;
    }

    /**
     * Check if token is variable name
     */
    private isVariableName(token: string): boolean {
        return /^[a-zA-Z_]\w*$/.test(token) && token.length > 1;
    }

    /**
     * Check if token is string literal
     */
    private isStringLiteral(token: string): boolean {
        return /^["'].*["']$/.test(token);
    }

    /**
     * Check if token is number
     */
    private isNumber(token: string): boolean {
        return /^\d+(\.\d+)?$/.test(token);
    }

    /**
     * Hash content
     */
    private hashContent(content: string): string {
        return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
    }

    /**
     * Find similar code patterns
     */
    async findSimilarPatterns(
        pattern: string,
        codeBlocks: Array<{ id: string; content: string; language: string }>,
        minSimilarity: number = 0.7
    ): Promise<Array<{ id: string; similarity: number; matches: string[] }>> {
        const results: Array<{ id: string; similarity: number; matches: string[] }> = [];
        const patternFp = this.generateFingerprint(pattern, 'javascript'); // Default language

        for (const block of codeBlocks) {
            const blockFp = this.generateFingerprint(block.content, block.language);
            const similarity = this.calculateSimilarity(patternFp, blockFp);

            if (similarity >= minSimilarity) {
                // Find specific matching parts
                const matches = this.findMatchingParts(pattern, block.content);
                results.push({
                    id: block.id,
                    similarity,
                    matches
                });
            }
        }

        return results.sort((a, b) => b.similarity - a.similarity);
    }

    /**
     * Find matching parts between two code blocks
     */
    private findMatchingParts(pattern: string, content: string): string[] {
        const matches: string[] = [];
        const patternLines = pattern.split('\n').map(l => l.trim()).filter(l => l);
        const contentLines = content.split('\n').map(l => l.trim()).filter(l => l);

        for (const patternLine of patternLines) {
            for (let i = 0; i < contentLines.length; i++) {
                if (this.linesSimilar(patternLine, contentLines[i])) {
                    // Get context (surrounding lines)
                    const start = Math.max(0, i - 1);
                    const end = Math.min(contentLines.length, i + 2);
                    const match = contentLines.slice(start, end).join('\n');
                    matches.push(match);
                    break;
                }
            }
        }

        return matches;
    }

    /**
     * Check if two lines are similar
     */
    private linesSimilar(line1: string, line2: string): boolean {
        const tokens1 = this.tokenize(line1, 'javascript');
        const tokens2 = this.tokenize(line2, 'javascript');
        
        if (tokens1.length === 0 || tokens2.length === 0) return false;
        
        const similarity = this.jaccardSimilarity(tokens1, tokens2);
        return similarity > 0.7;
    }
}