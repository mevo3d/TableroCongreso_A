const VotacionRepository = require('../repositories/VotacionRepository');

/**
 * Votacion Service - Business logic for voting operations
 */
class VotacionService {
    constructor(db, ioInstance) {
        this.votacionRepo = new VotacionRepository(db);
        this.db = db;
        this.io = ioInstance;
    }

    /**
     * Cast vote with business logic validation
     * @param {number} iniciativaId - Initiative ID
     * @param {number} usuarioId - User ID
     * @param {string} voto - Vote type
     * @returns {Promise<Object>}
     */
    async castVote(iniciativaId, usuarioId, voto) {
        try {
            // Validate user can vote
            await this._validateUserCanVote(usuarioId);

            // Validate initiative is active
            await this._validateInitiativeActive(iniciativaId);

            // Cast the vote
            const voteResult = await this.votacionRepo.castVote(iniciativaId, usuarioId, voto);

            // Get updated voting results
            const votingResults = await this.votacionRepo.getVotingResults(iniciativaId);

            // Update initiative vote counts
            await this._updateInitiativeVoteCounts(iniciativaId, votingResults.counts);

            // Notify all clients of vote update
            this._notifyVoteUpdate(iniciativaId, votingResults, voteResult);

            return {
                vote: voteResult,
                results: votingResults
            };

        } catch (error) {
            throw new Error(`Error casting vote: ${error.message}`);
        }
    }

    /**
     * Get comprehensive voting results for an initiative
     * @param {number} iniciativaId - Initiative ID
     * @returns {Promise<Object>}
     */
    async getVotingResults(iniciativaId) {
        try {
            const results = await this.votacionRepo.getVotingResults(iniciativaId);
            
            // Add additional analysis
            results.analysis = this._analyzeVotingResults(results);
            
            return results;

        } catch (error) {
            throw new Error(`Error getting voting results: ${error.message}`);
        }
    }

    /**
     * Open initiative for voting
     * @param {number} iniciativaId - Initiative ID
     * @param {number} userId - User opening initiative
     * @returns {Promise<Object>}
     */
    async openInitiative(iniciativaId, userId) {
        try {
            // Validate user has permission (operador/superadmin)
            await this._validateUserPermission(userId, ['operador', 'superadmin']);

            // Get initiative
            const initiative = await this._getInitiative(iniciativaId);
            if (!initiative) {
                throw new Error('Iniciativa no encontrada');
            }

            if (initiative.activa === 1) {
                throw new Error('La iniciativa ya está activa');
            }

            if (initiative.cerrada === 1) {
                throw new Error('La iniciativa ya está cerrada');
            }

            // Close any other active initiative in the same session
            await this._closeOtherActiveInitiatives(initiative.sesion_id, iniciativaId);

            // Open the initiative
            await this._updateInitiative(iniciativaId, { 
                activa: 1, 
                cerrada: 0 
            });

            const updatedInitiative = await this._getInitiative(iniciativaId);

            // Log event
            await this._logInitiativeEvent(iniciativaId, 'iniciativa_abierta', 
                'Iniciativa abierta para votación', userId);

            // Notify all clients
            this.io.emit('initiative-opened', {
                initiative: updatedInitiative,
                timestamp: new Date().toISOString()
            });

            return updatedInitiative;

        } catch (error) {
            throw new Error(`Error opening initiative: ${error.message}`);
        }
    }

