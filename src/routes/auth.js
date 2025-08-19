const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../auth/middleware');

const router = express.Router();

// Login
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const db = req.db;
    
    db.get(
        'SELECT * FROM usuarios WHERE LOWER(username) = LOWER(?) AND activo = 1',
        [username],
        async (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Error de base de datos' });
            }

            if (!user) {
                return res.status(401).json({ error: 'Credenciales inválidas' });
            }

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ error: 'Credenciales inválidas' });
            }

            // Crear token JWT
            const token = jwt.sign(
                { 
                    id: user.id, 
                    username: user.username, 
                    role: user.role,
                    nombre: user.nombre_completo,
                    cargo_mesa_directiva: user.cargo_mesa_directiva
                },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    nombre: user.nombre_completo,
                    cargo_mesa_directiva: user.cargo_mesa_directiva,
                    partido: user.partido,
                    comision: user.comision
                }
            });
        }
    );
});

// Auto-login con token temporal para pruebas
router.get('/auto-login/:username', (req, res) => {
    const { username } = req.params;
    const db = req.db;
    
    // Solo permitir en desarrollo
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Auto-login no permitido en producción' });
    }
    
    db.get(
        'SELECT * FROM usuarios WHERE LOWER(username) = LOWER(?) AND activo = 1',
        [username],
        (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Error de base de datos' });
            }

            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            // Crear token JWT temporal
            const token = jwt.sign(
                { 
                    id: user.id, 
                    username: user.username, 
                    role: user.role,
                    nombre: user.nombre_completo,
                    cargo_mesa_directiva: user.cargo_mesa_directiva
                },
                JWT_SECRET,
                { expiresIn: '4h' } // Token temporal de 4 horas
            );

            // Redirigir al dashboard correspondiente con el token
            const dashboardUrl = user.role === 'diputado' ? '/diputado' : 
                                user.role === 'operador' ? '/operador' :
                                user.role === 'secretario' ? '/secretario' : '/';
            
            res.redirect(`${dashboardUrl}?token=${token}&autoLogin=true`);
        }
    );
});

module.exports = router;