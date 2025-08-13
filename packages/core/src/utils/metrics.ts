/**
 * Performance monitoring and metrics collection
 */

import { EventEmitter } from 'events';

export interface MetricPoint {
    name: string;
    value: number;
    timestamp: number;
    tags?: Record<string, string>;
}

export interface PerformanceMetrics {
    operation: string;
    duration: number;
    success: boolean;
    error?: string;
    metadata?: Record<string, any>;
}

export interface SystemMetrics {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    timestamp: number;
}

/**
 * Performance timer for measuring operation durations
 */
export class PerformanceTimer {
    private startTime: number;
    private marks = new Map<string, number>();

    constructor() {
        this.startTime = performance.now();
    }

    /**
     * Mark a point in time
     */
    mark(name: string): void {
        this.marks.set(name, performance.now());
    }

    /**
     * Get duration since start
     */
    elapsed(): number {
        return performance.now() - this.startTime;
    }

    /**
     * Get duration between marks
     */
    measure(startMark: string, endMark?: string): number {
        const start = this.marks.get(startMark) || this.startTime;
        const end = endMark ? (this.marks.get(endMark) || performance.now()) : performance.now();
        return end - start;
    }

    /**
     * Get all measurements
     */
    getAllMeasurements(): Record<string, number> {
        const measurements: Record<string, number> = {
            total: this.elapsed()
        };

        let previousTime = this.startTime;
        for (const [mark, time] of this.marks.entries()) {
            measurements[`to_${mark}`] = time - this.startTime;
            measurements[`delta_${mark}`] = time - previousTime;
            previousTime = time;
        }

        return measurements;
    }
}

/**
 * Metrics collector for aggregating performance data
 */
export class MetricsCollector extends EventEmitter {
    private metrics: MetricPoint[] = [];
    private counters = new Map<string, number>();
    private gauges = new Map<string, number>();
    private histograms = new Map<string, number[]>();
    private timers = new Map<string, PerformanceTimer>();
    private readonly maxMetricsSize: number;
    private readonly flushInterval: number;
    private flushTimer?: NodeJS.Timeout;

    constructor(maxMetricsSize: number = 10000, flushInterval: number = 60000) {
        super();
        this.maxMetricsSize = maxMetricsSize;
        this.flushInterval = flushInterval;
        this.startFlushTimer();
    }

    /**
     * Record a metric point
     */
    record(name: string, value: number, tags?: Record<string, string>): void {
        const metric: MetricPoint = {
            name,
            value,
            timestamp: Date.now(),
            tags
        };

        this.metrics.push(metric);
        this.emit('metric', metric);

        // Auto-flush if exceeding size limit
        if (this.metrics.length >= this.maxMetricsSize) {
            this.flush();
        }
    }

    /**
     * Increment a counter
     */
    increment(name: string, value: number = 1): void {
        const current = this.counters.get(name) || 0;
        this.counters.set(name, current + value);
        this.record(`counter.${name}`, current + value);
    }

    /**
     * Set a gauge value
     */
    gauge(name: string, value: number): void {
        this.gauges.set(name, value);
        this.record(`gauge.${name}`, value);
    }

    /**
     * Add value to histogram
     */
    histogram(name: string, value: number): void {
        if (!this.histograms.has(name)) {
            this.histograms.set(name, []);
        }
        this.histograms.get(name)!.push(value);
        this.record(`histogram.${name}`, value);
    }

    /**
     * Start a timer
     */
    startTimer(name: string): PerformanceTimer {
        const timer = new PerformanceTimer();
        this.timers.set(name, timer);
        return timer;
    }

    /**
     * End a timer and record duration
     */
    endTimer(name: string): number | null {
        const timer = this.timers.get(name);
        if (!timer) return null;

        const duration = timer.elapsed();
        this.histogram(`timer.${name}`, duration);
        this.timers.delete(name);
        return duration;
    }

    /**
     * Time an async operation
     */
    async timeOperation<T>(
        name: string,
        operation: () => Promise<T>
    ): Promise<T> {
        const timer = this.startTimer(name);
        let success = true;
        let error: string | undefined;

        try {
            const result = await operation();
            return result;
        } catch (err) {
            success = false;
            error = err instanceof Error ? err.message : String(err);
            throw err;
        } finally {
            const duration = timer.elapsed();
            this.record(`operation.${name}.duration`, duration, { success: String(success) });
            
            if (!success) {
                this.increment(`operation.${name}.errors`);
            }

            this.emit('operation', {
                operation: name,
                duration,
                success,
                error
            } as PerformanceMetrics);
        }
    }

    /**
     * Get histogram statistics
     */
    getHistogramStats(name: string): {
        count: number;
        min: number;
        max: number;
        mean: number;
        median: number;
        p95: number;
        p99: number;
    } | null {
        const values = this.histograms.get(name);
        if (!values || values.length === 0) return null;

        const sorted = [...values].sort((a, b) => a - b);
        const count = sorted.length;
        const sum = sorted.reduce((a, b) => a + b, 0);

        return {
            count,
            min: sorted[0],
            max: sorted[count - 1],
            mean: sum / count,
            median: sorted[Math.floor(count / 2)],
            p95: sorted[Math.floor(count * 0.95)],
            p99: sorted[Math.floor(count * 0.99)]
        };
    }

    /**
     * Get all statistics
     */
    getAllStats(): Record<string, any> {
        const stats: Record<string, any> = {
            counters: Object.fromEntries(this.counters),
            gauges: Object.fromEntries(this.gauges),
            histograms: {}
        };

        for (const [name, values] of this.histograms.entries()) {
            stats.histograms[name] = this.getHistogramStats(name);
        }

        return stats;
    }