    /**
     * Close initiative and calculate final results
     * @param {number} iniciativaId - Initiative ID
     * @param {number} userId - User closing initiative
     * @returns {Promise<Object>}
     */
    async closeInitiative(iniciativaId, userId) {
        try {
            // Validate user has permission
            await this._validateUserPermission(userId, ['operador', 'superadmin']);

            // Get initiative
            const initiative = await this._getInitiative(iniciativaId);
            if (!initiative) {
                throw new Error('Iniciativa no encontrada');
            }

            if (initiative.cerrada === 1) {
                throw new Error('La iniciativa ya está cerrada');
            }

            // Get final voting results
            const votingResults = await this.votacionRepo.getVotingResults(iniciativaId);
            
            // Determine final result
            const finalResult = this._calculateFinalResult(initiative, votingResults);

            // Update initiative with final results
            await this._updateInitiative(iniciativaId, {
                activa: 0,
                cerrada: 1,
                resultado: finalResult,
                votos_favor: votingResults.counts.favor,
                votos_contra: votingResults.counts.contra,
                votos_abstencion: votingResults.counts.abstencion
            });

            const updatedInitiative = await this._getInitiative(iniciativaId);

            // Log event
            await this._logInitiativeEvent(iniciativaId, 'iniciativa_cerrada', 
                `Iniciativa cerrada - Resultado: ${finalResult}`, userId);

            // Notify all clients
            this.io.emit('initiative-closed', {
                initiative: updatedInitiative,
                results: votingResults,
                final_result: finalResult,
                timestamp: new Date().toISOString()
            });

            return {
                initiative: updatedInitiative,
                results: votingResults,
                final_result: finalResult
            };

        } catch (error) {
            throw new Error(`Error closing initiative: ${error.message}`);
        }
    }

    /**
     * Get user voting statistics
     * @param {number} userId - User ID
     * @returns {Promise<Object>}
     */
    async getUserVotingStats(userId) {
        return this.votacionRepo.getUserVotingStats(userId);
    }

    /**
     * Get non-voters for an initiative
     * @param {number} iniciativaId - Initiative ID
     * @returns {Promise<Array>}
     */
    async getNonVoters(iniciativaId) {
        return this.votacionRepo.getNonVoters(iniciativaId);
    }

    /**
     * Remove user vote (admin only)
     * @param {number} iniciativaId - Initiative ID
     * @param {number} usuarioId - User ID whose vote to remove
     * @param {number} adminId - Admin user ID
     * @returns {Promise<Object>}
     */
    async removeVote(iniciativaId, usuarioId, adminId) {
        try {
            // Validate admin permission
            await this._validateUserPermission(adminId, ['superadmin']);

            // Validate initiative is still open
            await this._validateInitiativeActive(iniciativaId);

            // Remove vote
            const removed = await this.votacionRepo.removeVote(iniciativaId, usuarioId);
            
            if (!removed) {
                throw new Error('No se encontró el voto para eliminar');
            }

            // Get updated results
            const votingResults = await this.votacionRepo.getVotingResults(iniciativaId);

            // Update initiative vote counts
            await this._updateInitiativeVoteCounts(iniciativaId, votingResults.counts);

            // Log event
            await this._logInitiativeEvent(iniciativaId, 'voto_eliminado', 
                `Voto eliminado por administrador`, adminId);

            // Notify clients
            this._notifyVoteUpdate(iniciativaId, votingResults, null);

            return votingResults;

        } catch (error) {
            throw new Error(`Error removing vote: ${error.message}`);
        }
    }

    // Private methods

    /**
     * Validate user can vote
     * @private
     */
    async _validateUserCanVote(usuarioId) {
        const user = await this._getUser(usuarioId);
        if (!user) {
            throw new Error('Usuario no encontrado');
        }
        if (user.role !== 'diputado') {
            throw new Error('Solo los diputados pueden votar');
        }
        if (user.activo !== 1) {
            throw new Error('Usuario inactivo');
        }
    }

    /**
     * Validate initiative is active for voting
     * @private
     */
    async _validateInitiativeActive(iniciativaId) {
        const initiative = await this._getInitiative(iniciativaId);
        if (!initiative) {
            throw new Error('Iniciativa no encontrada');
        }
        if (initiative.activa !== 1) {
            throw new Error('La iniciativa no está activa para votación');
        }
        if (initiative.cerrada === 1) {
            throw new Error('La iniciativa ya está cerrada');
        }
    }

