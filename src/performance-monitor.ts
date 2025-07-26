/**
 * Performance monitoring utility for the Daily Prompts plugin
 * Tracks performance metrics and provides optimization recommendations
 */

export interface PerformanceMetrics {
  memoryUsage: number;
  cacheHitRate: number;
  averageResponseTime: number;
  operationCounts: Record<string, number>;
  errorRate: number;
  lastOptimization: Date;
}

export interface PerformanceRecommendation {
  type: 'memory' | 'cache' | 'io' | 'general';
  severity: 'low' | 'medium' | 'high';
  message: string;
  action?: string;
}

/**
 * Performance monitor class
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private operationTimes: Map<string, number[]> = new Map();
  private readonly MAX_OPERATION_HISTORY = 100;
  private readonly MONITORING_INTERVAL = 60000; // 1 minute
  private monitoringTimer: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  constructor() {
    this.metrics = {
      memoryUsage: 0,
      cacheHitRate: 0,
      averageResponseTime: 0,
      operationCounts: {},
      errorRate: 0,
      lastOptimization: new Date()
    };
  }

  /**
   * Start performance monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringTimer = setInterval(() => {
      this.collectMetrics();
    }, this.MONITORING_INTERVAL);

    console.log('Daily Prompts: Performance monitoring started');
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    console.log('Daily Prompts: Performance monitoring stopped');
  }

  /**
   * Record operation timing
   */
  recordOperation(operationName: string, startTime: number): void {
    const duration = Date.now() - startTime;

    // Update operation count
    this.metrics.operationCounts[operationName] = (this.metrics.operationCounts[operationName] || 0) + 1;

    // Record timing
    if (!this.operationTimes.has(operationName)) {
      this.operationTimes.set(operationName, []);
    }

    const times = this.operationTimes.get(operationName)!;
    times.push(duration);

    // Limit history size
    if (times.length > this.MAX_OPERATION_HISTORY) {
      times.shift();
    }

    // Update average response time
    this.updateAverageResponseTime();
  }

  /**
   * Record error occurrence
   */
  recordError(operationName: string, error: Error): void {
    const errorKey = `${operationName}_errors`;
    this.metrics.operationCounts[errorKey] = (this.metrics.operationCounts[errorKey] || 0) + 1;

    // Update error rate
    this.updateErrorRate();
  }

  /**
   * Update cache hit rate
   */
  updateCacheHitRate(hits: number, total: number): void {
    if (total > 0) {
      this.metrics.cacheHitRate = hits / total;
    }
  }

  /**
   * Update memory usage estimate
   */
  updateMemoryUsage(bytes: number): void {
    this.metrics.memoryUsage = bytes;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get performance recommendations
   */
  getRecommendations(): PerformanceRecommendation[] {
    const recommendations: PerformanceRecommendation[] = [];

    // Memory recommendations
    if (this.metrics.memoryUsage > 50 * 1024 * 1024) { // 50MB
      recommendations.push({
        type: 'memory',
        severity: 'high',
        message: 'High memory usage detected',
        action: 'Consider clearing caches or reducing loaded data'
      });
    } else if (this.metrics.memoryUsage > 20 * 1024 * 1024) { // 20MB
      recommendations.push({
        type: 'memory',
        severity: 'medium',
        message: 'Moderate memory usage',
        action: 'Monitor memory usage and consider optimization'
      });
    }

    // Cache recommendations
    if (this.metrics.cacheHitRate < 0.5) {
      recommendations.push({
        type: 'cache',
        severity: 'medium',
        message: 'Low cache hit rate detected',
        action: 'Consider adjusting cache TTL or preloading frequently accessed data'
      });
    }

    // Response time recommendations
    if (this.metrics.averageResponseTime > 1000) { // 1 second
      recommendations.push({
        type: 'io',
        severity: 'high',
        message: 'Slow response times detected',
        action: 'Consider optimizing data access patterns or enabling compression'
      });
    } else if (this.metrics.averageResponseTime > 500) { // 500ms
      recommendations.push({
        type: 'io',
        severity: 'medium',
        message: 'Moderate response times',
        action: 'Consider implementing lazy loading or caching'
      });
    }

    // Error rate recommendations
    if (this.metrics.errorRate > 0.1) { // 10% error rate
      recommendations.push({
        type: 'general',
        severity: 'high',
        message: 'High error rate detected',
        action: 'Review error logs and implement better error handling'
      });
    }

    return recommendations;
  }

  /**
   * Get operation statistics
   */
  getOperationStats(): Record<string, {
    count: number;
    averageTime: number;
    minTime: number;
    maxTime: number;
  }> {
    const stats: Record<string, any> = {};

    for (const [operation, times] of this.operationTimes.entries()) {
      if (times.length > 0) {
        stats[operation] = {
          count: this.metrics.operationCounts[operation] || 0,
          averageTime: times.reduce((sum, time) => sum + time, 0) / times.length,
          minTime: Math.min(...times),
          maxTime: Math.max(...times)
        };
      }
    }

    return stats;
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const metrics = this.getMetrics();
    const recommendations = this.getRecommendations();
    const operationStats = this.getOperationStats();

    let report = '# Daily Prompts Performance Report\n\n';

    // Metrics section
    report += '## Current Metrics\n';
    report += `- Memory Usage: ${(metrics.memoryUsage / 1024 / 1024).toFixed(2)} MB\n`;
    report += `- Cache Hit Rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%\n`;
    report += `- Average Response Time: ${metrics.averageResponseTime.toFixed(0)}ms\n`;
    report += `- Error Rate: ${(metrics.errorRate * 100).toFixed(1)}%\n`;
    report += `- Last Optimization: ${metrics.lastOptimization.toLocaleString()}\n\n`;

    // Operation statistics
    report += '## Operation Statistics\n';
    for (const [operation, stats] of Object.entries(operationStats)) {
      report += `- ${operation}: ${stats.count} ops, avg ${stats.averageTime.toFixed(0)}ms\n`;
    }
    report += '\n';

    // Recommendations section
    if (recommendations.length > 0) {
      report += '## Recommendations\n';
      for (const rec of recommendations) {
        const severity = rec.severity.toUpperCase();
        report += `- [${severity}] ${rec.message}\n`;
        if (rec.action) {
          report += `  Action: ${rec.action}\n`;
        }
      }
    } else {
      report += '## Recommendations\nNo performance issues detected.\n';
    }

    return report;
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.metrics = {
      memoryUsage: 0,
      cacheHitRate: 0,
      averageResponseTime: 0,
      operationCounts: {},
      errorRate: 0,
      lastOptimization: new Date()
    };
    this.operationTimes.clear();
  }

  /**
   * Collect current metrics
   */
  private collectMetrics(): void {
    // This would be called periodically to update metrics
    // In a real implementation, this would gather data from various sources

    // Update average response time
    this.updateAverageResponseTime();

    // Update error rate
    this.updateErrorRate();
  }

  /**
   * Update average response time from recorded operations
   */
  private updateAverageResponseTime(): void {
    let totalTime = 0;
    let totalOperations = 0;

    for (const times of this.operationTimes.values()) {
      totalTime += times.reduce((sum, time) => sum + time, 0);
      totalOperations += times.length;
    }

    this.metrics.averageResponseTime = totalOperations > 0 ? totalTime / totalOperations : 0;
  }

  /**
   * Update error rate from recorded operations
   */
  private updateErrorRate(): void {
    let totalErrors = 0;
    let totalOperations = 0;

    for (const [operation, count] of Object.entries(this.metrics.operationCounts)) {
      if (operation.endsWith('_errors')) {
        totalErrors += count;
      } else {
        totalOperations += count;
      }
    }

    this.metrics.errorRate = totalOperations > 0 ? totalErrors / totalOperations : 0;
  }

  /**
   * Create a performance measurement wrapper
   */
  measureAsync<T>(operationName: string, operation: () => Promise<T>): Promise<T> {
    const startTime = Date.now();

    return operation()
      .then(result => {
        this.recordOperation(operationName, startTime);
        return result;
      })
      .catch(error => {
        this.recordError(operationName, error);
        this.recordOperation(operationName, startTime);
        throw error;
      });
  }

  /**
   * Create a performance measurement wrapper for sync operations
   */
  measureSync<T>(operationName: string, operation: () => T): T {
    const startTime = Date.now();

    try {
      const result = operation();
      this.recordOperation(operationName, startTime);
      return result;
    } catch (error) {
      this.recordError(operationName, error as Error);
      this.recordOperation(operationName, startTime);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopMonitoring();
    this.operationTimes.clear();
    this.resetMetrics();
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();