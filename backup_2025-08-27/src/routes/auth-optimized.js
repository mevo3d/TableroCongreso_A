const express = require('express');
const { validationRules, handleValidationErrors } = require('../middleware/validation');
const { asyncHandler, sendSuccess, AuthenticationError } = require('../middleware/errorHandler');
const UsuarioRepository = require('../repositories/UsuarioRepository');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../auth/middleware');

const router = express.Router();

/**
 * Optimized Authentication Routes
 * - Input validation
 * - Proper error handling
 * - Security improvements
 * - Clean code structure
 */

// Login endpoint with comprehensive validation and error handling
router.post('/login', 
    validationRules.userLogin,
    handleValidationErrors,
    asyncHandler(async (req, res) => {
        const { username, password } = req.body;
        
        // Initialize user repository
        const userRepo = new UsuarioRepository(req.db);
        
        // Authenticate user
        const user = await userRepo.authenticate(username, password);
        
        if (!user) {
            throw new AuthenticationError('Credenciales inválidas');
        }

        // Generate JWT token with user information
        const tokenPayload = {
            id: user.id,
            username: user.username,
            role: user.role,
            nombre: user.nombre_completo,
            cargo_mesa_directiva: user.cargo_mesa_directiva
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, {
            expiresIn: '24h',
            issuer: 'sistema-votacion',
            audience: 'voting-system'
        });

        // Prepare user data for response (excluding sensitive information)
        const userData = {
            id: user.id,
            username: user.username,
            role: user.role,
            nombre: user.nombre_completo,
            cargo_mesa_directiva: user.cargo_mesa_directiva,
            partido: user.partido,
            comision: user.comision,
            cargo_coordinador: user.cargo_coordinador,
            foto_url: user.foto_url
        };

        // Log successful login (optional)
        console.log(`✅ Login successful: ${user.username} (${user.role}) at ${new Date().toISOString()}`);

        return sendSuccess(res, {
            token,
            user: userData,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        }, 'Login exitoso');
    })
);

// Token refresh endpoint
router.post('/refresh',
    asyncHandler(async (req, res) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            throw new AuthenticationError('Token no proporcionado');
        }

        try {
            // Verify existing token (allow expired for refresh)
            const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
            
            // Check if token is too old to refresh (> 7 days)
            const tokenAge = Date.now() - decoded.iat * 1000;
            if (tokenAge > 7 * 24 * 60 * 60 * 1000) {
                throw new AuthenticationError('Token demasiado antiguo para renovar');
            }

            // Get fresh user data
            const userRepo = new UsuarioRepository(req.db);
            const user = await userRepo.findById(decoded.id);
            
            if (!user || user.activo !== 1) {
                throw new AuthenticationError('Usuario no válido');
            }

            // Generate new token
            const newTokenPayload = {
                id: user.id,
                username: user.username,
                role: user.role,
                nombre: user.nombre_completo,
                cargo_mesa_directiva: user.cargo_mesa_directiva
            };

            const newToken = jwt.sign(newTokenPayload, JWT_SECRET, {
                expiresIn: '24h',
                issuer: 'sistema-votacion',
                audience: 'voting-system'
            });

            return sendSuccess(res, {
                token: newToken,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            }, 'Token renovado exitosamente');

        } catch (error) {
            if (error.name === 'JsonWebTokenError') {
                throw new AuthenticationError('Token inválido');
            }
            throw error;
        }
    })
);

// Logout endpoint (optional - for logging purposes)
router.post('/logout',
    asyncHandler(async (req, res) => {
        // In a stateless JWT system, logout is handled client-side
        // This endpoint is for logging purposes and potential token blacklisting
        
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                console.log(`👋 Logout: ${decoded.username} (${decoded.role}) at ${new Date().toISOString()}`);
            } catch (error) {
                // Token might be invalid, but we don't care for logout
            }
        }

        return sendSuccess(res, null, 'Logout exitoso');
    })
);

// Password change endpoint (for authenticated users)
router.put('/change-password',
    validationRules.userLogin, // Reuse validation for new password
    handleValidationErrors,
    asyncHandler(async (req, res) => {
        const { currentPassword, newPassword } = req.body;
        
        if (!req.user) {
            throw new AuthenticationError('Usuario no autenticado');
        }

        const userRepo = new UsuarioRepository(req.db);
        
        // Verify current password
        const user = await userRepo.authenticate(req.user.username, currentPassword);
        if (!user) {
            throw new AuthenticationError('Contraseña actual incorrecta');
        }

        // Update password
        await userRepo.updatePassword(req.user.id, newPassword);

        console.log(`🔐 Password changed: ${req.user.username} at ${new Date().toISOString()}`);

        return sendSuccess(res, null, 'Contraseña actualizada exitosamente');
    })
);

// Verify token endpoint (for client-side validation)
router.get('/verify',
    asyncHandler(async (req, res) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            throw new AuthenticationError('Token no proporcionado');
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            
            // Get fresh user data to ensure user is still active
            const userRepo = new UsuarioRepository(req.db);
            const user = await userRepo.findById(decoded.id);
            
            if (!user || user.activo !== 1) {
                throw new AuthenticationError('Usuario no válido');
            }

            return sendSuccess(res, {
                valid: true,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    nombre: user.nombre_completo
                },
                expires_at: new Date(decoded.exp * 1000).toISOString()
            }, 'Token válido');

        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new AuthenticationError('Token expirado');
            }
            if (error.name === 'JsonWebTokenError') {
                throw new AuthenticationError('Token inválido');
            }
            throw error;
        }
    })
);

module.exports = router;