    /**
     * Validate user has required permission
     * @private
     */
    async _validateUserPermission(userId, allowedRoles) {
        const user = await this._getUser(userId);
        if (!user) {
            throw new Error('Usuario no encontrado');
        }
        if (!allowedRoles.includes(user.role)) {
            throw new Error('Permisos insuficientes');
        }
    }

    /**
     * Get user from database
     * @private
     */
    async _getUser(userId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM usuarios WHERE id = ?', [userId], (err, user) => {
                if (err) reject(err);
                else resolve(user);
            });
        });
    }

    /**
     * Get initiative from database
     * @private
     */
    async _getInitiative(iniciativaId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM iniciativas WHERE id = ?', [iniciativaId], (err, initiative) => {
                if (err) reject(err);
                else resolve(initiative);
            });
        });
    }

    /**
     * Update initiative data
     * @private
     */
    async _updateInitiative(iniciativaId, data) {
        const fields = Object.keys(data);
        const values = Object.values(data);
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        
        return new Promise((resolve, reject) => {
            const sql = `UPDATE iniciativas SET ${setClause} WHERE id = ?`;
            this.db.run(sql, [...values, iniciativaId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Close other active initiatives in session
     * @private
     */
    async _closeOtherActiveInitiatives(sessionId, currentInitiativeId) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE iniciativas SET activa = 0 WHERE sesion_id = ? AND id != ? AND activa = 1';
            this.db.run(sql, [sessionId, currentInitiativeId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Update initiative vote counts
     * @private
     */
    async _updateInitiativeVoteCounts(iniciativaId, counts) {
        return this._updateInitiative(iniciativaId, {
            votos_favor: counts.favor,
            votos_contra: counts.contra,
            votos_abstencion: counts.abstencion
        });
    }

    /**
     * Calculate final result based on vote counts and majority type
     * @private
     */
    _calculateFinalResult(initiative, votingResults) {
        const { counts } = votingResults;
        const totalVotes = counts.total;

        if (totalVotes === 0) {
            return 'sin_votos';
        }

        // Get total eligible voters
        const totalEligible = votingResults.total_eligible;
        let requiredMajority;

        if (initiative.tipo_mayoria === 'calificada') {
            // Qualified majority: 2/3 of total eligible voters
            requiredMajority = Math.ceil(totalEligible * 0.67);
        } else {
            // Simple majority: more than half of votes cast
            requiredMajority = Math.ceil(totalVotes / 2);
        }

        if (counts.favor >= requiredMajority) {
            return 'aprobada';
        } else if (counts.contra > counts.favor) {
            return 'rechazada';
        } else {
            return 'empate';
        }
    }

    /**
     * Analyze voting results for insights
     * @private
     */
    _analyzeVotingResults(results) {
        const { counts, total_eligible, participation_rate } = results;
        
        return {
            participation_level: participation_rate >= 80 ? 'alta' : 
                               participation_rate >= 60 ? 'media' : 'baja',
            consensus_level: counts.favor / counts.total >= 0.8 ? 'alto' : 
                           counts.favor / counts.total >= 0.6 ? 'medio' : 'bajo',
            abstention_rate: (counts.abstencion / counts.total * 100).toFixed(1),
            turnout_sufficient: counts.total >= (total_eligible * 0.5)
        };
    }

    /**
     * Log initiative event
     * @private
     */
    async _logInitiativeEvent(iniciativaId, tipoEvento, descripcion, userId) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO historial_sesiones (sesion_id, tipo_evento, descripcion, usuario_id)
                SELECT i.sesion_id, ?, ?, ?
                FROM iniciativas i WHERE i.id = ?
            `;
            
            this.db.run(sql, [tipoEvento, descripcion, userId, iniciativaId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Notify vote update via WebSocket
     * @private
     */
    _notifyVoteUpdate(iniciativaId, votingResults, voteData) {
        if (this.io) {
            this.io.emit('vote-update', {
                iniciativa_id: iniciativaId,
                results: votingResults,
                vote: voteData,
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = VotacionService;