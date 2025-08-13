/**
 * Streaming utilities for processing large files efficiently
 */

import * as fs from 'fs';
import * as readline from 'readline';
import { Transform, Readable } from 'stream';
import { CodeChunk } from '../splitter';

export interface StreamingOptions {
    highWaterMark?: number;
    encoding?: BufferEncoding;
    maxChunkSize?: number;
    overlapSize?: number;
}

export interface ChunkProcessor<T> {
    process(chunk: string, metadata: any): Promise<T>;
    flush?(): Promise<T[]>;
}

/**
 * Stream processor for large file handling
 */
export class StreamingFileProcessor {
    private readonly options: StreamingOptions;

    constructor(options: StreamingOptions = {}) {
        this.options = {
            highWaterMark: options.highWaterMark || 64 * 1024, // 64KB chunks
            encoding: options.encoding || 'utf-8',
            maxChunkSize: options.maxChunkSize || 2500,
            overlapSize: options.overlapSize || 300
        };
    }

    /**
     * Process file in streaming chunks
     */
    async *processFile(filePath: string): AsyncGenerator<string, void, unknown> {
        const stream = fs.createReadStream(filePath, {
            highWaterMark: this.options.highWaterMark,
            encoding: this.options.encoding
        });

        let buffer = '';
        let lineNumber = 1;

        for await (const chunk of stream) {
            buffer += chunk;
            
            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete last line

            for (const line of lines) {
                yield line;
                lineNumber++;
            }
        }

        // Process remaining buffer
        if (buffer) {
            yield buffer;
        }
    }

    /**
     * Process file by lines with batching
     */
    async processFileByLines<T>(
        filePath: string,
        processor: (lines: string[], startLine: number) => Promise<T[]>,
        batchSize: number = 100
    ): Promise<T[]> {
        const results: T[] = [];
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let batch: string[] = [];
        let currentLine = 1;
        let batchStartLine = 1;

        for await (const line of rl) {
            batch.push(line);

            if (batch.length >= batchSize) {
                const processed = await processor(batch, batchStartLine);
                results.push(...processed);
                
                batchStartLine = currentLine + 1;
                batch = [];
            }

            currentLine++;
        }

        // Process remaining batch
        if (batch.length > 0) {
            const processed = await processor(batch, batchStartLine);
            results.push(...processed);
        }

        return results;
    }

    /**
     * Create streaming code chunks with overlap
     */
    async *createStreamingChunks(
        filePath: string,
        language: string
    ): AsyncGenerator<CodeChunk, void, unknown> {
        const stream = fs.createReadStream(filePath, {
            highWaterMark: this.options.highWaterMark,
            encoding: this.options.encoding
        });

        let buffer = '';
        let overlap = '';
        let startLine = 1;
        let currentLine = 1;
        let chunkIndex = 0;

        for await (const data of stream) {
            buffer = overlap + data;
            const lines = buffer.split('\n');
            
            // Keep last few lines for overlap
            const overlapLineCount = Math.floor(this.options.overlapSize! / 80); // Estimate 80 chars per line
            overlap = lines.slice(-overlapLineCount).join('\n');
            
            // Process current chunk
            const chunkLines = lines.slice(0, -overlapLineCount);
            const chunkContent = chunkLines.join('\n');
            
            if (chunkContent.length > 0) {
                yield {
                    content: chunkContent,
                    metadata: {
                        filePath,
                        startLine,
                        endLine: startLine + chunkLines.length - 1,
                        language,
                        chunkIndex: chunkIndex++,
                        isStreamed: true
                    }
                };
                
                startLine += chunkLines.length;
            }
            
            currentLine += lines.length - 1;
        }

        // Process final overlap if any
        if (overlap.trim().length > 0) {
            yield {
                content: overlap,
                metadata: {
                    filePath,
                    startLine,
                    endLine: currentLine,
                    language,
                    chunkIndex: chunkIndex++,
                    isStreamed: true,
                    isFinal: true
                }
            };
        }
    }

    /**
     * Transform stream for processing chunks
     */
    createChunkTransform<T>(
        processor: ChunkProcessor<T>
    ): Transform {
        let buffer = '';
        const results: T[] = [];
        const options = this.options;

        return new Transform({
            async transform(chunk: Buffer, encoding, callback) {
                buffer += chunk.toString();
                
                // Process when buffer reaches max size
                if (buffer.length >= options.maxChunkSize!) {
                    try {
                        const result = await processor.process(buffer, {});
                        results.push(result);
                        buffer = buffer.slice(-options.overlapSize!); // Keep overlap
                        callback();
                    } catch (error) {
                        callback(error as Error);
                    }
                } else {
                    callback();
                }
            },

            async flush(callback) {
                try {
                    // Process remaining buffer
                    if (buffer.length > 0) {
                        const result = await processor.process(buffer, { isFinal: true });
                        results.push(result);
                    }

                    // Call processor's flush if available
                    if (processor.flush) {
                        const flushed = await processor.flush();
                        results.push(...flushed);
                    }

                    this.push(JSON.stringify(results));
                    callback();
                } catch (error) {
                    callback(error as Error);
                }
            }
        });
    }

