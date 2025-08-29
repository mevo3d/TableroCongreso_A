const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'sistema_votacion_secret_2024';

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

// Middleware para verificar roles
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado' });
        }
        
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        
        next();
    };
};

module.exports = { authenticateToken, authorize, JWT_SECRET };