/**
 * Cache middleware for performance optimization
 */

class MemoryCache {
    constructor(defaultTTL = 300000) { // 5 minutes default
        this.cache = new Map();
        this.timers = new Map();
        this.defaultTTL = defaultTTL;
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0
        };
    }

    /**
     * Set cache value with TTL
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttl - Time to live in milliseconds
     */
    set(key, value, ttl = this.defaultTTL) {
        // Clear existing timer if any
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
        }

        // Set cache value
        this.cache.set(key, {
            value,
            timestamp: Date.now(),
            ttl
        });

        // Set expiration timer
        const timer = setTimeout(() => {
            this.delete(key);
        }, ttl);

        this.timers.set(key, timer);
        this.stats.sets++;
    }

    /**
     * Get cache value
     * @param {string} key - Cache key
     * @returns {any|null} - Cached value or null
     */
    get(key) {
        const item = this.cache.get(key);
        
        if (!item) {
            this.stats.misses++;
            return null;
        }

        // Check if expired
        if (Date.now() > item.timestamp + item.ttl) {
            this.delete(key);
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        return item.value;
    }

    /**
     * Delete cache entry
     * @param {string} key - Cache key
     */
    delete(key) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
            this.stats.deletes++;
        }

        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
            this.timers.delete(key);
        }
    }

    /**
     * Clear all cache
     */
    clear() {
        // Clear all timers
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }

        this.cache.clear();
        this.timers.clear();
        this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0 };
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%',
            size: this.cache.size
        };
    }

    /**
     * Check if key exists
     * @param {string} key - Cache key
     */
    has(key) {
        return this.get(key) !== null;
    }

    /**
     * Get all keys
     */
    keys() {
        return Array.from(this.cache.keys());
    }
}

// Global cache instance
const globalCache = new MemoryCache();

/**
 * Create cache key from request
 * @param {Object} req - Express request object
 * @param {Array} includeParams - Parameters to include in key
 * @returns {string} - Cache key
 */
const createCacheKey = (req, includeParams = ['url', 'query']) => {
    const keyParts = [];

    if (includeParams.includes('url')) {
        keyParts.push(req.originalUrl || req.url);
    }

    if (includeParams.includes('query') && req.query) {
        const sortedQuery = Object.keys(req.query)
            .sort()
            .reduce((obj, key) => {
                obj[key] = req.query[key];
                return obj;
            }, {});
        keyParts.push(JSON.stringify(sortedQuery));
    }

    if (includeParams.includes('user') && req.user) {
        keyParts.push(`user:${req.user.id}:${req.user.role}`);
    }

    if (includeParams.includes('body') && req.body) {
        keyParts.push(JSON.stringify(req.body));
    }

    return keyParts.join('|');
};

/**
 * Cache middleware factory
 * @param {number} ttl - Time to live in milliseconds
 * @param {Array} keyParams - Parameters to include in cache key
 * @param {Function} condition - Function to determine if response should be cached
 * @returns {Function} - Express middleware
 */
const cache = (ttl = 300000, keyParams = ['url', 'query'], condition = null) => {
    return (req, res, next) => {
        // Skip cache for non-GET requests by default
        if (req.method !== 'GET') {
            return next();
        }

        const cacheKey = createCacheKey(req, keyParams);
        const cachedResponse = globalCache.get(cacheKey);

        if (cachedResponse) {
            // Set cache headers
            res.set('X-Cache', 'HIT');
            res.set('X-Cache-Key', cacheKey);
            
            return res.json(cachedResponse);
        }

        // Store original json method
        const originalJson = res.json;

        // Override json method to cache response
        res.json = function(data) {
            // Check condition if provided
            if (condition && !condition(req, res, data)) {
                res.set('X-Cache', 'SKIP');
                return originalJson.call(this, data);
            }

            // Only cache successful responses
            if (res.statusCode >= 200 && res.statusCode < 300) {
                globalCache.set(cacheKey, data, ttl);
                res.set('X-Cache', 'MISS');
                res.set('X-Cache-Key', cacheKey);
            }

            return originalJson.call(this, data);
        };

        next();
    };
};

