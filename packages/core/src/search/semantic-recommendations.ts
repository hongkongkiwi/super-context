/**
 * Semantic code recommendations engine
 */

import { SemanticSearchResult } from '../types';
import { CodeSimilarityAnalyzer, SimilarityResult } from '../utils/similarity';
import { EmbeddingVector } from '../embedding';

export interface CodeRecommendation {
    code: string;
    filePath: string;
    reason: string;
    similarity: number;
    type: 'similar' | 'pattern' | 'usage' | 'improvement';
    confidence: number;
    metadata?: {
        language?: string;
        category?: string;
        tags?: string[];
    };
}

export interface RecommendationContext {
    currentCode: string;
    language: string;
    intent?: string;
    history?: string[];
    projectContext?: Record<string, any>;
}

/**
 * Provides intelligent code recommendations based on semantic understanding
 */
export class SemanticRecommendationEngine {
    private similarityAnalyzer: CodeSimilarityAnalyzer;
    private codePatterns: Map<string, CodePattern> = new Map();
    private usageIndex: Map<string, UsageExample[]> = new Map();
    private improvementPatterns: ImprovementPattern[] = [];

    constructor() {
        this.similarityAnalyzer = new CodeSimilarityAnalyzer(0.7);
        this.initializePatterns();
    }

    /**
     * Get recommendations for given code context
     */
    async getRecommendations(
        context: RecommendationContext,
        searchResults: SemanticSearchResult[],
        limit: number = 5
    ): Promise<CodeRecommendation[]> {
        const recommendations: CodeRecommendation[] = [];

        // 1. Find similar code patterns
        const similarPatterns = await this.findSimilarPatterns(
            context.currentCode,
            searchResults,
            context.language
        );
        recommendations.push(...similarPatterns);

        // 2. Find usage examples
        const usageExamples = await this.findUsageExamples(
            context.currentCode,
            searchResults,
            context.language
        );
        recommendations.push(...usageExamples);

        // 3. Suggest improvements
        const improvements = await this.suggestImprovements(
            context.currentCode,
            context.language,
            searchResults
        );
        recommendations.push(...improvements);

        // 4. Pattern-based recommendations
        const patternRecs = await this.getPatternRecommendations(
            context.currentCode,
            context.language
        );
        recommendations.push(...patternRecs);

        // Sort by confidence and similarity
        const sorted = recommendations
            .sort((a, b) => (b.confidence * b.similarity) - (a.confidence * a.similarity))
            .slice(0, limit);

        // Add reasoning
        return this.addDetailedReasoning(sorted, context);
    }

    /**
     * Find similar code patterns
     */
    private async findSimilarPatterns(
        code: string,
        searchResults: SemanticSearchResult[],
        language: string
    ): Promise<CodeRecommendation[]> {
        const recommendations: CodeRecommendation[] = [];
        
        // Convert search results to format for similarity analyzer
        const codeBlocks = searchResults.map((result, index) => ({
            id: `${result.relativePath}:${result.startLine}`,
            content: result.content,
            language: result.language || language
        }));

        // Find similar patterns
        const similarPatterns = await this.similarityAnalyzer.findSimilarPatterns(
            code,
            codeBlocks,
            0.75
        );

        for (const pattern of similarPatterns) {
            const result = searchResults.find(r => 
                pattern.id === `${r.relativePath}:${r.startLine}`
            );
            
            if (result) {
                recommendations.push({
                    code: result.content,
                    filePath: result.relativePath,
                    reason: `Similar implementation pattern found (${Math.round(pattern.similarity * 100)}% match)`,
                    similarity: pattern.similarity,
                    type: 'similar',
                    confidence: pattern.similarity,
                    metadata: {
                        language: result.language,
                        category: 'pattern-match'
                    }
                });
            }
        }

        return recommendations;
    }

    /**
     * Find usage examples
     */
    private async findUsageExamples(
        code: string,
        searchResults: SemanticSearchResult[],
        language: string
    ): Promise<CodeRecommendation[]> {
        const recommendations: CodeRecommendation[] = [];
        
        // Extract function/class names from code
        const identifiers = this.extractIdentifiers(code, language);
        
        for (const result of searchResults) {
            // Check if result contains usage of our identifiers
            const usageScore = this.calculateUsageScore(identifiers, result.content);
            
            if (usageScore > 0.3) {
                recommendations.push({
                    code: result.content,
                    filePath: result.relativePath,
                    reason: `Example usage of ${identifiers.slice(0, 3).join(', ')}`,
                    similarity: result.score,
                    type: 'usage',
                    confidence: usageScore,
                    metadata: {
                        language: result.language,
                        category: 'usage-example'
                    }
                });
            }
        }

        return recommendations;
    }

