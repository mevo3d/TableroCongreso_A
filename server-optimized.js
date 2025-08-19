require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const { spawn } = require('child_process');

// Optimized imports
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');
const { sanitizeInput, validateRateLimit } = require('./src/middleware/validation');
const { performanceMiddleware, setupDatabaseTracking } = require('./src/utils/performanceMonitor');
const { cacheWarming, cacheStats, clearCache } = require('./src/middleware/cache');

const app = express();
const server = http.createServer(app);

// Enhanced CORS configuration
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS ? 
        process.env.ALLOWED_ORIGINS.split(',') : 
        ['http://localhost:3333', 'http://127.0.0.1:3333'],
    credentials: true,
    optionsSuccessStatus: 200
};

const io = socketIo(server, {
    cors: corsOptions,
    transports: ['websocket', 'polling']
});

// Security and performance middleware
app.set('trust proxy', 1); // Trust first proxy
app.disable('x-powered-by'); // Hide Express signature

// Rate limiting
app.use('/api/', validateRateLimit(15 * 60 * 1000, 1000)); // 1000 requests per 15 minutes for API
app.use('/auth/', validateRateLimit(15 * 60 * 1000, 100)); // 100 requests per 15 minutes for auth

// Core middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInput); // XSS protection
app.use(performanceMiddleware); // Performance monitoring

// Static file serving with caching
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0',
    etag: true,
    lastModified: true
}));

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : '0'
}));

// PWA files with proper headers
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
    res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

app.get('/service-worker.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache'); // Always fresh
    res.sendFile(path.join(__dirname, 'public', 'service-worker.js'));
});

// Enhanced database middleware with monitoring
app.use((req, res, next) => {
    const db = require('./src/db/database');
    req.db = setupDatabaseTracking(db); // Add performance tracking
    req.io = io;
    next();
});

// Optimized route imports
const authRoutes = require('./src/routes/auth-optimized');
const operadorRoutes = require('./src/routes/operador-optimized');
// Note: Other routes would need similar optimization

// Route mounting with versioning
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/operador', operadorRoutes);

// Legacy route support (gradually migrate to v1)
app.use('/api/auth', authRoutes);
app.use('/api/operador', operadorRoutes);

// Keep existing routes for backward compatibility
app.use('/api/secretario', require('./src/routes/secretario'));
app.use('/api/diputado', require('./src/routes/diputado'));
app.use('/api/pantalla', require('./src/routes/pantalla'));
app.use('/api/superadmin', require('./src/routes/superadmin'));
app.use('/api/pase-lista', require('./src/routes/pase-lista'));
app.use('/api/servicios-legislativos', require('./src/routes/servicios-legislativos'));

// System monitoring endpoints
app.get('/api/system/cache-stats', cacheStats);
app.post('/api/system/clear-cache', clearCache);
app.get('/api/system/performance', (req, res) => {
    const { globalMonitor } = require('./src/utils/performanceMonitor');
    res.json({
        success: true,
        data: globalMonitor.getStats()
    });
});

// Enhanced buildAbsoluteUrl function
function buildAbsoluteUrl(req, relativePath) {
    if (!relativePath) return null;
    
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
        return relativePath;
    }
    
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    const pathUrl = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    
    return `${baseUrl}${pathUrl}`;
}

// Enhanced public configuration endpoint with caching
app.get('/api/configuracion/public', (req, res) => {
    // Add cache headers
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
    
    const db = req.db;
    db.get('SELECT logo_congreso, logo_secundario, nombre_congreso FROM configuracion_sistema WHERE id = 1', 
        (err, config) => {
            if (err) {
                return res.status(500).json({ 
                    success: false,
                    error: 'Error obteniendo configuración' 
                });
            }
            
            if (config) {
                config.logo_congreso = buildAbsoluteUrl(req, config.logo_congreso);
                config.logo_secundario = buildAbsoluteUrl(req, config.logo_secundario);
            }
            
            res.json({
                success: true,
                data: config || {}
            });
        }
    );
});

// View routes with security headers
const viewRoutes = [
    { path: '/', file: 'login.html' },
    { path: '/operador', file: 'operador.html' },
    { path: '/secretario', file: 'secretario.html' },
    { path: '/servicios-legislativos', file: 'servicios-legislativos.html' },
    { path: '/diputado', file: 'diputado.html' },
    { path: '/pantalla', file: 'pantalla.html' },
    { path: '/superadmin', file: 'superadmin.html' },
    { path: '/pase-lista', file: 'pase-lista.html' },
    { path: '/pantalla-asistencia', file: 'pantalla-asistencia.html' },
    { path: '/historial-sesiones', file: 'historial-sesiones.html' },
    { path: '/pase-lista-grid', file: 'pase-lista-grid.html' }
];