/**
 * Cache invalidation middleware
 * @param {Array|string} patterns - Cache key patterns to invalidate
 * @returns {Function} - Express middleware
 */
const invalidateCache = (patterns) => {
    return (req, res, next) => {
        const patternsArray = Array.isArray(patterns) ? patterns : [patterns];
        
        // Store original json method
        const originalJson = res.json;
        
        // Override to invalidate cache after successful response
        res.json = function(data) {
            // Only invalidate on successful responses
            if (res.statusCode >= 200 && res.statusCode < 300) {
                const allKeys = globalCache.keys();
                
                patternsArray.forEach(pattern => {
                    // Support wildcards
                    if (pattern.includes('*')) {
                        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                        allKeys.forEach(key => {
                            if (regex.test(key)) {
                                globalCache.delete(key);
                            }
                        });
                    } else {
                        // Exact match or substring match
                        allKeys.forEach(key => {
                            if (key.includes(pattern)) {
                                globalCache.delete(key);
                            }
                        });
                    }
                });
            }
            
            return originalJson.call(this, data);
        };

        next();
    };
};

/**
 * Specific cache middleware for different data types
 */
const cacheStrategies = {
    // Static data that rarely changes - 1 hour
    static: cache(3600000, ['url']),
    
    // User-specific data - 5 minutes
    userSpecific: cache(300000, ['url', 'query', 'user']),
    
    // Session data - 1 minute
    sessionData: cache(60000, ['url', 'query'], (req, res, data) => {
        // Only cache if session is not active (active sessions change frequently)
        return !data.activa;
    }),
    
    // Configuration data - 30 minutes
    configuration: cache(1800000, ['url']),
    
    // Statistics - 2 minutes
    statistics: cache(120000, ['url', 'query']),
    
    // Public data - 10 minutes
    public: cache(600000, ['url', 'query'])
};

/**
 * Cache warming utilities
 */
const cacheWarming = {
    /**
     * Pre-populate cache with common data
     */
    async warmUp(app) {
        console.log('🔥 Warming up cache...');
        
        try {
            // Simulate requests to warm up common endpoints
            const commonEndpoints = [
                '/api/configuracion/public',
                '/api/pantalla/estado-general',
                '/api/pantalla/configuracion'
            ];

            for (const endpoint of commonEndpoints) {
                // Create mock request object
                const mockReq = {
                    method: 'GET',
                    originalUrl: endpoint,
                    url: endpoint,
                    query: {}
                };

                const key = createCacheKey(mockReq);
                console.log(`   • Warming up: ${endpoint}`);
            }

            console.log('✅ Cache warmed up successfully');
        } catch (error) {
            console.error('❌ Cache warming failed:', error.message);
        }
    }
};

/**
 * Cache statistics endpoint middleware
 */
const cacheStats = (req, res) => {
    const stats = globalCache.getStats();
    res.json({
        success: true,
        data: stats,
        cache_size_mb: (JSON.stringify(Array.from(globalCache.cache.entries())).length / 1024 / 1024).toFixed(2)
    });
};

/**
 * Clear cache endpoint middleware
 */
const clearCache = (req, res) => {
    const oldSize = globalCache.cache.size;
    globalCache.clear();
    
    res.json({
        success: true,
        message: `Cache cleared. Removed ${oldSize} entries.`
    });
};

/**
 * Conditional cache based on request headers
 */
const conditionalCache = (ttl = 300000) => {
    return (req, res, next) => {
        // Skip cache if no-cache header is present
        if (req.headers['cache-control'] === 'no-cache') {
            res.set('X-Cache', 'SKIP');
            return next();
        }

        // Use regular cache middleware
        return cache(ttl)(req, res, next);
    };
};

module.exports = {
    MemoryCache,
    globalCache,
    cache,
    invalidateCache,
    cacheStrategies,
    cacheWarming,
    cacheStats,
    clearCache,
    conditionalCache,
    createCacheKey
};