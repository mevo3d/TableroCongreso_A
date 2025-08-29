const BaseRepository = require('./BaseRepository');

/**
 * Votacion Repository - Handles voting-related database operations
 */
class VotacionRepository extends BaseRepository {
    constructor(db) {
        super(db, 'votos');
    }

    /**
     * Cast a vote for an initiative
     * @param {number} iniciativaId - Initiative ID
     * @param {number} usuarioId - User ID
     * @param {string} voto - Vote (favor, contra, abstencion)
     * @returns {Promise<Object>}
     */
    async castVote(iniciativaId, usuarioId, voto) {
        // Validate vote type
        const validVotes = ['favor', 'contra', 'abstencion'];
        if (!validVotes.includes(voto)) {
            throw new Error('Tipo de voto inválido');
        }

        // Check if initiative is still open
        const initiative = await this.query(
            'SELECT cerrada FROM iniciativas WHERE id = ?',
            [iniciativaId],
            'get'
        );

        if (!initiative) {
            throw new Error('Iniciativa no encontrada');
        }

        if (initiative.cerrada === 1) {
            throw new Error('La votación ya está cerrada');
        }

        // Insert or update vote (using REPLACE for SQLite)
        const sql = `
            INSERT OR REPLACE INTO votos (iniciativa_id, usuario_id, voto, fecha_voto)
            VALUES (?, ?, ?, ?)
        `;

        await this.query(sql, [iniciativaId, usuarioId, voto, new Date().toISOString()], 'run');

        // Return the vote with user info
        return this.getVoteWithUserInfo(iniciativaId, usuarioId);
    }

    /**
     * Get vote with user information
     * @param {number} iniciativaId - Initiative ID
     * @param {number} usuarioId - User ID
     * @returns {Promise<Object|null>}
     */
    async getVoteWithUserInfo(iniciativaId, usuarioId) {
        const sql = `
            SELECT v.*, u.nombre_completo, u.partido, u.cargo_mesa_directiva
            FROM votos v
            JOIN usuarios u ON v.usuario_id = u.id
            WHERE v.iniciativa_id = ? AND v.usuario_id = ?
        `;

        return this.query(sql, [iniciativaId, usuarioId], 'get');
    }

    /**
     * Get all votes for an initiative
     * @param {number} iniciativaId - Initiative ID
     * @returns {Promise<Array>}
     */
    async getVotesByInitiative(iniciativaId) {
        const sql = `
            SELECT v.*, u.nombre_completo, u.partido, u.cargo_mesa_directiva, u.foto_url
            FROM votos v
            JOIN usuarios u ON v.usuario_id = u.id
            WHERE v.iniciativa_id = ?
            ORDER BY v.fecha_voto DESC
        `;

        return this.query(sql, [iniciativaId]);
    }

    /**
     * Get vote counts for an initiative
     * @param {number} iniciativaId - Initiative ID
     * @returns {Promise<Object>}
     */
    async getVoteCounts(iniciativaId) {
        const sql = `
            SELECT 
                voto,
                COUNT(*) as cantidad
            FROM votos 
            WHERE iniciativa_id = ?
            GROUP BY voto
        `;

        const results = await this.query(sql, [iniciativaId]);
        
        // Initialize counts
        const counts = {
            favor: 0,
            contra: 0,
            abstencion: 0,
            total: 0
        };

        // Fill counts from results
        results.forEach(result => {
            counts[result.voto] = result.cantidad;
            counts.total += result.cantidad;
        });

        return counts;
    }