    /**
     * Flush metrics
     */
    flush(): void {
        if (this.metrics.length === 0) return;

        this.emit('flush', this.metrics);
        this.metrics = [];
    }

    /**
     * Start flush timer
     */
    private startFlushTimer(): void {
        this.flushTimer = setInterval(() => {
            this.flush();
        }, this.flushInterval);
    }

    /**
     * Clear all metrics
     */
    clear(): void {
        this.metrics = [];
        this.counters.clear();
        this.gauges.clear();
        this.histograms.clear();
        this.timers.clear();
    }

    /**
     * Dispose collector
     */
    dispose(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = undefined;
        }
        this.flush();
        this.clear();
        this.removeAllListeners();
    }
}

/**
 * System metrics monitor
 */
export class SystemMonitor extends EventEmitter {
    private interval: number;
    private timer?: NodeJS.Timeout;
    private previousCpuUsage?: NodeJS.CpuUsage;
    private metrics: SystemMetrics[] = [];
    private readonly maxMetrics: number;

    constructor(interval: number = 5000, maxMetrics: number = 1000) {
        super();
        this.interval = interval;
        this.maxMetrics = maxMetrics;
    }

    /**
     * Start monitoring
     */
    start(): void {
        if (this.timer) return;

        this.previousCpuUsage = process.cpuUsage();
        
        this.timer = setInterval(() => {
            this.collect();
        }, this.interval);

        // Collect immediately
        this.collect();
    }

    /**
     * Stop monitoring
     */
    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    /**
     * Collect system metrics
     */
    private collect(): void {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage(this.previousCpuUsage);
        this.previousCpuUsage = process.cpuUsage();

        const metrics: SystemMetrics = {
            memoryUsage,
            cpuUsage,
            timestamp: Date.now()
        };

        this.metrics.push(metrics);
        
        // Trim old metrics
        if (this.metrics.length > this.maxMetrics) {
            this.metrics = this.metrics.slice(-this.maxMetrics);
        }

        this.emit('metrics', metrics);

        // Check for high memory usage
        const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
        if (heapUsedPercent > 90) {
            this.emit('warning', {
                type: 'memory',
                message: `High memory usage: ${heapUsedPercent.toFixed(2)}%`,
                value: heapUsedPercent
            });
        }
    }

    /**
     * Get average metrics over time window
     */
    getAverageMetrics(windowMs: number = 60000): {
        avgMemory: number;
        avgCpu: number;
        samples: number;
    } | null {
        const now = Date.now();
        const windowStart = now - windowMs;
        
        const windowMetrics = this.metrics.filter(m => m.timestamp >= windowStart);
        if (windowMetrics.length === 0) return null;

        const avgMemory = windowMetrics.reduce((sum, m) => sum + m.memoryUsage.heapUsed, 0) / windowMetrics.length;
        const avgCpu = windowMetrics.reduce((sum, m) => sum + (m.cpuUsage.user + m.cpuUsage.system), 0) / windowMetrics.length;

        return {
            avgMemory,
            avgCpu,
            samples: windowMetrics.length
        };
    }

    /**
     * Get current metrics
     */
    getCurrentMetrics(): SystemMetrics | null {
        return this.metrics[this.metrics.length - 1] || null;
    }

    /**
     * Format bytes to human readable
     */
    static formatBytes(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    /**
     * Get formatted report
     */
    getReport(): string {
        const current = this.getCurrentMetrics();
        if (!current) return 'No metrics available';

        const avg = this.getAverageMetrics();
        
        return `
System Metrics Report:
Current:
  Heap Used: ${SystemMonitor.formatBytes(current.memoryUsage.heapUsed)}
  Heap Total: ${SystemMonitor.formatBytes(current.memoryUsage.heapTotal)}
  RSS: ${SystemMonitor.formatBytes(current.memoryUsage.rss)}
  External: ${SystemMonitor.formatBytes(current.memoryUsage.external)}
  CPU User: ${(current.cpuUsage.user / 1000).toFixed(2)}ms
  CPU System: ${(current.cpuUsage.system / 1000).toFixed(2)}ms

${avg ? `Average (last minute):
  Memory: ${SystemMonitor.formatBytes(avg.avgMemory)}
  CPU: ${(avg.avgCpu / 1000).toFixed(2)}ms
  Samples: ${avg.samples}` : ''}
        `.trim();
    }

    /**
     * Dispose monitor
     */
    dispose(): void {
        this.stop();
        this.metrics = [];
        this.removeAllListeners();
    }
}

/**
 * Global metrics instance
 */
export const globalMetrics = new MetricsCollector();
export const systemMonitor = new SystemMonitor();

/**
 * Decorator for automatic method timing
 */
export function timed(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args: any[]) {
        const methodName = `${target.constructor.name}.${propertyKey}`;
        return await globalMetrics.timeOperation(methodName, () => originalMethod.apply(this, args));
    };

    return descriptor;
}

/**
 * Express middleware for request metrics
 */
export function metricsMiddleware() {
    return (req: any, res: any, next: any) => {
        const timer = globalMetrics.startTimer(`request.${req.method}.${req.path}`);
        
        res.on('finish', () => {
            const duration = timer.elapsed();
            globalMetrics.histogram('request.duration', duration);
            globalMetrics.increment(`request.status.${res.statusCode}`);
            
            if (res.statusCode >= 500) {
                globalMetrics.increment('request.errors.5xx');
            } else if (res.statusCode >= 400) {
                globalMetrics.increment('request.errors.4xx');
            }
        });

        next();
    };
}