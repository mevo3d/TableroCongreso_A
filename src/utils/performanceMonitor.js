/**
 * Performance monitoring utilities
 */

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            requests: new Map(),
            database: new Map(),
            memory: [],
            errors: []
        };
        this.startTime = Date.now();
    }

    /**
     * Start request timing
     * @param {string} requestId - Unique request ID
     * @param {Object} metadata - Request metadata
     */
    startRequest(requestId, metadata = {}) {
        this.metrics.requests.set(requestId, {
            startTime: Date.now(),
            metadata,
            completed: false
        });
    }

    /**
     * End request timing
     * @param {string} requestId - Request ID
     * @param {Object} result - Request result metadata
     */
    endRequest(requestId, result = {}) {
        const request = this.metrics.requests.get(requestId);
        if (request) {
            request.endTime = Date.now();
            request.duration = request.endTime - request.startTime;
            request.result = result;
            request.completed = true;
        }
    }

    /**
     * Record database query performance
     * @param {string} query - SQL query
     * @param {number} duration - Query duration in ms
     * @param {number} rowCount - Number of affected/returned rows
     */
    recordDatabaseQuery(query, duration, rowCount = 0) {
        const queryId = this._generateQueryId(query);
        
        if (!this.metrics.database.has(queryId)) {
            this.metrics.database.set(queryId, {
                query: this._sanitizeQuery(query),
                count: 0,
                totalDuration: 0,
                avgDuration: 0,
                minDuration: Infinity,
                maxDuration: 0,
                totalRows: 0
            });
        }

        const stats = this.metrics.database.get(queryId);
        stats.count++;
        stats.totalDuration += duration;
        stats.avgDuration = stats.totalDuration / stats.count;
        stats.minDuration = Math.min(stats.minDuration, duration);
        stats.maxDuration = Math.max(stats.maxDuration, duration);
        stats.totalRows += rowCount;
    }

    /**
     * Record memory usage
     */
    recordMemoryUsage() {
        const usage = process.memoryUsage();
        const timestamp = Date.now();
        
        this.metrics.memory.push({
            timestamp,
            rss: usage.rss,
            heapTotal: usage.heapTotal,
            heapUsed: usage.heapUsed,
            external: usage.external,
            arrayBuffers: usage.arrayBuffers
        });

        // Keep only last 100 memory snapshots
        if (this.metrics.memory.length > 100) {
            this.metrics.memory = this.metrics.memory.slice(-100);
        }
    }

    /**
     * Record error occurrence
     * @param {Error} error - Error object
     * @param {Object} context - Error context
     */
    recordError(error, context = {}) {
        this.metrics.errors.push({
            timestamp: Date.now(),
            message: error.message,
            stack: error.stack,
            code: error.code,
            statusCode: error.statusCode,
            context
        });

        // Keep only last 50 errors
        if (this.metrics.errors.length > 50) {
            this.metrics.errors = this.metrics.errors.slice(-50);
        }
    }

    /**
     * Get performance statistics
     * @returns {Object} - Performance statistics
     */
    getStats() {
        const now = Date.now();
        const uptime = now - this.startTime;

        // Request statistics
        const completedRequests = Array.from(this.metrics.requests.values())
            .filter(req => req.completed);
        
        const requestStats = {
            total: completedRequests.length,
            avgDuration: completedRequests.length > 0 ? 
                completedRequests.reduce((sum, req) => sum + req.duration, 0) / completedRequests.length : 0,
            maxDuration: completedRequests.length > 0 ?
                Math.max(...completedRequests.map(req => req.duration)) : 0,
            minDuration: completedRequests.length > 0 ?
                Math.min(...completedRequests.map(req => req.duration)) : 0
        };

        // Database statistics
        const dbStats = {
            totalQueries: Array.from(this.metrics.database.values())
                .reduce((sum, stats) => sum + stats.count, 0),
            slowQueries: Array.from(this.metrics.database.values())
                .filter(stats => stats.avgDuration > 1000).length,
            avgQueryDuration: Array.from(this.metrics.database.values())
                .reduce((sum, stats) => sum + stats.avgDuration, 0) / 
                (this.metrics.database.size || 1)
        };

        // Memory statistics
        const memoryStats = this._getMemoryStats();

        // Error statistics
        const errorStats = {
            total: this.metrics.errors.length,
            recent: this.metrics.errors.filter(err => 
                now - err.timestamp < 60000).length, // Last minute
            byCode: this._groupErrorsByCode()
        };

        return {
            uptime,
            uptimeFormatted: this._formatDuration(uptime),
            requests: requestStats,
            database: dbStats,
            memory: memoryStats,
            errors: errorStats,
            timestamp: now
        };
    }

    /**
     * Get slow queries report
     * @param {number} threshold - Duration threshold in ms
     * @returns {Array} - Slow queries
     */
    getSlowQueries(threshold = 1000) {
        return Array.from(this.metrics.database.entries())
            .filter(([_, stats]) => stats.avgDuration > threshold)
            .map(([id, stats]) => ({
                id,
                ...stats,
                avgDurationFormatted: `${stats.avgDuration.toFixed(2)}ms`
            }))
            .sort((a, b) => b.avgDuration - a.avgDuration);
    }

    /**
     * Get memory trend
     * @returns {Object} - Memory trend analysis
     */
    getMemoryTrend() {
        if (this.metrics.memory.length < 2) {
            return { trend: 'insufficient_data', samples: this.metrics.memory.length };
        }

        const recent = this.metrics.memory.slice(-10);
        const oldest = recent[0];
        const newest = recent[recent.length - 1];

        const heapTrend = newest.heapUsed - oldest.heapUsed;
        const rssTrend = newest.rss - oldest.rss;

        return {
            trend: heapTrend > 0 ? 'increasing' : heapTrend < 0 ? 'decreasing' : 'stable',
            heapChange: this._formatBytes(heapTrend),
            rssChange: this._formatBytes(rssTrend),
            samples: recent.length,
            timeSpan: newest.timestamp - oldest.timestamp
        };
    }

    /**
     * Clean old metrics
     * @param {number} maxAge - Max age in milliseconds
     */
    cleanup(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
        const cutoff = Date.now() - maxAge;

        // Clean old requests
        for (const [id, request] of this.metrics.requests.entries()) {
            if (request.startTime < cutoff) {
                this.metrics.requests.delete(id);
            }
        }

        // Clean old errors
        this.metrics.errors = this.metrics.errors
            .filter(error => error.timestamp >= cutoff);

        // Clean old memory records
        this.metrics.memory = this.metrics.memory
            .filter(record => record.timestamp >= cutoff);
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.metrics = {
            requests: new Map(),
            database: new Map(),
            memory: [],
            errors: []
        };
        this.startTime = Date.now();
    }

    // Private methods

    _generateQueryId(query) {
        // Create a hash-like ID from the query structure
        return query
            .replace(/\b\d+\b/g, '?') // Replace numbers with ?
            .replace(/\b'[^']*'/g, '?') // Replace string literals with ?
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim()
            .toLowerCase()
            .substring(0, 100); // Limit length
    }

    _sanitizeQuery(query) {
        return query
            .replace(/\b\d+\b/g, '?')
            .replace(/\b'[^']*'/g, '?')
            .substring(0, 200);
    }

    _getMemoryStats() {
        if (this.metrics.memory.length === 0) {
            return { current: null, trend: 'no_data' };
        }

        const latest = this.metrics.memory[this.metrics.memory.length - 1];
        return {
            current: {
                rss: this._formatBytes(latest.rss),
                heapTotal: this._formatBytes(latest.heapTotal),
                heapUsed: this._formatBytes(latest.heapUsed),
                external: this._formatBytes(latest.external),
                timestamp: latest.timestamp
            },
            trend: this.getMemoryTrend()
        };
    }

    _groupErrorsByCode() {
        const groups = {};
        this.metrics.errors.forEach(error => {
            const code = error.code || 'UNKNOWN';
            groups[code] = (groups[code] || 0) + 1;
        });
        return groups;
    }

    _formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
        const size = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
        return `${size} ${sizes[i]}`;
    }

    _formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }
}