    /**
     * Get detailed voting results for an initiative
     * @param {number} iniciativaId - Initiative ID
     * @returns {Promise<Object>}
     */
    async getVotingResults(iniciativaId) {
        // Get vote counts
        const counts = await this.getVoteCounts(iniciativaId);

        // Get all votes with user details
        const votes = await this.getVotesByInitiative(iniciativaId);

        // Get total eligible voters (diputados activos)
        const totalEligible = await this.query(
            'SELECT COUNT(*) as count FROM usuarios WHERE role = ? AND activo = 1',
            ['diputado'],
            'get'
        );

        // Calculate percentages
        const total = counts.total;
        const percentages = {
            favor: total > 0 ? Math.round((counts.favor / total) * 100) : 0,
            contra: total > 0 ? Math.round((counts.contra / total) * 100) : 0,
            abstencion: total > 0 ? Math.round((counts.abstencion / total) * 100) : 0
        };

        // Determine result based on majority type
        const initiative = await this.query(
            'SELECT tipo_mayoria FROM iniciativas WHERE id = ?',
            [iniciativaId],
            'get'
        );

        let resultado = 'pendiente';
        if (initiative && total > 0) {
            const requiredMajority = initiative.tipo_mayoria === 'calificada' ? 
                Math.ceil(totalEligible.count * 0.67) : // 2/3 for qualified majority
                Math.ceil(total / 2); // Simple majority of votes cast

            if (counts.favor >= requiredMajority) {
                resultado = 'aprobada';
            } else if (counts.contra > counts.favor) {
                resultado = 'rechazada';
            }
        }

        return {
            iniciativa_id: iniciativaId,
            counts,
            percentages,
            votes,
            total_eligible: totalEligible.count,
            participation_rate: Math.round((total / totalEligible.count) * 100),
            resultado,
            tipo_mayoria: initiative?.tipo_mayoria || 'simple'
        };
    }

    /**
     * Get votes by user across all initiatives in a session
     * @param {number} userId - User ID
     * @param {number} sessionId - Session ID
     * @returns {Promise<Array>}
     */
    async getUserVotesInSession(userId, sessionId) {
        const sql = `
            SELECT v.*, i.titulo as iniciativa_titulo, i.numero as iniciativa_numero
            FROM votos v
            JOIN iniciativas i ON v.iniciativa_id = i.id
            WHERE v.usuario_id = ? AND i.sesion_id = ?
            ORDER BY i.numero
        `;

        return this.query(sql, [userId, sessionId]);
    }

    /**
     * Get voting statistics for a user
     * @param {number} userId - User ID
     * @returns {Promise<Object>}
     */
    async getUserVotingStats(userId) {
        const sql = `
            SELECT 
                voto,
                COUNT(*) as cantidad
            FROM votos 
            WHERE usuario_id = ?
            GROUP BY voto
        `;

        const results = await this.query(sql, [userId]);
        
        const stats = {
            favor: 0,
            contra: 0,
            abstencion: 0,
            total: 0
        };

        results.forEach(result => {
            stats[result.voto] = result.cantidad;
            stats.total += result.cantidad;
        });

        // Get participation rate
        const totalInitiatives = await this.query(
            `SELECT COUNT(DISTINCT i.id) as count 
             FROM iniciativas i 
             JOIN sesiones s ON i.sesion_id = s.id 
             WHERE s.estado = 'cerrada'`,
            [],
            'get'
        );

        stats.participation_rate = totalInitiatives.count > 0 ? 
            Math.round((stats.total / totalInitiatives.count) * 100) : 0;

        return stats;
    }

    /**
     * Remove vote for an initiative
     * @param {number} iniciativaId - Initiative ID
     * @param {number} usuarioId - User ID
     * @returns {Promise<boolean>}
     */
    async removeVote(iniciativaId, usuarioId) {
        const sql = 'DELETE FROM votos WHERE iniciativa_id = ? AND usuario_id = ?';
        const result = await this.query(sql, [iniciativaId, usuarioId], 'run');
        return result.changes > 0;
    }

    /**
     * Get users who haven't voted on an initiative
     * @param {number} iniciativaId - Initiative ID
     * @returns {Promise<Array>}
     */
    async getNonVoters(iniciativaId) {
        const sql = `
            SELECT u.id, u.nombre_completo, u.partido, u.foto_url
            FROM usuarios u
            WHERE u.role = 'diputado' 
            AND u.activo = 1
            AND u.id NOT IN (
                SELECT v.usuario_id 
                FROM votos v 
                WHERE v.iniciativa_id = ?
            )
            ORDER BY u.nombre_completo
        `;

        return this.query(sql, [iniciativaId]);
    }
}

module.exports = VotacionRepository;