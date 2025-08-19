const fs = require('fs').promises;
const path = require('path');

/**
 * Error handling middleware and utilities
 */

// Custom error classes
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message, details = []) {
        super(message, 400, 'VALIDATION_ERROR');
        this.details = details;
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'No autenticado') {
        super(message, 401, 'AUTHENTICATION_ERROR');
    }
}

class AuthorizationError extends AppError {
    constructor(message = 'No autorizado') {
        super(message, 403, 'AUTHORIZATION_ERROR');
    }
}

class NotFoundError extends AppError {
    constructor(resource = 'Recurso') {
        super(`${resource} no encontrado`, 404, 'NOT_FOUND_ERROR');
    }
}

class DatabaseError extends AppError {
    constructor(message = 'Error de base de datos') {
        super(message, 500, 'DATABASE_ERROR');
    }
}

class FileError extends AppError {
    constructor(message = 'Error de archivo') {
        super(message, 400, 'FILE_ERROR');
    }
}

// Async error handler wrapper
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// Error logger
const logError = async (error, req = null) => {
    const timestamp = new Date().toISOString();
    const logData = {
        timestamp,
        error: {
            message: error.message,
            stack: error.stack,
            code: error.code,
            statusCode: error.statusCode
        },
        request: req ? {
            method: req.method,
            url: req.url,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            user: req.user ? { id: req.user.id, role: req.user.role } : null
        } : null
    };

    try {
        const logsDir = path.join(__dirname, '../../logs');
        await fs.mkdir(logsDir, { recursive: true });
        
        const logFile = path.join(logsDir, `error-${new Date().toISOString().split('T')[0]}.log`);
        const logLine = JSON.stringify(logData) + '\n';
        
        await fs.appendFile(logFile, logLine);
    } catch (logError) {
        console.error('Failed to write error log:', logError);
    }

    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
        console.error('Error logged:', logData);
    }
};

// Main error handling middleware
const errorHandler = async (err, req, res, next) => {
    // Log the error
    await logError(err, req);

    // Set default error values
    let error = { ...err };
    error.message = err.message;

    // Handle specific error types
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        error = new ValidationError('Ya existe un registro con estos datos únicos');
    }

    if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        error = new ValidationError('Referencia a datos inexistentes');
    }

    if (err.code === 'ENOENT') {
        error = new FileError('Archivo no encontrado');
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
        error = new FileError('Archivo demasiado grande');
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        error = new AuthenticationError('Token inválido');
    }

    if (err.name === 'TokenExpiredError') {
        error = new AuthenticationError('Token expirado');
    }

    // Multer errors
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        error = new FileError('Tipo de archivo no permitido');
    }

    // Ensure we have a status code
    const statusCode = error.statusCode || 500;
    const isOperational = error.isOperational || false;

    // Prepare error response
    const errorResponse = {
        success: false,
        error: {
            code: error.code || 'INTERNAL_ERROR',
            message: error.message || 'Error interno del servidor'
        }
    };

    // Add additional details for validation errors
    if (error.details && error.details.length > 0) {
        errorResponse.error.details = error.details;
    }

    // In development, include stack trace for non-operational errors
    if (process.env.NODE_ENV !== 'production' && !isOperational) {
        errorResponse.error.stack = error.stack;
    }

    res.status(statusCode).json(errorResponse);
};

// 404 handler for undefined routes
const notFoundHandler = (req, res, next) => {
    const error = new NotFoundError(`Ruta ${req.originalUrl}`);
    next(error);
};

// Global unhandled rejection handler
process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    await logError(new Error(`Unhandled Rejection: ${reason}`));
});

// Global uncaught exception handler
process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    await logError(error);
    
    // Graceful shutdown
    process.exit(1);
});

// Database error handler wrapper
const handleDatabaseError = (operation) => {
    return async (...args) => {
        try {
            return await operation(...args);
        } catch (error) {
            // Map SQLite errors to application errors
            if (error.code && error.code.startsWith('SQLITE_')) {
                throw new DatabaseError(`Database operation failed: ${error.message}`);
            }
            throw error;
        }
    };
};

// Validation error creator
const createValidationError = (message, field = null, value = null) => {
    const details = [];
    if (field) {
        details.push({ field, message, value });
    }
    return new ValidationError(message, details);
};

// Success response helper
const sendSuccess = (res, data = null, message = 'Operación exitosa', statusCode = 200) => {
    const response = {
        success: true,
        message
    };

    if (data !== null) {
        response.data = data;
    }

    return res.status(statusCode).json(response);
};

// Paginated response helper
const sendPaginatedResponse = (res, data, pagination, message = 'Datos obtenidos correctamente') => {
    return res.json({
        success: true,
        message,
        data,
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total: pagination.total,
            totalPages: pagination.totalPages,
            hasNext: pagination.page < pagination.totalPages,
            hasPrev: pagination.page > 1
        }
    });
};

module.exports = {
    // Error classes
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    DatabaseError,
    FileError,
    
    // Middleware and handlers
    asyncHandler,
    errorHandler,
    notFoundHandler,
    handleDatabaseError,
    
    // Utilities
    logError,
    createValidationError,
    sendSuccess,
    sendPaginatedResponse
};