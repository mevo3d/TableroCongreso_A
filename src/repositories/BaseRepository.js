/**
 * Base Repository Pattern Implementation
 * Provides abstraction layer for database operations
 */
class BaseRepository {
    constructor(db, tableName) {
        this.db = db;
        this.tableName = tableName;
    }

    /**
     * Execute a database query with promise wrapper
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @param {string} method - Database method (get, all, run)
     * @returns {Promise}
     */
    query(sql, params = [], method = 'all') {
        return new Promise((resolve, reject) => {
            this.db[method](sql, params, function(err, result) {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    }

    /**
     * Get single record by ID
     * @param {number} id - Record ID
     * @returns {Promise<Object|null>}
     */
    async findById(id) {
        const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
        return this.query(sql, [id], 'get');
    }

    /**
     * Get all records with optional conditions
     * @param {Object} conditions - Where conditions
     * @param {Array} orderBy - Order by fields
     * @param {number} limit - Limit results
     * @returns {Promise<Array>}
     */
    async findAll(conditions = {}, orderBy = [], limit = null) {
        let sql = `SELECT * FROM ${this.tableName}`;
        const params = [];

        // Add WHERE clause
        if (Object.keys(conditions).length > 0) {
            const whereClause = Object.keys(conditions)
                .map(key => `${key} = ?`)
                .join(' AND ');
            sql += ` WHERE ${whereClause}`;
            params.push(...Object.values(conditions));
        }

        // Add ORDER BY clause
        if (orderBy.length > 0) {
            sql += ` ORDER BY ${orderBy.join(', ')}`;
        }

        // Add LIMIT clause
        if (limit) {
            sql += ` LIMIT ?`;
            params.push(limit);
        }

        return this.query(sql, params);
    }

    /**
     * Create new record
     * @param {Object} data - Record data
     * @returns {Promise<Object>}
     */
    async create(data) {
        const fields = Object.keys(data);
        const placeholders = fields.map(() => '?').join(', ');
        const sql = `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
        
        const result = await this.query(sql, Object.values(data), 'run');
        return this.findById(result.lastID);
    }

    /**
     * Update record by ID
     * @param {number} id - Record ID
     * @param {Object} data - Update data
     * @returns {Promise<Object>}
     */
    async update(id, data) {
        const fields = Object.keys(data);
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
        const params = [...Object.values(data), id];

        await this.query(sql, params, 'run');
        return this.findById(id);
    }

    /**
     * Delete record by ID
     * @param {number} id - Record ID
     * @returns {Promise<boolean>}
     */
    async delete(id) {
        const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
        const result = await this.query(sql, [id], 'run');
        return result.changes > 0;
    }

    /**
     * Execute raw SQL query
     * @param {string} sql - Raw SQL query
     * @param {Array} params - Query parameters
     * @param {string} method - Database method
     * @returns {Promise}
     */
    async raw(sql, params = [], method = 'all') {
        return this.query(sql, params, method);
    }

    /**
     * Get record count with optional conditions
     * @param {Object} conditions - Where conditions
     * @returns {Promise<number>}
     */
    async count(conditions = {}) {
        let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
        const params = [];

        if (Object.keys(conditions).length > 0) {
            const whereClause = Object.keys(conditions)
                .map(key => `${key} = ?`)
                .join(' AND ');
            sql += ` WHERE ${whereClause}`;
            params.push(...Object.values(conditions));
        }

        const result = await this.query(sql, params, 'get');
        return result.count;
    }
}

module.exports = BaseRepository;