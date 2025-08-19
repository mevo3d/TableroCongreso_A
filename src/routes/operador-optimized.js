const express = require('express');
const multer = require('multer');
const { authenticateToken, authorize } = require('../auth/middleware');
const { validationRules, handleValidationErrors } = require('../middleware/validation');
const { asyncHandler, sendSuccess, sendPaginatedResponse, FileError } = require('../middleware/errorHandler');
const { cacheStrategies, invalidateCache } = require('../middleware/cache');

// Services
const SesionService = require('../services/SesionService');
const VotacionService = require('../services/VotacionService');

// PDF extraction (keep existing logic)
const pdfExtractor = require('../pdf/extractor');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { 
        fileSize: 50 * 1024 * 1024, // 50MB
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new FileError('Tipo de archivo no permitido. Solo PDF y Word.'));
        }
    }
});

// Authentication and authorization middleware
router.use(authenticateToken);
router.use(authorize('operador', 'superadmin'));

/**
 * OPTIMIZED OPERADOR ROUTES
 * Refactored from 1,095 lines to modular, clean structure
 */

// =================== SESSION MANAGEMENT ===================

/**
 * Upload PDF/Word and create session
 * POST /api/operador/upload-pdf
 */
router.post('/upload-pdf', 
    upload.single('pdf'),
    validationRules.fileUpload,
    handleValidationErrors,
    asyncHandler(async (req, res) => {
        if (!req.file) {
            throw new FileError('No se proporcionó archivo');
        }

        const { tipoCarga, fechaProgramada, nombreSesion, tipoSesion, notas } = req.body;
        
        // Determine file type
        const filename = req.file.originalname.toLowerCase();
        const fileType = filename.endsWith('.docx') || filename.endsWith('.doc') ? 'docx' : 'pdf';
        
        // Extract initiatives from file
        const iniciativas = await pdfExtractor.extraerIniciativas(req.file.buffer, fileType);
        
        if (iniciativas.length === 0) {
            throw new FileError('No se encontraron iniciativas en el archivo');
        }

        // Prepare session data
        const sessionData = {
            nombreSesion: nombreSesion || `Sesión ${new Date().toISOString().split('T')[0]}`,
            tipoSesion: tipoSesion || 'ordinaria',
            tipoCarga,
            fechaProgramada,
            ejecutarInmediato: tipoCarga === 'inmediato',
            notas
        };

        // Create session using service
        const sesionService = new SesionService(req.db, req.io);
        const result = await sesionService.createSessionFromDocument(
            sessionData, 
            iniciativas, 
            req.user.id
        );

        return sendSuccess(res, result, 
            `Sesión creada exitosamente con ${iniciativas.length} iniciativas`, 201);
    })
);

/**
 * Get all sessions with pagination and filters
 * GET /api/operador/sesiones
 */
router.get('/sesiones',
    validationRules.pagination,
    handleValidationErrors,
    cacheStrategies.userSpecific,
    asyncHandler(async (req, res) => {
        const { page = 1, limit = 10, estado, fecha_desde, fecha_hasta } = req.query;
        
        const filters = {};
        if (estado) filters.estado = estado;
        if (fecha_desde) filters.fecha_desde = fecha_desde;
        if (fecha_hasta) filters.fecha_hasta = fecha_hasta;

        const sesionService = new SesionService(req.db, req.io);
        const result = await sesionService.getPaginatedSessions(
            filters, 
            parseInt(page), 
            parseInt(limit)
        );

        return sendPaginatedResponse(res, result.data, result.pagination);
    })
);

/**
 * Get session details with initiatives and history
 * GET /api/operador/sesiones/:id
 */
router.get('/sesiones/:id',
    validationRules.sessionId,
    handleValidationErrors,
    cacheStrategies.sessionData,
    asyncHandler(async (req, res) => {
        const sesionService = new SesionService(req.db, req.io);
        const sessionDetails = await sesionService.getSessionDetails(req.params.id);

        return sendSuccess(res, sessionDetails);
    })
);

/**
 * Activate session
 * PUT /api/operador/sesiones/:id/activate
 */
router.put('/sesiones/:id/activate',
    validationRules.sessionId,
    handleValidationErrors,
    invalidateCache(['sesiones*', 'pantalla*']),
    asyncHandler(async (req, res) => {
        const sesionService = new SesionService(req.db, req.io);
        const activatedSession = await sesionService.activateSession(
            req.params.id, 
            req.user.id
        );

        return sendSuccess(res, activatedSession, 'Sesión activada exitosamente');
    })
);

/**
 * Close session
 * PUT /api/operador/sesiones/:id/close
 */
router.put('/sesiones/:id/close',
    validationRules.sessionId,
    handleValidationErrors,
    invalidateCache(['sesiones*', 'pantalla*']),
    asyncHandler(async (req, res) => {
        const sesionService = new SesionService(req.db, req.io);
        const closedSession = await sesionService.closeSession(
            req.params.id, 
            req.user.id
        );

        return sendSuccess(res, closedSession, 'Sesión cerrada exitosamente');
    })
);

// =================== INITIATIVE MANAGEMENT ===================

/**
 * Open initiative for voting
 * PUT /api/operador/iniciativas/:id/open
 */
router.put('/iniciativas/:id/open',
    validationRules.initiativeId,
    handleValidationErrors,
    invalidateCache(['iniciativas*', 'pantalla*', 'votos*']),
    asyncHandler(async (req, res) => {
        const votacionService = new VotacionService(req.db, req.io);
        const openedInitiative = await votacionService.openInitiative(
            req.params.id, 
            req.user.id
        );

        return sendSuccess(res, openedInitiative, 'Iniciativa abierta para votación');
    })
);