    /**
     * Suggest code improvements
     */
    private async suggestImprovements(
        code: string,
        language: string,
        searchResults: SemanticSearchResult[]
    ): Promise<CodeRecommendation[]> {
        const recommendations: CodeRecommendation[] = [];
        
        // Analyze code for potential improvements
        const issues = this.analyzeCodeIssues(code, language);
        
        for (const issue of issues) {
            // Find examples that solve this issue
            const solution = this.findSolutionInResults(issue, searchResults);
            
            if (solution) {
                recommendations.push({
                    code: solution.content,
                    filePath: solution.relativePath,
                    reason: `Better approach for ${issue.type}: ${issue.description}`,
                    similarity: solution.score,
                    type: 'improvement',
                    confidence: issue.severity,
                    metadata: {
                        language,
                        category: 'improvement',
                        tags: [issue.type]
                    }
                });
            }
        }

        return recommendations;
    }

    /**
     * Get pattern-based recommendations
     */
    private async getPatternRecommendations(
        code: string,
        language: string
    ): Promise<CodeRecommendation[]> {
        const recommendations: CodeRecommendation[] = [];
        
        // Check against known patterns
        for (const [patternName, pattern] of this.codePatterns) {
            if (pattern.languages.includes(language)) {
                const matches = this.matchesPattern(code, pattern);
                
                if (matches) {
                    recommendations.push({
                        code: pattern.example,
                        filePath: 'pattern-library',
                        reason: pattern.description,
                        similarity: matches.score,
                        type: 'pattern',
                        confidence: matches.confidence,
                        metadata: {
                            language,
                            category: pattern.category,
                            tags: pattern.tags
                        }
                    });
                }
            }
        }

        return recommendations;
    }

    /**
     * Extract identifiers from code
     */
    private extractIdentifiers(code: string, language: string): string[] {
        const identifiers: string[] = [];
        
        // Language-specific patterns
        const patterns: Record<string, RegExp[]> = {
            javascript: [
                /(?:function|const|let|var|class)\s+(\w+)/g,
                /(\w+)\s*[:=]\s*(?:function|\()/g
            ],
            typescript: [
                /(?:function|const|let|var|class|interface|type)\s+(\w+)/g,
                /(\w+)\s*[:=]\s*(?:function|\()/g
            ],
            python: [
                /(?:def|class)\s+(\w+)/g,
                /(\w+)\s*=/g
            ],
            java: [
                /(?:class|interface|enum)\s+(\w+)/g,
                /(?:public|private|protected)?\s+\w+\s+(\w+)\s*\(/g
            ]
        };

        const langPatterns = patterns[language] || patterns.javascript;
        
        for (const pattern of langPatterns) {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                if (match[1] && !identifiers.includes(match[1])) {
                    identifiers.push(match[1]);
                }
            }
        }

        return identifiers;
    }

    /**
     * Calculate usage score
     */
    private calculateUsageScore(identifiers: string[], content: string): number {
        if (identifiers.length === 0) return 0;
        
        let matches = 0;
        for (const id of identifiers) {
            // Create word boundary regex
            const regex = new RegExp(`\\b${id}\\b`, 'g');
            const occurrences = (content.match(regex) || []).length;
            if (occurrences > 0) {
                matches++;
            }
        }
        
        return matches / identifiers.length;
    }

    /**
     * Analyze code for potential issues
     */
    private analyzeCodeIssues(code: string, language: string): CodeIssue[] {
        const issues: CodeIssue[] = [];
        
        // Common code smells and issues
        const checks: IssueCheck[] = [
            {
                type: 'complexity',
                pattern: /if.*if.*if/s,
                description: 'Nested conditionals can be simplified',
                severity: 0.6
            },
            {
                type: 'naming',
                pattern: /\b[a-z]\b(?!\w)/g,
                description: 'Single letter variables reduce readability',
                severity: 0.4
            },
            {
                type: 'error-handling',
                pattern: /catch\s*\([^)]*\)\s*{\s*}/,
                description: 'Empty catch blocks hide errors',
                severity: 0.8
            },
            {
                type: 'performance',
                pattern: /for.*\.length/,
                description: 'Length calculation in loop condition',
                severity: 0.5
            }
        ];

        for (const check of checks) {
            if (check.pattern.test(code)) {
                issues.push({
                    type: check.type,
                    description: check.description,
                    severity: check.severity
                });
            }
        }

        return issues;
    }

    /**
     * Find solution in search results
     */
    private findSolutionInResults(
        issue: CodeIssue,
        searchResults: SemanticSearchResult[]
    ): SemanticSearchResult | null {
        // Find results that don't have the issue
        for (const result of searchResults) {
            if (!this.hasIssue(result.content, issue)) {
                return result;
            }
        }
        
        return null;
    }

    /**
     * Check if code has specific issue
     */
    private hasIssue(code: string, issue: CodeIssue): boolean {
        // Simplified check - in real implementation would be more sophisticated
        const issuePatterns: Record<string, RegExp> = {
            'complexity': /if.*if.*if/s,
            'naming': /\b[a-z]\b(?!\w)/g,
            'error-handling': /catch\s*\([^)]*\)\s*{\s*}/,
            'performance': /for.*\.length/
        };

        const pattern = issuePatterns[issue.type];
        return pattern ? pattern.test(code) : false;
    }

