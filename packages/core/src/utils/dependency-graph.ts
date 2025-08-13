/**
 * Dependency graph analysis for intelligent incremental indexing
 */

import * as path from 'path';
import * as fs from 'fs';

export interface DependencyNode {
    filePath: string;
    imports: Set<string>;
    exports: Set<string>;
    dependents: Set<string>;
    dependencies: Set<string>;
    lastModified: number;
    hash: string;
}

export interface ChangeImpact {
    directlyAffected: string[];
    transitivelyAffected: string[];
    priority: 'high' | 'medium' | 'low';
    estimatedChunks: number;
}

/**
 * Analyzes code dependencies for smart re-indexing
 */
export class DependencyGraph {
    private nodes = new Map<string, DependencyNode>();
    private exportIndex = new Map<string, Set<string>>(); // export -> files that export it
    private importIndex = new Map<string, Set<string>>(); // import -> files that import it

    /**
     * Build dependency graph from codebase
     */
    async buildGraph(codebasePath: string, files: string[]): Promise<void> {
        for (const file of files) {
            await this.analyzeFile(file, codebasePath);
        }

        // Build reverse dependencies
        this.buildReverseDependencies();
    }

    /**
     * Analyze a single file for dependencies
     */
    private async analyzeFile(filePath: string, codebasePath: string): Promise<void> {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const ext = path.extname(filePath);
        
        const node: DependencyNode = {
            filePath,
            imports: new Set(),
            exports: new Set(),
            dependents: new Set(),
            dependencies: new Set(),
            lastModified: (await fs.promises.stat(filePath)).mtime.getTime(),
            hash: this.hashContent(content)
        };

        // Extract imports and exports based on file type
        if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
            this.extractJavaScriptDependencies(content, node, codebasePath);
        } else if (['.py'].includes(ext)) {
            this.extractPythonDependencies(content, node, codebasePath);
        } else if (['.java'].includes(ext)) {
            this.extractJavaDependencies(content, node, codebasePath);
        } else if (['.go'].includes(ext)) {
            this.extractGoDependencies(content, node, codebasePath);
        }

        this.nodes.set(filePath, node);
        
        // Update indices
        for (const exp of node.exports) {
            if (!this.exportIndex.has(exp)) {
                this.exportIndex.set(exp, new Set());
            }
            this.exportIndex.get(exp)!.add(filePath);
        }

