const BaseRepository = require('./BaseRepository');
const bcrypt = require('bcryptjs');

/**
 * Usuario Repository - Handles user-related database operations
 */
class UsuarioRepository extends BaseRepository {
    constructor(db) {
        super(db, 'usuarios');
    }

    /**
     * Find user by username (case insensitive)
     * @param {string} username - Username
     * @returns {Promise<Object|null>}
     */
    async findByUsername(username) {
        const sql = 'SELECT * FROM usuarios WHERE LOWER(username) = LOWER(?) AND activo = 1';
        return this.query(sql, [username], 'get');
    }

    /**
     * Authenticate user with credentials
     * @param {string} username - Username
     * @param {string} password - Plain text password
     * @returns {Promise<Object|null>}
     */
    async authenticate(username, password) {
        const user = await this.findByUsername(username);
        if (!user) {
            return null;
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return null;
        }

        // Remove password from returned object
        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    /**
     * Create user with encrypted password
     * @param {Object} userData - User data
     * @returns {Promise<Object>}
     */
    async createUser(userData) {
        // Validate required fields
        const requiredFields = ['username', 'password', 'role', 'nombre_completo'];
        for (const field of requiredFields) {
            if (!userData[field]) {
                throw new Error(`Campo requerido: ${field}`);
            }
        }

        // Check for duplicate username
        const existing = await this.findByUsername(userData.username);
        if (existing) {
            throw new Error('Ya existe un usuario con este nombre de usuario');
        }

        // Encrypt password
        const hashedPassword = await bcrypt.hash(userData.password, 10);

        const userDataWithEncryptedPassword = {
            ...userData,
            password: hashedPassword,
            activo: userData.activo !== undefined ? userData.activo : 1,
            created_at: new Date().toISOString()
        };

        const newUser = await this.create(userDataWithEncryptedPassword);
        
        // Remove password from returned object
        const { password: _, ...userWithoutPassword } = newUser;
        return userWithoutPassword;
    }

    /**
     * Update user password
     * @param {number} userId - User ID
     * @param {string} newPassword - New plain text password
     * @returns {Promise<boolean>}
     */
    async updatePassword(userId, newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const result = await this.update(userId, { password: hashedPassword });
        return !!result;
    }

    /**
     * Get users by role
     * @param {string} role - User role
     * @param {boolean} activeOnly - Include only active users
     * @returns {Promise<Array>}
     */
    async getByRole(role, activeOnly = true) {
        const conditions = { role };
        if (activeOnly) {
            conditions.activo = 1;
        }

        const users = await this.findAll(conditions, ['nombre_completo']);
        
        // Remove passwords from results
        return users.map(user => {
            const { password: _, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });
    }

    /**
     * Get diputados with complete information
     * @returns {Promise<Array>}
     */
    async getDiputados() {
        const sql = `
            SELECT id, username, nombre_completo, partido, comision, 
                   cargo_legislativo, cargo_mesa_directiva, cargo_coordinador,
                   foto_url, activo
            FROM usuarios 
            WHERE role = 'diputado' AND activo = 1
            ORDER BY nombre_completo
        `;

        return this.query(sql, []);
    }

    /**
     * Get mesa directiva members
     * @returns {Promise<Array>}
     */
    async getMesaDirectiva() {
        const sql = `
            SELECT id, username, nombre_completo, partido, cargo_mesa_directiva, foto_url
            FROM usuarios 
            WHERE role = 'diputado' 
            AND cargo_mesa_directiva IS NOT NULL 
            AND cargo_mesa_directiva != '' 
            AND activo = 1
            ORDER BY 
                CASE cargo_mesa_directiva
                    WHEN 'presidente' THEN 1
                    WHEN 'vicepresidente' THEN 2
                    WHEN 'secretario1' THEN 3
                    WHEN 'secretario2' THEN 4
                    ELSE 5
                END
        `;

        return this.query(sql, []);
    }

    /**
     * Get coordinadores by party
     * @returns {Promise<Array>}
     */
    async getCoordinadores() {
        const sql = `
            SELECT id, username, nombre_completo, partido, cargo_coordinador, foto_url
            FROM usuarios 
            WHERE role = 'diputado' 
            AND cargo_coordinador IS NOT NULL 
            AND cargo_coordinador != '' 
            AND activo = 1
            ORDER BY partido, nombre_completo
        `;

        return this.query(sql, []);
    }

    /**
     * Toggle user active status
     * @param {number} userId - User ID
     * @returns {Promise<Object>}
     */
    async toggleActive(userId) {
        const user = await this.findById(userId);
        if (!user) {
            throw new Error('Usuario no encontrado');
        }

        const newStatus = user.activo === 1 ? 0 : 1;
        return this.update(userId, { activo: newStatus });
    }

    /**
     * Search users by name or username
     * @param {string} searchTerm - Search term
     * @param {string} role - Optional role filter
     * @returns {Promise<Array>}
     */
    async search(searchTerm, role = null) {
        let sql = `
            SELECT id, username, nombre_completo, role, partido, activo
            FROM usuarios 
            WHERE (LOWER(nombre_completo) LIKE LOWER(?) OR LOWER(username) LIKE LOWER(?))
        `;
        
        const params = [`%${searchTerm}%`, `%${searchTerm}%`];

        if (role) {
            sql += ' AND role = ?';
            params.push(role);
        }

        sql += ' ORDER BY nombre_completo LIMIT 20';

        return this.query(sql, params);
    }

    /**
     * Get user statistics by role
     * @returns {Promise<Array>}
     */
    async getUserStats() {
        const sql = `
            SELECT 
                role,
                COUNT(*) as total,
                SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END) as activos,
                SUM(CASE WHEN activo = 0 THEN 1 ELSE 0 END) as inactivos
            FROM usuarios
            GROUP BY role
            ORDER BY total DESC
        `;

        return this.query(sql, []);
    }

    /**
     * Update user profile
     * @param {number} userId - User ID
     * @param {Object} profileData - Profile data (excluding sensitive fields)
     * @returns {Promise<Object>}
     */
    async updateProfile(userId, profileData) {
        // Remove sensitive fields that shouldn't be updated this way
        const { password, username, role, ...safeData } = profileData;

        const updatedUser = await this.update(userId, safeData);
        
        // Remove password from returned object
        const { password: _, ...userWithoutPassword } = updatedUser;
        return userWithoutPassword;
    }
}

module.exports = UsuarioRepository;