    /**
     * Match code against pattern
     */
    private matchesPattern(code: string, pattern: CodePattern): { score: number; confidence: number } | null {
        let score = 0;
        let matches = 0;
        
        for (const indicator of pattern.indicators) {
            if (code.includes(indicator)) {
                matches++;
            }
        }
        
        if (matches === 0) return null;
        
        score = matches / pattern.indicators.length;
        const confidence = score * pattern.weight;
        
        return { score, confidence };
    }

    /**
     * Add detailed reasoning to recommendations
     */
    private addDetailedReasoning(
        recommendations: CodeRecommendation[],
        context: RecommendationContext
    ): CodeRecommendation[] {
        return recommendations.map(rec => {
            let detailedReason = rec.reason;
            
            // Add context-specific reasoning
            if (context.intent) {
                detailedReason += `. Relevant for: ${context.intent}`;
            }
            
            // Add type-specific details
            switch (rec.type) {
                case 'similar':
                    detailedReason += '. This code follows a similar structure and could be adapted.';
                    break;
                case 'usage':
                    detailedReason += '. Shows how similar components are used in practice.';
                    break;
                case 'improvement':
                    detailedReason += '. Addresses potential issues in your current implementation.';
                    break;
                case 'pattern':
                    detailedReason += '. Follows established best practices for this scenario.';
                    break;
            }
            
            return {
                ...rec,
                reason: detailedReason
            };
        });
    }

    /**
     * Initialize known patterns
     */
    private initializePatterns(): void {
        // Add common design patterns
        this.codePatterns.set('singleton', {
            name: 'singleton',
            category: 'design-pattern',
            languages: ['javascript', 'typescript', 'java'],
            indicators: ['getInstance', 'instance', 'singleton'],
            example: `class Singleton {
    private static instance: Singleton;
    private constructor() {}
    
    public static getInstance(): Singleton {
        if (!Singleton.instance) {
            Singleton.instance = new Singleton();
        }
        return Singleton.instance;
    }
}`,
            description: 'Singleton pattern ensures single instance',
            weight: 0.8,
            tags: ['design-pattern', 'creational']
        });

        this.codePatterns.set('observer', {
            name: 'observer',
            category: 'design-pattern',
            languages: ['javascript', 'typescript'],
            indicators: ['subscribe', 'unsubscribe', 'notify', 'observers'],
            example: `class EventEmitter {
    private listeners = new Map();
    
    on(event: string, callback: Function) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
    
    emit(event: string, ...args: any[]) {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(cb => cb(...args));
    }
}`,
            description: 'Observer pattern for event handling',
            weight: 0.7,
            tags: ['design-pattern', 'behavioral']
        });

        // Add more patterns as needed
    }

    /**
     * Learn from user feedback
     */
    async learnFromFeedback(
        recommendation: CodeRecommendation,
        feedback: 'helpful' | 'not-helpful',
        context?: RecommendationContext
    ): Promise<void> {
        // Update pattern weights based on feedback
        if (recommendation.type === 'pattern' && recommendation.metadata?.category) {
            const pattern = this.codePatterns.get(recommendation.metadata.category);
            if (pattern) {
                if (feedback === 'helpful') {
                    pattern.weight = Math.min(1.0, pattern.weight + 0.05);
                } else {
                    pattern.weight = Math.max(0.1, pattern.weight - 0.05);
                }
            }
        }
        
        // Store feedback for future improvements
        // In production, this would persist to a database
        console.log(`Feedback recorded: ${feedback} for ${recommendation.type} recommendation`);
    }
}

// Type definitions
interface CodePattern {
    name: string;
    category: string;
    languages: string[];
    indicators: string[];
    example: string;
    description: string;
    weight: number;
    tags: string[];
}

interface UsageExample {
    code: string;
    context: string;
    frequency: number;
}

interface ImprovementPattern {
    issue: string;
    solution: string;
    languages: string[];
}

interface CodeIssue {
    type: string;
    description: string;
    severity: number;
}

interface IssueCheck {
    type: string;
    pattern: RegExp;
    description: string;
    severity: number;
}