        for (const imp of node.imports) {
            if (!this.importIndex.has(imp)) {
                this.importIndex.set(imp, new Set());
            }
            this.importIndex.get(imp)!.add(filePath);
        }
    }

    /**
     * Extract JavaScript/TypeScript dependencies
     */
    private extractJavaScriptDependencies(content: string, node: DependencyNode, codebasePath: string): void {
        // Import patterns
        const importPatterns = [
            /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g,
            /require\s*\(['"]([^'"]+)['"]\)/g,
            /import\s*\(['"]([^'"]+)['"]\)/g // Dynamic imports
        ];

        for (const pattern of importPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const importPath = this.resolveImportPath(match[1], node.filePath, codebasePath);
                if (importPath) {
                    node.imports.add(importPath);
                    node.dependencies.add(importPath);
                }
            }
        }

        // Export patterns
        const exportPatterns = [
            /export\s+(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)/g,
            /export\s*\{([^}]+)\}/g,
            /export\s*\*\s*from/g
        ];

        for (const pattern of exportPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                if (match[1]) {
                    // Handle multiple exports in braces
                    const exports = match[1].split(',').map(e => e.trim().split(/\s+as\s+/)[0]);
                    exports.forEach(exp => node.exports.add(exp));
                }
            }
        }
    }

    /**
     * Extract Python dependencies
     */
    private extractPythonDependencies(content: string, node: DependencyNode, codebasePath: string): void {
        const importPatterns = [
            /^import\s+([\w.]+)/gm,
            /^from\s+([\w.]+)\s+import/gm
        ];

        for (const pattern of importPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const importPath = this.resolvePythonImportPath(match[1], node.filePath, codebasePath);
                if (importPath) {
                    node.imports.add(importPath);
                    node.dependencies.add(importPath);
                }
            }
        }

        // Python exports (functions and classes at module level)
        const exportPatterns = [
            /^def\s+(\w+)/gm,
            /^class\s+(\w+)/gm
        ];

        for (const pattern of exportPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                node.exports.add(match[1]);
            }
        }
    }

    /**
     * Extract Java dependencies
     */
    private extractJavaDependencies(content: string, node: DependencyNode, codebasePath: string): void {
        const importPattern = /^import\s+(?:static\s+)?([\w.]+);/gm;
        let match;
        
        while ((match = importPattern.exec(content)) !== null) {
            const importPath = this.resolveJavaImportPath(match[1], codebasePath);
            if (importPath) {
                node.imports.add(importPath);
                node.dependencies.add(importPath);
            }
        }

        // Java exports (public classes/interfaces)
        const exportPatterns = [
            /public\s+(?:class|interface|enum)\s+(\w+)/g
        ];

        for (const pattern of exportPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                node.exports.add(match[1]);
            }
        }
    }

    /**
     * Extract Go dependencies
     */
    private extractGoDependencies(content: string, node: DependencyNode, codebasePath: string): void {
        const importPattern = /import\s+(?:\(\s*([\s\S]*?)\s*\)|"([^"]+)")/g;
        let match;
        
        while ((match = importPattern.exec(content)) !== null) {
            const imports = match[1] || match[2];
            if (imports) {
                const importList = match[1] 
                    ? imports.split('\n').map(i => i.trim()).filter(i => i && i.startsWith('"'))
                    : [imports];
                    
                for (const imp of importList) {
                    const cleanImport = imp.replace(/"/g, '').trim();
                    const importPath = this.resolveGoImportPath(cleanImport, codebasePath);
                    if (importPath) {
                        node.imports.add(importPath);
                        node.dependencies.add(importPath);
                    }
                }
            }
        }

        // Go exports (capitalized functions/types)
        const exportPatterns = [
            /^func\s+([A-Z]\w*)/gm,
            /^type\s+([A-Z]\w*)/gm
        ];

        for (const pattern of exportPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                node.exports.add(match[1]);
            }
        }
    }

    /**
     * Build reverse dependency mappings
     */
    private buildReverseDependencies(): void {
        for (const [filePath, node] of this.nodes.entries()) {
            for (const dep of node.dependencies) {
                const depNode = this.nodes.get(dep);
                if (depNode) {
                    depNode.dependents.add(filePath);
                }
            }
        }
    }

    /**
     * Calculate impact of file changes
     */
    calculateChangeImpact(changedFiles: string[]): ChangeImpact {
        const directlyAffected = new Set<string>(changedFiles);
        const transitivelyAffected = new Set<string>();
        const visited = new Set<string>();

        // Find all transitively affected files
        const queue = [...changedFiles];
        while (queue.length > 0) {
            const file = queue.shift()!;
            if (visited.has(file)) continue;
            visited.add(file);

            const node = this.nodes.get(file);
            if (node) {
                for (const dependent of node.dependents) {
                    if (!directlyAffected.has(dependent)) {
                        transitivelyAffected.add(dependent);
                        queue.push(dependent);
                    }
                }
            }
        }

        // Determine priority based on impact
        const totalAffected = directlyAffected.size + transitivelyAffected.size;
        let priority: 'high' | 'medium' | 'low';
        
        if (this.isHighImpactChange(changedFiles)) {
            priority = 'high';
        } else if (totalAffected > 10) {
            priority = 'medium';
        } else {
            priority = 'low';
        }

        // Estimate chunks (rough estimate: 3 chunks per file)
        const estimatedChunks = totalAffected * 3;

        return {
            directlyAffected: Array.from(directlyAffected),
            transitivelyAffected: Array.from(transitivelyAffected),
            priority,
            estimatedChunks
        };
    }

    /**
     * Check if changes are high impact
     */
    private isHighImpactChange(files: string[]): boolean {
        for (const file of files) {
            const node = this.nodes.get(file);
            if (node) {
                // High impact if file has many dependents or exports many symbols
                if (node.dependents.size > 5 || node.exports.size > 10) {
                    return true;
                }
                
                // High impact if it's a config or index file
                const basename = path.basename(file);
                if (basename.includes('config') || basename === 'index.js' || basename === 'index.ts') {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Get files that should be re-indexed together
     */
    getRelatedFiles(file: string, maxDepth: number = 2): string[] {
        const related = new Set<string>();
        const visited = new Set<string>();
        
        const traverse = (currentFile: string, depth: number) => {
            if (depth > maxDepth || visited.has(currentFile)) return;
            visited.add(currentFile);
            
            const node = this.nodes.get(currentFile);
            if (node) {
                // Add direct dependencies and dependents
                for (const dep of node.dependencies) {
                    related.add(dep);
                    if (depth < maxDepth) {
                        traverse(dep, depth + 1);
                    }
                }
                
                for (const dependent of node.dependents) {
                    related.add(dependent);
                    if (depth < maxDepth) {
                        traverse(dependent, depth + 1);
                    }
                }
            }
        };
        
        traverse(file, 0);
        return Array.from(related);
    }

    /**
     * Resolve import path to absolute path
     */
    private resolveImportPath(importPath: string, fromFile: string, codebasePath: string): string | null {
        // Skip external packages
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
            return null;
        }

        const dir = path.dirname(fromFile);
        let resolvedPath = path.resolve(dir, importPath);

        // Try common extensions
        const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];
        if (fs.existsSync(resolvedPath)) {
            return resolvedPath;
        }

        for (const ext of extensions) {
            const pathWithExt = resolvedPath + ext;
            if (fs.existsSync(pathWithExt)) {
                return pathWithExt;
            }
        }

        // Try index file
        const indexPath = path.join(resolvedPath, 'index');
        for (const ext of extensions) {
            const pathWithExt = indexPath + ext;
            if (fs.existsSync(pathWithExt)) {
                return pathWithExt;
            }
        }

        return null;
    }

    /**
     * Resolve Python import path
     */
    private resolvePythonImportPath(importPath: string, fromFile: string, codebasePath: string): string | null {
        const parts = importPath.split('.');
        const dir = path.dirname(fromFile);
        
        // Try relative to current file
        let resolvedPath = path.join(dir, ...parts) + '.py';
        if (fs.existsSync(resolvedPath)) {
            return resolvedPath;
        }

        // Try relative to codebase root
        resolvedPath = path.join(codebasePath, ...parts) + '.py';
        if (fs.existsSync(resolvedPath)) {
            return resolvedPath;
        }

        // Try as package __init__.py
        resolvedPath = path.join(codebasePath, ...parts, '__init__.py');
        if (fs.existsSync(resolvedPath)) {
            return resolvedPath;
        }

        return null;
    }

    /**
     * Resolve Java import path
     */
    private resolveJavaImportPath(importPath: string, codebasePath: string): string | null {
        const parts = importPath.split('.');
        const className = parts[parts.length - 1];
        const packagePath = parts.slice(0, -1);
        
        const resolvedPath = path.join(codebasePath, 'src', 'main', 'java', ...packagePath, className + '.java');
        if (fs.existsSync(resolvedPath)) {
            return resolvedPath;
        }

        // Try alternate structure
        const altPath = path.join(codebasePath, ...packagePath, className + '.java');
        if (fs.existsSync(altPath)) {
            return altPath;
        }

        return null;
    }

    /**
     * Resolve Go import path
     */
    private resolveGoImportPath(importPath: string, codebasePath: string): string | null {
        // Skip standard library
        if (!importPath.includes('/')) {
            return null;
        }

        const parts = importPath.split('/');
        const resolvedPath = path.join(codebasePath, ...parts);
        
        if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
            // Go packages are directories
            return resolvedPath;
        }

        return null;
    }

    /**
     * Hash content for change detection
     */
    private hashContent(content: string): string {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
    }

    /**
     * Get graph statistics
     */
    getStats() {
        let maxDependents = 0;
        let maxDependencies = 0;
        let totalConnections = 0;
        
        for (const node of this.nodes.values()) {
            maxDependents = Math.max(maxDependents, node.dependents.size);
            maxDependencies = Math.max(maxDependencies, node.dependencies.size);
            totalConnections += node.dependents.size + node.dependencies.size;
        }

        return {
            totalFiles: this.nodes.size,
            totalExports: this.exportIndex.size,
            totalImports: this.importIndex.size,
            maxDependents,
            maxDependencies,
            avgConnections: totalConnections / this.nodes.size,
            isolatedFiles: Array.from(this.nodes.values()).filter(n => 
                n.dependencies.size === 0 && n.dependents.size === 0
            ).length
        };
    }

    /**
     * Export graph for visualization
     */
    exportGraph(): any {
        const nodes = Array.from(this.nodes.entries()).map(([p, node]) => ({
            id: p,
            label: path.basename(p),
            dependencies: Array.from(node.dependencies),
            dependents: Array.from(node.dependents),
            exports: Array.from(node.exports),
            imports: Array.from(node.imports)
        }));

        const edges: any[] = [];
        for (const [path, node] of this.nodes.entries()) {
            for (const dep of node.dependencies) {
                edges.push({
                    source: path,
                    target: dep,
                    type: 'dependency'
                });
            }
        }

        return { nodes, edges };
    }
}