viewRoutes.forEach(route => {
    app.get(route.path, (req, res) => {
        // Security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        
        if (process.env.NODE_ENV === 'production') {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        
        res.sendFile(path.join(__dirname, 'src/views', route.file));
    });
});

// Enhanced WebSocket handling with authentication and rate limiting
const socketConnections = new Map();
const socketRateLimit = new Map();

io.use((socket, next) => {
    // Rate limiting per IP
    const clientIP = socket.handshake.address;
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    if (!socketRateLimit.has(clientIP)) {
        socketRateLimit.set(clientIP, []);
    }
    
    const clientRequests = socketRateLimit.get(clientIP);
    const recentRequests = clientRequests.filter(time => time > windowStart);
    
    if (recentRequests.length >= 60) { // Max 60 connections per minute per IP
        return next(new Error('Rate limit exceeded'));
    }
    
    recentRequests.push(now);
    socketRateLimit.set(clientIP, recentRequests);
    
    next();
});

io.on('connection', (socket) => {
    const clientInfo = {
        id: socket.id,
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
        connectedAt: new Date().toISOString()
    };
    
    socketConnections.set(socket.id, clientInfo);
    
    console.log(`🔌 Cliente conectado: ${socket.id} (${clientInfo.ip})`);
    
    // Send connection confirmation
    socket.emit('connection-confirmed', {
        socketId: socket.id,
        serverTime: new Date().toISOString()
    });
    
    // Handle authentication
    socket.on('authenticate', (data) => {
        // Here you could verify JWT token and associate socket with user
        // For now, we'll just store the user info
        if (data && data.token) {
            socketConnections.get(socket.id).authenticated = true;
            socketConnections.get(socket.id).token = data.token;
        }
    });
    
    socket.on('disconnect', (reason) => {
        console.log(`🔌 Cliente desconectado: ${socket.id} (${reason})`);
        socketConnections.delete(socket.id);
    });
    
    // Handle errors
    socket.on('error', (error) => {
        console.error(`🔌 Error en socket ${socket.id}:`, error);
    });
});

// Clean up socket rate limit periodically
setInterval(() => {
    const now = Date.now();
    const windowStart = now - 60000;
    
    for (const [ip, requests] of socketRateLimit.entries()) {
        const recentRequests = requests.filter(time => time > windowStart);
        if (recentRequests.length === 0) {
            socketRateLimit.delete(ip);
        } else {
            socketRateLimit.set(ip, recentRequests);
        }
    }
}, 60000); // Every minute

// Streaming server management
let streamingServer = null;

function iniciarServidorStreaming() {
    console.log('🎥 Iniciando servidor de streaming WebRTC...');
    
    const streamingProcess = spawn('node', [path.join(__dirname, 'src/streaming/webrtc-server.js')], {
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true
    });

    streamingProcess.stdout.on('data', (data) => {
        console.log(`[Streaming] ${data.toString().trim()}`);
    });

    streamingProcess.stderr.on('data', (data) => {
        console.error(`[Streaming Error] ${data.toString().trim()}`);
    });

    streamingProcess.on('error', (error) => {
        console.error('❌ Error en servidor de streaming:', error);
    });

    streamingProcess.on('exit', (code) => {
        if (code !== 0) {
            console.error(`⚠️ Servidor de streaming terminó con código ${code}`);
            // Auto-restart after 5 seconds
            setTimeout(() => {
                if (streamingServer === streamingProcess) {
                    streamingServer = iniciarServidorStreaming();
                }
            }, 5000);
        }
    });

    return streamingProcess;
}

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3333;
const HOST = process.env.HOST || 'localhost';

server.listen(PORT, HOST, async () => {
    console.log('═══════════════════════════════════════════════════');
    console.log('🚀 SISTEMA DE VOTACIÓN - SERVIDOR OPTIMIZADO');
    console.log('═══════════════════════════════════════════════════');
    console.log(`✅ Servidor principal: http://${HOST}:${PORT}`);
    console.log(`📺 Pantalla pública: http://${HOST}:${PORT}/pantalla`);
    console.log(`📊 Monitoreo: http://${HOST}:${PORT}/api/system/performance`);
    console.log(`🗄️ Cache stats: http://${HOST}:${PORT}/api/system/cache-stats`);
    
    // Start streaming server
    streamingServer = iniciarServidorStreaming();
    
    // Warm up cache
    if (process.env.NODE_ENV === 'production') {
        await cacheWarming.warmUp(app);
    }
    
    console.log('═══════════════════════════════════════════════════');
    console.log('✨ Sistema optimizado iniciado correctamente');
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 Rate limiting: Activo`);
    console.log(`⚡ Performance monitoring: Activo`);
    console.log(`💾 Cache: Activo`);
    console.log('💡 Presiona Ctrl+C para detener todos los servicios');
    console.log('═══════════════════════════════════════════════════');
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
    console.log(`\n⏹️ Recibida señal ${signal}, iniciando cierre limpio...`);
    
    // Close server
    server.close(async () => {
        console.log('   • Servidor HTTP cerrado');
        
        // Stop streaming server
        if (streamingServer) {
            console.log('   • Deteniendo servidor de streaming...');
            streamingServer.kill('SIGTERM');
            
            // Wait a bit for graceful shutdown
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Close database connections
        try {
            const db = require('./src/db/database');
            if (db && db.close) {
                await new Promise((resolve, reject) => {
                    db.close((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                console.log('   • Base de datos cerrada');
            }
        } catch (error) {
            console.error('   ❌ Error cerrando base de datos:', error.message);
        }
        
        console.log('✅ Cierre limpio completado');
        process.exit(0);
    });
    
    // Force close if not closed within 10 seconds
    setTimeout(() => {
        console.error('❌ Forzando cierre del proceso...');
        process.exit(1);
    }, 10000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = app;