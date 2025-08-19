const BaseRepository = require('./BaseRepository');

/**
 * Sesion Repository - Handles session-related database operations
 */
class SesionRepository extends BaseRepository {
    constructor(db) {
        super(db, 'sesiones');
    }

    /**
     * Get active session
     * @returns {Promise<Object|null>}
     */
    async getActiveSession() {
        const sql = 'SELECT * FROM sesiones WHERE activa = 1 LIMIT 1';
        return this.query(sql, [], 'get');
    }

    /**
     * Create new session with validation
     * @param {Object} sessionData - Session data
     * @returns {Promise<Object>}
     */
    async createSession(sessionData) {
        // Validate required fields
        const requiredFields = ['codigo_sesion', 'nombre'];
        for (const field of requiredFields) {
            if (!sessionData[field]) {
                throw new Error(`Campo requerido: ${field}`);
            }
        }

        // Check for duplicate session code
        const existing = await this.findByCode(sessionData.codigo_sesion);
        if (existing) {
            throw new Error('Ya existe una sesión con este código');
        }

        return this.create({
            ...sessionData,
            fecha: sessionData.fecha || new Date().toISOString(),
            estado: sessionData.estado || 'preparada',
            activa: 0
        });
    }

    /**
     * Find session by code
     * @param {string} codigo - Session code
     * @returns {Promise<Object|null>}
     */
    async findByCode(codigo) {
        const sql = 'SELECT * FROM sesiones WHERE codigo_sesion = ?';
        return this.query(sql, [codigo], 'get');
    }

    /**
     * Activate session (deactivate others first)
     * @param {number} sessionId - Session ID
     * @param {number} userId - User who activates
     * @returns {Promise<Object>}
     */
    async activateSession(sessionId, userId) {
        await this.db.serialize(async () => {
            // Deactivate all sessions
            await this.query('UPDATE sesiones SET activa = 0', [], 'run');
            
            // Activate selected session
            await this.query(
                'UPDATE sesiones SET activa = 1, estado = ?, iniciada_por = ? WHERE id = ?',
                ['activa', userId, sessionId],
                'run'
            );
        });

        return this.findById(sessionId);
    }

    /**
     * Close session
     * @param {number} sessionId - Session ID
     * @param {number} userId - User who closes
     * @returns {Promise<Object>}
     */
    async closeSession(sessionId, userId) {
        const updateData = {
            activa: 0,
            estado: 'cerrada',
            fecha_clausura: new Date().toISOString(),
            clausurada_por: userId
        };

        return this.update(sessionId, updateData);
    }

    /**
     * Get sessions with pagination and filters
     * @param {Object} filters - Filter criteria
     * @param {number} page - Page number
     * @param {number} limit - Items per page
     * @returns {Promise<Object>}
     */
    async getPaginated(filters = {}, page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        let whereClause = '';
        const params = [];

        // Build where clause from filters
        if (filters.estado) {
            whereClause += whereClause ? ' AND ' : ' WHERE ';
            whereClause += 'estado = ?';
            params.push(filters.estado);
        }

        if (filters.fecha_desde) {
            whereClause += whereClause ? ' AND ' : ' WHERE ';
            whereClause += 'DATE(fecha) >= DATE(?)';
            params.push(filters.fecha_desde);
        }

        if (filters.fecha_hasta) {
            whereClause += whereClause ? ' AND ' : ' WHERE ';
            whereClause += 'DATE(fecha) <= DATE(?)';
            params.push(filters.fecha_hasta);
        }

        // Get total count
        const countSql = `SELECT COUNT(*) as total FROM sesiones${whereClause}`;
        const countResult = await this.query(countSql, params, 'get');
        const total = countResult.total;

        // Get paginated results
        const sql = `
            SELECT s.*, u.nombre_completo as iniciada_por_nombre,
                   c.nombre_completo as clausurada_por_nombre
            FROM sesiones s
            LEFT JOIN usuarios u ON s.iniciada_por = u.id
            LEFT JOIN usuarios c ON s.clausurada_por = c.id
            ${whereClause}
            ORDER BY s.fecha DESC
            LIMIT ? OFFSET ?
        `;

        const data = await this.query(sql, [...params, limit, offset]);

        return {
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Get session statistics
     * @param {number} sessionId - Session ID
     * @returns {Promise<Object>}
     */
    async getSessionStats(sessionId) {
        const sql = `
            SELECT 
                s.*,
                COUNT(DISTINCT i.id) as total_iniciativas,
                COUNT(DISTINCT CASE WHEN i.cerrada = 1 THEN i.id END) as iniciativas_cerradas,
                COUNT(DISTINCT v.id) as total_votos,
                u.nombre_completo as iniciada_por_nombre
            FROM sesiones s
            LEFT JOIN iniciativas i ON s.id = i.sesion_id
            LEFT JOIN votos v ON i.id = v.iniciativa_id
            LEFT JOIN usuarios u ON s.iniciada_por = u.id
            WHERE s.id = ?
            GROUP BY s.id
        `;

        return this.query(sql, [sessionId], 'get');
    }

    /**
     * Get recent sessions
     * @param {number} limit - Number of sessions
     * @returns {Promise<Array>}
     */
    async getRecent(limit = 5) {
        const sql = `
            SELECT s.*, u.nombre_completo as iniciada_por_nombre
            FROM sesiones s
            LEFT JOIN usuarios u ON s.iniciada_por = u.id
            ORDER BY s.fecha DESC
            LIMIT ?
        `;

        return this.query(sql, [limit]);
    }
}

module.exports = SesionRepository;