/**
 * Close initiative and calculate results
 * PUT /api/operador/iniciativas/:id/close
 */
router.put('/iniciativas/:id/close',
    validationRules.initiativeId,
    handleValidationErrors,
    invalidateCache(['iniciativas*', 'pantalla*', 'votos*']),
    asyncHandler(async (req, res) => {
        const votacionService = new VotacionService(req.db, req.io);
        const closedInitiative = await votacionService.closeInitiative(
            req.params.id, 
            req.user.id
        );

        return sendSuccess(res, closedInitiative, 'Iniciativa cerrada y resultado calculado');
    })
);

/**
 * Get initiative voting results
 * GET /api/operador/iniciativas/:id/resultados
 */
router.get('/iniciativas/:id/resultados',
    validationRules.initiativeId,
    handleValidationErrors,
    cacheStrategies.statistics,
    asyncHandler(async (req, res) => {
        const votacionService = new VotacionService(req.db, req.io);
        const results = await votacionService.getVotingResults(req.params.id);

        return sendSuccess(res, results);
    })
);

/**
 * Get non-voters for an initiative
 * GET /api/operador/iniciativas/:id/no-votaron
 */
router.get('/iniciativas/:id/no-votaron',
    validationRules.initiativeId,
    handleValidationErrors,
    asyncHandler(async (req, res) => {
        const votacionService = new VotacionService(req.db, req.io);
        const nonVoters = await votacionService.getNonVoters(req.params.id);

        return sendSuccess(res, nonVoters);
    })
);

// =================== USER MANAGEMENT ===================

/**
 * Get all diputados with status
 * GET /api/operador/diputados
 */
router.get('/diputados',
    cacheStrategies.userSpecific,
    asyncHandler(async (req, res) => {
        const UsuarioRepository = require('../repositories/UsuarioRepository');
        const userRepo = new UsuarioRepository(req.db);
        const diputados = await userRepo.getDiputados();

        return sendSuccess(res, diputados);
    })
);

/**
 * Get mesa directiva members
 * GET /api/operador/mesa-directiva
 */
router.get('/mesa-directiva',
    cacheStrategies.static,
    asyncHandler(async (req, res) => {
        const UsuarioRepository = require('../repositories/UsuarioRepository');
        const userRepo = new UsuarioRepository(req.db);
        const mesaDirectiva = await userRepo.getMesaDirectiva();

        return sendSuccess(res, mesaDirectiva);
    })
);

/**
 * Toggle user active status
 * PUT /api/operador/usuarios/:id/toggle-active
 */
router.put('/usuarios/:id/toggle-active',
    validationRules.validateId,
    handleValidationErrors,
    invalidateCache(['usuarios*', 'diputados*']),
    asyncHandler(async (req, res) => {
        const UsuarioRepository = require('../repositories/UsuarioRepository');
        const userRepo = new UsuarioRepository(req.db);
        const updatedUser = await userRepo.toggleActive(req.params.id);

        return sendSuccess(res, updatedUser, 'Estado del usuario actualizado');
    })
);

// =================== SYSTEM STATUS ===================

/**
 * Get system status and statistics
 * GET /api/operador/estado-sistema
 */
router.get('/estado-sistema',
    cacheStrategies.statistics,
    asyncHandler(async (req, res) => {
        const sesionService = new SesionService(req.db, req.io);
        const UsuarioRepository = require('../repositories/UsuarioRepository');
        const userRepo = new UsuarioRepository(req.db);

        const [activeSession, recentSessions, userStats] = await Promise.all([
            sesionService.getActiveSession(),
            sesionService.getRecentSessions(3),
            userRepo.getUserStats()
        ]);

        const systemStatus = {
            active_session: activeSession,
            recent_sessions: recentSessions,
            user_stats: userStats,
            system_time: new Date().toISOString(),
            version: process.env.npm_package_version || '1.0.0'
        };

        return sendSuccess(res, systemStatus);
    })
);

/**
 * Get active session with initiatives
 * GET /api/operador/sesion-activa
 */
router.get('/sesion-activa',
    cacheStrategies.sessionData,
    asyncHandler(async (req, res) => {
        const sesionService = new SesionService(req.db, req.io);
        const activeSession = await sesionService.getActiveSession();

        if (!activeSession) {
            return sendSuccess(res, null, 'No hay sesión activa');
        }

        const sessionDetails = await sesionService.getSessionDetails(activeSession.id);
        return sendSuccess(res, sessionDetails);
    })
);

// =================== CONFIGURATION ===================

/**
 * Update system configuration (logo, name, etc.)
 * PUT /api/operador/configuracion
 */
router.put('/configuracion',
    validationRules.systemConfig,
    handleValidationErrors,
    invalidateCache(['configuracion*']),
    asyncHandler(async (req, res) => {
        const { nombre_congreso, logo_congreso, logo_secundario } = req.body;
        
        // Use raw database query for configuration update
        const updateData = {};
        if (nombre_congreso) updateData.nombre_congreso = nombre_congreso;
        if (logo_congreso) updateData.logo_congreso = logo_congreso;
        if (logo_secundario) updateData.logo_secundario = logo_secundario;

        if (Object.keys(updateData).length === 0) {
            throw new ValidationError('No hay datos para actualizar');
        }

        const fields = Object.keys(updateData);
        const values = Object.values(updateData);
        const setClause = fields.map(field => `${field} = ?`).join(', ');

        await new Promise((resolve, reject) => {
            req.db.run(
                `UPDATE configuracion_sistema SET ${setClause} WHERE id = 1`,
                values,
                function(err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        return sendSuccess(res, updateData, 'Configuración actualizada exitosamente');
    })
);

module.exports = router;