// Global performance monitor instance
const globalMonitor = new PerformanceMonitor();

// Express middleware for automatic request tracking
const performanceMiddleware = (req, res, next) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    req.performanceId = requestId;
    globalMonitor.startRequest(requestId, {
        method: req.method,
        url: req.originalUrl,
        userAgent: req.get('User-Agent'),
        contentLength: req.get('Content-Length'),
        userId: req.user ? req.user.id : null
    });

    // Override res.json to capture response
    const originalJson = res.json;
    res.json = function(data) {
        globalMonitor.endRequest(requestId, {
            statusCode: res.statusCode,
            responseSize: JSON.stringify(data).length
        });
        return originalJson.call(this, data);
    };

    next();
};

// Database query wrapper for automatic tracking
const trackDatabaseQuery = (db, originalMethod) => {
    return function(sql, params, callback) {
        const startTime = Date.now();
        
        // Handle different parameter signatures
        let actualCallback = callback;
        let actualParams = params;
        
        if (typeof params === 'function') {
            actualCallback = params;
            actualParams = [];
        }

        const wrappedCallback = function(err, result) {
            const duration = Date.now() - startTime;
            const rowCount = Array.isArray(result) ? result.length : 
                           result && typeof result === 'object' && result.changes ? result.changes : 0;
            
            globalMonitor.recordDatabaseQuery(sql, duration, rowCount);
            
            if (actualCallback) {
                actualCallback.call(this, err, result);
            }
        };

        return originalMethod.call(this, sql, actualParams, wrappedCallback);
    };
};

// Auto-setup database tracking
const setupDatabaseTracking = (db) => {
    if (db && !db._performanceTracked) {
        db.get = trackDatabaseQuery(db, db.get);
        db.all = trackDatabaseQuery(db, db.all);
        db.run = trackDatabaseQuery(db, db.run);
        db._performanceTracked = true;
    }
    return db;
};

// Memory monitoring interval
setInterval(() => {
    globalMonitor.recordMemoryUsage();
}, 30000); // Every 30 seconds

// Cleanup interval
setInterval(() => {
    globalMonitor.cleanup();
}, 60 * 60 * 1000); // Every hour

module.exports = {
    PerformanceMonitor,
    globalMonitor,
    performanceMiddleware,
    setupDatabaseTracking,
    trackDatabaseQuery
};