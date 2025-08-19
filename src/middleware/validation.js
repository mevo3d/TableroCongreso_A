const { body, param, query, validationResult } = require('express-validator');

/**
 * Validation middleware using express-validator
 */

// Error handler for validation results
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Datos de entrada inválidos',
            details: errors.array().map(err => ({
                field: err.param,
                message: err.msg,
                value: err.value
            }))
        });
    }
    next();
};

// Common validation rules
const validationRules = {
    // User validations
    userLogin: [
        body('username')
            .notEmpty()
            .withMessage('El nombre de usuario es requerido')
            .isLength({ min: 3, max: 50 })
            .withMessage('El nombre de usuario debe tener entre 3 y 50 caracteres')
            .matches(/^[a-zA-Z0-9._-]+$/)
            .withMessage('El nombre de usuario solo puede contener letras, números, puntos, guiones y guiones bajos'),
        
        body('password')
            .notEmpty()
            .withMessage('La contraseña es requerida')
            .isLength({ min: 6 })
            .withMessage('La contraseña debe tener al menos 6 caracteres')
    ],

    userCreate: [
        body('username')
            .notEmpty()
            .withMessage('El nombre de usuario es requerido')
            .isLength({ min: 3, max: 50 })
            .withMessage('El nombre de usuario debe tener entre 3 y 50 caracteres')
            .matches(/^[a-zA-Z0-9._-]+$/)
            .withMessage('El nombre de usuario solo puede contener letras, números, puntos, guiones y guiones bajos'),
        
        body('password')
            .isLength({ min: 6, max: 100 })
            .withMessage('La contraseña debe tener entre 6 y 100 caracteres'),
        
        body('role')
            .isIn(['superadmin', 'operador', 'secretario', 'diputado', 'servicios_legislativos'])
            .withMessage('Rol inválido'),
        
        body('nombre_completo')
            .notEmpty()
            .withMessage('El nombre completo es requerido')
            .isLength({ min: 2, max: 200 })
            .withMessage('El nombre completo debe tener entre 2 y 200 caracteres')
            .matches(/^[a-zA-ZÀ-ÿ\s\.]+$/)
            .withMessage('El nombre completo solo puede contener letras, espacios y puntos'),
        
        body('partido')
            .optional()
            .isLength({ max: 100 })
            .withMessage('El partido no puede exceder 100 caracteres'),
        
        body('comision')
            .optional()
            .isLength({ max: 200 })
            .withMessage('La comisión no puede exceder 200 caracteres')
    ],

    userUpdate: [
        param('id')
            .isInt({ min: 1 })
            .withMessage('ID de usuario inválido'),
        
        body('nombre_completo')
            .optional()
            .isLength({ min: 2, max: 200 })
            .withMessage('El nombre completo debe tener entre 2 y 200 caracteres'),
        
        body('partido')
            .optional()
            .isLength({ max: 100 })
            .withMessage('El partido no puede exceder 100 caracteres'),
        
        body('activo')
            .optional()
            .isIn([0, 1, true, false])
            .withMessage('Estado activo inválido')
    ],

    // Session validations
    sessionCreate: [
        body('nombreSesion')
            .notEmpty()
            .withMessage('El nombre de la sesión es requerido')
            .isLength({ min: 3, max: 200 })
            .withMessage('El nombre de la sesión debe tener entre 3 y 200 caracteres'),
        
        body('tipoSesion')
            .optional()
            .isIn(['ordinaria', 'extraordinaria', 'solemne'])
            .withMessage('Tipo de sesión inválido'),
        
        body('fechaProgramada')
            .optional()
            .isISO8601()
            .withMessage('Fecha programada inválida'),
        
        body('ejecutarInmediato')
            .optional()
            .isBoolean()
            .withMessage('Ejecutar inmediato debe ser verdadero o falso')
    ],

    sessionId: [
        param('id')
            .isInt({ min: 1 })
            .withMessage('ID de sesión inválido')
    ],

    // Initiative validations
    initiativeCreate: [
        body('titulo')
            .notEmpty()
            .withMessage('El título es requerido')
            .isLength({ min: 5, max: 500 })
            .withMessage('El título debe tener entre 5 y 500 caracteres'),
        
        body('descripcion')
            .optional()
            .isLength({ max: 2000 })
            .withMessage('La descripción no puede exceder 2000 caracteres'),
        
        body('tipo_mayoria')
            .optional()
            .isIn(['simple', 'calificada'])
            .withMessage('Tipo de mayoría inválido'),
        
        body('presentador')
            .optional()
            .isLength({ max: 200 })
            .withMessage('El presentador no puede exceder 200 caracteres')
    ],

    initiativeId: [
        param('id')
            .isInt({ min: 1 })
            .withMessage('ID de iniciativa inválido')
    ],

    // Vote validations
    vote: [
        body('voto')
            .isIn(['favor', 'contra', 'abstencion'])
            .withMessage('Tipo de voto inválido'),
        
        param('iniciativaId')
            .isInt({ min: 1 })
            .withMessage('ID de iniciativa inválido')
    ],

    // File upload validations
    fileUpload: [
        body('tipoCarga')
            .optional()
            .isIn(['inmediato', 'programado', 'indefinido'])
            .withMessage('Tipo de carga inválido'),
        
        body('fechaProgramada')
            .optional()
            .isISO8601()
            .withMessage('Fecha programada inválida')
    ],

    // Pagination validations
    pagination: [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Número de página inválido'),
        
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Límite inválido (1-100)'),
        
        query('orderBy')
            .optional()
            .isIn(['fecha', 'nombre', 'estado', 'id'])
            .withMessage('Campo de ordenamiento inválido'),
        
        query('order')
            .optional()
            .isIn(['asc', 'desc'])
            .withMessage('Orden inválido')
    ],

    // Search validations
    search: [
        query('q')
            .notEmpty()
            .withMessage('Término de búsqueda requerido')
            .isLength({ min: 2, max: 100 })
            .withMessage('El término de búsqueda debe tener entre 2 y 100 caracteres')
    ],

    // Configuration validations
    systemConfig: [
        body('nombre_congreso')
            .optional()
            .isLength({ min: 2, max: 200 })
            .withMessage('El nombre del congreso debe tener entre 2 y 200 caracteres')
    ],

    // ID parameter validation
    validateId: [
        param('id')
            .isInt({ min: 1 })
            .withMessage('ID inválido')
    ]
};