    /**
     * Process multiple files in parallel with streaming
     */
    async processFilesInParallel<T>(
        filePaths: string[],
        processor: (filePath: string) => AsyncGenerator<T, void, unknown>,
        maxConcurrency: number = 5
    ): Promise<T[]> {
        const results: T[] = [];
        const queue = [...filePaths];
        const processing = new Set<Promise<void>>();

        while (queue.length > 0 || processing.size > 0) {
            // Start new processing tasks up to max concurrency
            while (processing.size < maxConcurrency && queue.length > 0) {
                const filePath = queue.shift()!;
                const task = (async () => {
                    try {
                        for await (const result of processor(filePath)) {
                            results.push(result);
                        }
                    } catch (error) {
                        console.error(`Error processing ${filePath}:`, error);
                    }
                })();

                processing.add(task);
                task.then(() => processing.delete(task));
            }

            // Wait for at least one task to complete
            if (processing.size > 0) {
                await Promise.race(processing);
            }
        }

        return results;
    }

    /**
     * Memory-efficient file size calculation
     */
    async getFileStats(filePath: string): Promise<{
        size: number;
        lines: number;
        avgLineLength: number;
        estimatedChunks: number;
    }> {
        const stats = await fs.promises.stat(filePath);
        let lines = 0;
        let totalLineLength = 0;

        const stream = fs.createReadStream(filePath, {
            highWaterMark: this.options.highWaterMark,
            encoding: this.options.encoding
        });

        for await (const chunk of stream) {
            const chunkLines = chunk.toString().split('\n');
            lines += chunkLines.length - 1;
            totalLineLength += chunk.toString().length;
        }

        const avgLineLength = lines > 0 ? Math.floor(totalLineLength / lines) : 0;
        const estimatedChunks = Math.ceil(stats.size / this.options.maxChunkSize!);

        return {
            size: stats.size,
            lines,
            avgLineLength,
            estimatedChunks
        };
    }

    /**
     * Create readable stream from async generator
     */
    createReadableStream<T>(
        generator: AsyncGenerator<T, void, unknown>
    ): Readable {
        return Readable.from(generator, {
            objectMode: true,
            highWaterMark: 16
        });
    }

    /**
     * Process CSV/TSV files efficiently
     */
    async *processDelimitedFile(
        filePath: string,
        delimiter: string = ',',
        hasHeader: boolean = true
    ): AsyncGenerator<Record<string, string>, void, unknown> {
        const rl = readline.createInterface({
            input: fs.createReadStream(filePath),
            crlfDelay: Infinity
        });

        let headers: string[] = [];
        let isFirstLine = true;

        for await (const line of rl) {
            const values = this.parseDelimitedLine(line, delimiter);

            if (isFirstLine && hasHeader) {
                headers = values;
                isFirstLine = false;
                continue;
            }

            if (headers.length > 0) {
                const record: Record<string, string> = {};
                for (let i = 0; i < headers.length; i++) {
                    record[headers[i]] = values[i] || '';
                }
                yield record;
            } else {
                // No headers, return as array
                yield values.reduce((acc, val, idx) => {
                    acc[`col_${idx}`] = val;
                    return acc;
                }, {} as Record<string, string>);
            }
        }
    }

    /**
     * Parse delimited line handling quotes
     */
    private parseDelimitedLine(line: string, delimiter: string): string[] {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Escaped quote
                    current += '"';
                    i++; // Skip next quote
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        // Add last field
        result.push(current);
        return result;
    }

    /**
     * Monitor streaming progress
     */
    createProgressMonitor(
        totalBytes: number,
        onProgress: (progress: { bytes: number; percentage: number }) => void
    ): Transform {
        let processedBytes = 0;

        return new Transform({
            transform(chunk: Buffer, encoding, callback) {
                processedBytes += chunk.length;
                const percentage = (processedBytes / totalBytes) * 100;
                
                onProgress({
                    bytes: processedBytes,
                    percentage: Math.min(100, percentage)
                });

                this.push(chunk);
                callback();
            }
        });
    }
}