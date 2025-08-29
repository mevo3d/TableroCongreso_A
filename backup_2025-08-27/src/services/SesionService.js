const SesionRepository = require('../repositories/SesionRepository');

/**
 * Session Service - Business logic for session management
 */
class SesionService {
    constructor(db, ioInstance) {
        this.sesionRepo = new SesionRepository(db);
        this.db = db;
        this.io = ioInstance;
    }

    /**
     * Create new session from PDF/document
     * @param {Object} sessionData - Session data
     * @param {Array} iniciativas - Extracted initiatives
     * @param {number} userId - User creating session
     * @returns {Promise<Object>}
     */
    async createSessionFromDocument(sessionData, iniciativas, userId) {
        try {
            // Generate unique session code
            const fecha = new Date();
            const fechaStr = fecha.toISOString().split('T')[0];
            const horaStr = fecha.toTimeString().split(' ')[0].substring(0, 5).replace(':', '');
            const codigoSesion = `SES-${fechaStr}-${horaStr}`;

            // Prepare session data
            const sesionData = {
                codigo_sesion: codigoSesion,
                nombre: sessionData.nombreSesion || `Sesión ${fechaStr}`,
                tipo_sesion: sessionData.tipoSesion || 'ordinaria',
                estado: this._determineSessionState(sessionData),
                fecha_programada: sessionData.fechaProgramada || null,
                ejecutar_inmediato: sessionData.ejecutarInmediato ? 1 : 0,
                notas: sessionData.notas || '',
                iniciada_por: userId
            };

            // Create session in transaction
            return await this._executeInTransaction(async () => {
                // Create session
                const sesion = await this.sesionRepo.createSession(sesionData);

                // Create initiatives
                const iniciativasCreadas = [];
                for (let i = 0; i < iniciativas.length; i++) {
                    const iniciativa = iniciativas[i];
                    const iniciativaData = {
                        sesion_id: sesion.id,
                        numero: i + 1,
                        titulo: iniciativa.titulo,
                        descripcion: iniciativa.descripcion || '',
                        tipo_mayoria: iniciativa.tipoMayoria || 'simple',
                        presentador: iniciativa.presentador || '',
                        partido_presentador: iniciativa.partidoPresentador || ''
                    };

                    const nuevaIniciativa = await this._createInitiative(iniciativaData);
                    iniciativasCreadas.push(nuevaIniciativa);
                }

                // Log session creation
                await this._logSessionEvent(sesion.id, 'sesion_creada', 
                    `Sesión creada con ${iniciativasCreadas.length} iniciativas`, userId);

                // Notify via WebSocket
                this._notifySessionCreated(sesion, iniciativasCreadas);

                return {
                    sesion,
                    iniciativas: iniciativasCreadas
                };
            });

        } catch (error) {
            throw new Error(`Error creating session: ${error.message}`);
        }
    }

    /**
     * Activate session and manage state
     * @param {number} sessionId - Session ID
     * @param {number} userId - User activating
     * @returns {Promise<Object>}
     */
    async activateSession(sessionId, userId) {
        try {
            // Check if session exists and can be activated
            const session = await this.sesionRepo.findById(sessionId);
            if (!session) {
                throw new Error('Sesión no encontrada');
            }

            if (session.estado === 'cerrada') {
                throw new Error('No se puede activar una sesión cerrada');
            }

            // Activate session (automatically deactivates others)
            const activatedSession = await this.sesionRepo.activateSession(sessionId, userId);

            // Log event
            await this._logSessionEvent(sessionId, 'sesion_activada', 
                'Sesión iniciada oficialmente', userId);

            // Notify all clients
            this.io.emit('session-activated', {
                session: activatedSession,
                timestamp: new Date().toISOString()
            });

            return activatedSession;

        } catch (error) {
            throw new Error(`Error activating session: ${error.message}`);
        }
    }

    /**
     * Close session with validation
     * @param {number} sessionId - Session ID
     * @param {number} userId - User closing session
     * @returns {Promise<Object>}
     */
    async closeSession(sessionId, userId) {
        try {
            const session = await this.sesionRepo.findById(sessionId);
            if (!session) {
                throw new Error('Sesión no encontrada');
            }

            if (session.estado === 'cerrada') {
                throw new Error('La sesión ya está cerrada');
            }

            // Check if all initiatives are closed
            const openInitiatives = await this._getOpenInitiatives(sessionId);
            if (openInitiatives.length > 0) {
                throw new Error(`Hay ${openInitiatives.length} iniciativa(s) aún abiertas`);
            }

            // Close session
            const closedSession = await this.sesionRepo.closeSession(sessionId, userId);

            // Log event
            await this._logSessionEvent(sessionId, 'sesion_cerrada', 
                'Sesión clausurada oficialmente', userId);

            // Notify all clients
            this.io.emit('session-closed', {
                session: closedSession,
                timestamp: new Date().toISOString()
            });

            return closedSession;

        } catch (error) {
            throw new Error(`Error closing session: ${error.message}`);
        }
    }