// Custom sanitization middleware
const sanitizeInput = (req, res, next) => {
    // Sanitize string fields to prevent XSS
    const sanitizeString = (str) => {
        if (typeof str !== 'string') return str;
        return str
            .trim()
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+="[^"]*"/gi, '') // Remove event handlers
            .replace(/on\w+='[^']*'/gi, ''); // Remove event handlers with single quotes
    };

    // Recursively sanitize object
    const sanitizeObject = (obj) => {
        if (obj === null || typeof obj !== 'object') {
            return typeof obj === 'string' ? sanitizeString(obj) : obj;
        }
        
        if (Array.isArray(obj)) {
            return obj.map(sanitizeObject);
        }
        
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeObject(value);
        }
        return sanitized;
    };

    // Sanitize request body
    if (req.body) {
        req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query) {
        req.query = sanitizeObject(req.query);
    }

    next();
};

// Rate limiting validation
const validateRateLimit = (windowMs = 15 * 60 * 1000, max = 100) => {
    const requests = new Map();
    
    return (req, res, next) => {
        const clientId = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        const windowStart = now - windowMs;
        
        // Clean old entries
        for (const [ip, times] of requests.entries()) {
            requests.set(ip, times.filter(time => time > windowStart));
            if (requests.get(ip).length === 0) {
                requests.delete(ip);
            }
        }
        
        // Check current client
        const clientRequests = requests.get(clientId) || [];
        
        if (clientRequests.length >= max) {
            return res.status(429).json({
                error: 'Demasiadas solicitudes',
                message: `Límite de ${max} solicitudes por ${windowMs / 60000} minutos excedido`
            });
        }
        
        // Add current request
        clientRequests.push(now);
        requests.set(clientId, clientRequests);
        
        next();
    };
};

module.exports = {
    validationRules,
    handleValidationErrors,
    sanitizeInput,
    validateRateLimit
};