    /**
     * Get session with complete information
     * @param {number} sessionId - Session ID
     * @returns {Promise<Object>}
     */
    async getSessionDetails(sessionId) {
        try {
            // Get session stats
            const sessionStats = await this.sesionRepo.getSessionStats(sessionId);
            if (!sessionStats) {
                throw new Error('Sesión no encontrada');
            }

            // Get initiatives
            const initiatives = await this._getSessionInitiatives(sessionId);

            // Get session history
            const history = await this._getSessionHistory(sessionId);

            return {
                ...sessionStats,
                iniciativas: initiatives,
                historial: history
            };

        } catch (error) {
            throw new Error(`Error getting session details: ${error.message}`);
        }
    }

    /**
     * Get paginated sessions with filters
     * @param {Object} filters - Filter criteria
     * @param {number} page - Page number
     * @param {number} limit - Items per page
     * @returns {Promise<Object>}
     */
    async getPaginatedSessions(filters = {}, page = 1, limit = 10) {
        return this.sesionRepo.getPaginated(filters, page, limit);
    }

    /**
     * Get active session
     * @returns {Promise<Object|null>}
     */
    async getActiveSession() {
        return this.sesionRepo.getActiveSession();
    }

    /**
     * Get recent sessions
     * @param {number} limit - Number of sessions
     * @returns {Promise<Array>}
     */
    async getRecentSessions(limit = 5) {
        return this.sesionRepo.getRecent(limit);
    }

    // Private methods

    /**
     * Determine session state based on configuration
     * @private
     */
    _determineSessionState(sessionData) {
        if (sessionData.ejecutarInmediato) {
            return 'preparada'; // Will be activated immediately after creation
        }
        if (sessionData.fechaProgramada) {
            return 'programada';
        }
        return 'preparada';
    }

    /**
     * Execute operations in database transaction
     * @private
     */
    async _executeInTransaction(operations) {
        return new Promise((resolve, reject) => {
            this.db.serialize(async () => {
                this.db.run('BEGIN TRANSACTION');
                try {
                    const result = await operations();
                    this.db.run('COMMIT');
                    resolve(result);
                } catch (error) {
                    this.db.run('ROLLBACK');
                    reject(error);
                }
            });
        });
    }

    /**
     * Create initiative in database
     * @private
     */
    async _createInitiative(iniciativaData) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO iniciativas 
                (sesion_id, numero, titulo, descripcion, tipo_mayoria, presentador, partido_presentador)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            const params = [
                iniciativaData.sesion_id,
                iniciativaData.numero,
                iniciativaData.titulo,
                iniciativaData.descripcion,
                iniciativaData.tipo_mayoria,
                iniciativaData.presentador,
                iniciativaData.partido_presentador
            ];

            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    // Get created initiative
                    const getInitiative = 'SELECT * FROM iniciativas WHERE id = ?';
                    this.db.get(getInitiative, [this.lastID], (err, initiative) => {
                        if (err) reject(err);
                        else resolve(initiative);
                    });
                }
            });
        });
    }

    /**
     * Log session event
     * @private
     */
    async _logSessionEvent(sessionId, tipoEvento, descripcion, userId) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO historial_sesiones (sesion_id, tipo_evento, descripcion, usuario_id)
                VALUES (?, ?, ?, ?)
            `;
            
            this.db.run(sql, [sessionId, tipoEvento, descripcion, userId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Get open initiatives for a session
     * @private
     */
    async _getOpenInitiatives(sessionId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM iniciativas WHERE sesion_id = ? AND cerrada = 0';
            this.db.all(sql, [sessionId], (err, initiatives) => {
                if (err) reject(err);
                else resolve(initiatives);
            });
        });
    }

    /**
     * Get all initiatives for a session
     * @private
     */
    async _getSessionInitiatives(sessionId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT i.*, 
                       COUNT(v.id) as total_votos,
                       SUM(CASE WHEN v.voto = 'favor' THEN 1 ELSE 0 END) as votos_favor,
                       SUM(CASE WHEN v.voto = 'contra' THEN 1 ELSE 0 END) as votos_contra,
                       SUM(CASE WHEN v.voto = 'abstencion' THEN 1 ELSE 0 END) as votos_abstencion
                FROM iniciativas i
                LEFT JOIN votos v ON i.id = v.iniciativa_id
                WHERE i.sesion_id = ?
                GROUP BY i.id
                ORDER BY i.numero
            `;
            
            this.db.all(sql, [sessionId], (err, initiatives) => {
                if (err) reject(err);
                else resolve(initiatives);
            });
        });
    }

    /**
     * Get session history
     * @private
     */
    async _getSessionHistory(sessionId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT h.*, u.nombre_completo as usuario_nombre
                FROM historial_sesiones h
                LEFT JOIN usuarios u ON h.usuario_id = u.id
                WHERE h.sesion_id = ?
                ORDER BY h.fecha_evento DESC
            `;
            
            this.db.all(sql, [sessionId], (err, history) => {
                if (err) reject(err);
                else resolve(history);
            });
        });
    }

    /**
     * Notify session creation via WebSocket
     * @private
     */
    _notifySessionCreated(session, initiatives) {
        if (this.io) {
            this.io.emit('session-created', {
                session,
                initiatives,
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = SesionService;