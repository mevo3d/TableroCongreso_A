require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const { spawn } = require('child_process');
const logger = require('./src/utils/logger');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Configurar Express para confiar en proxies (importante para obtener la IP correcta)
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use('/documentos-sesion', express.static(path.join(__dirname, 'uploads/sesiones')));

// Servir archivos PWA con headers correctos
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

app.get('/service-worker.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'public', 'service-worker.js'));
});

// Middleware para pasar db e io a las rutas
app.use((req, res, next) => {
    const db = require('./src/db/database');
    req.db = db;
    req.io = io;
    next();
});

// Rutas API
const authRoutes = require('./src/routes/auth');
const operadorRoutes = require('./src/routes/operador');
const secretarioRoutes = require('./src/routes/secretario');
const diputadoRoutes = require('./src/routes/diputado');
const pantallaRoutes = require('./src/routes/pantalla');
const superadminRoutes = require('./src/routes/superadmin');
const paseListaRoutes = require('./src/routes/pase-lista');
const exportarRoutes = require('./src/routes/exportar-mejorado');
const validacionPdfRoutes = require('./src/routes/validacion-pdf');

app.use('/api/auth', authRoutes);
app.use('/api/operador', operadorRoutes);
app.use('/api/secretario', secretarioRoutes);
app.use('/api/diputado', diputadoRoutes);
app.use('/api/pantalla', pantallaRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/pase-lista', paseListaRoutes);
app.use('/api/servicios-legislativos', require('./src/routes/servicios-legislativos'));
app.use('/api/exportar', exportarRoutes);
app.use('/api/validacion', validacionPdfRoutes);

// Rutas de acceso de prueba (solo desarrollo)
const testAccessRoutes = require('./src/routes/test-access');
app.use('/test-access', testAccessRoutes);

// Función auxiliar para construir URLs absolutas
function buildAbsoluteUrl(req, relativePath) {
    if (!relativePath) return null;
    
    // Si ya es una URL absoluta, devolverla tal cual
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
        return relativePath;
    }
    
    // Construir URL absoluta basada en el host de la petición
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    // Asegurar que la ruta relativa empiece con /
    const pathUrl = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    
    return `${baseUrl}${pathUrl}`;
}

// Ruta pública para configuración (sin autenticación)
app.get('/api/configuracion/public', (req, res) => {
    const db = req.db;
    db.get('SELECT logo_congreso, logo_secundario, nombre_congreso FROM configuracion_sistema WHERE id = 1', (err, config) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo configuración' });
        }
        
        if (config) {
            config.logo_congreso = buildAbsoluteUrl(req, config.logo_congreso);
            config.logo_secundario = buildAbsoluteUrl(req, config.logo_secundario);
        }
        
        res.json(config || {});
    });
});

// Ruta de autologin (solo para localhost)
app.get('/autologin/:username', (req, res) => {
    // Solo permitir desde localhost por seguridad
    const clientIp = req.ip || req.connection.remoteAddress;
    const isLocalhost = clientIp === '127.0.0.1' || 
                       clientIp === '::1' || 
                       clientIp === '::ffff:127.0.0.1' ||
                       req.hostname === 'localhost';
    
    if (!isLocalhost) {
        return res.status(403).send('Acceso denegado - Solo disponible desde localhost');
    }
    
    const username = req.params.username;
    const db = req.db;
    
    // Buscar el usuario
    db.get('SELECT id, username, role, nombre_completo FROM usuarios WHERE username = ?', 
        [username], (err, user) => {
        if (err || !user) {
            return res.redirect('/');
        }
        
        // Generar token temporal
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET || 'tu_clave_secreta_aqui',
            { expiresIn: '24h' }
        );
        
        // Determinar la ruta de redirección según el rol
        let redirectPath = '/';
        switch(user.role) {
            case 'superadmin': redirectPath = '/superadmin'; break;
            case 'servicios_legislativos': redirectPath = '/servicios-legislativos'; break;
            case 'operador': redirectPath = '/operador'; break;
            case 'secretario': redirectPath = '/secretario'; break;
            case 'diputado': redirectPath = '/diputado'; break;
        }
        
        // Enviar HTML con el token y redirección automática
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Autologin - ${user.nombre_completo}</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: #f0f0f0;
                    }
                    .loading {
                        text-align: center;
                        padding: 2rem;
                        background: white;
                        border-radius: 10px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    .spinner {
                        border: 3px solid #f3f3f3;
                        border-top: 3px solid #3498db;
                        border-radius: 50%;
                        width: 40px;
                        height: 40px;
                        animation: spin 1s linear infinite;
                        margin: 0 auto 1rem;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            </head>
            <body>
                <div class="loading">
                    <div class="spinner"></div>
                    <h3>Iniciando sesión como ${user.nombre_completo}</h3>
                    <p>Redirigiendo al panel...</p>
                </div>
                <script>
                    localStorage.setItem('token', '${token}');
                    localStorage.setItem('user', '${JSON.stringify({
                        id: user.id,
                        username: user.username,
                        nombre: user.nombre_completo,
                        role: user.role
                    }).replace(/'/g, "\\'")}');
                    setTimeout(() => {
                        window.location.href = '${redirectPath}';
                    }, 1000);
                </script>
            </body>
            </html>
        `);
    });
});

// Rutas de vistas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/login.html'));
});

app.get('/operador', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/operador.html'));
});

app.get('/secretario', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/secretario.html'));
});

app.get('/servicios-legislativos', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/servicios-legislativos.html'));
});

app.get('/diputado', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/diputado.html'));
});

app.get('/pantalla', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/pantalla.html'));
});

app.get('/superadmin', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/superadmin.html'));
});

app.get('/pase-lista', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/pase-lista.html'));
});

app.get('/pantalla-asistencia', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/pantalla-asistencia.html'));
});

app.get('/tablero-diputado', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/tablero-diputado.html'));
});

app.get('/estadisticas-diputados', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/estadisticas-diputados.html'));
});

app.get('/historial-sesiones', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/historial-sesiones.html'));
});

// Rutas obsoletas - Redirigir a la versión unificada
app.get('/pase-lista-grid', (req, res) => {
    res.redirect('/pase-lista');
});

app.get('/pase-lista-mejorado', (req, res) => {
    res.redirect('/pase-lista');
});

// Endpoint para obtener usuarios conectados
app.get('/api/usuarios-conectados', (req, res) => {
    const usuarios = Array.from(usuariosConectados.values());
    res.json({ 
        usuarios: usuarios,
        total: usuarios.length,
        timestamp: new Date()
    });
});

// Mapa para rastrear usuarios conectados
const usuariosConectados = new Map();

// Socket.IO
io.on('connection', (socket) => {
    console.log('🔌 Nueva conexión - Socket ID:', socket.id);
    
    // Registrar usuario cuando se identifica
    socket.on('identificar-usuario', (userData) => {
        if (userData && userData.nombre) {
            usuariosConectados.set(socket.id, {
                nombre: userData.nombre,
                rol: userData.rol || 'Usuario',
                conectadoEn: new Date(),
                socketId: socket.id
            });
            
            console.log(`✅ Usuario conectado: ${userData.nombre} (${userData.rol}) - Socket: ${socket.id}`);
            
            // Emitir lista actualizada a superadmin
            io.emit('usuarios-conectados-actualizado', Array.from(usuariosConectados.values()));
        }
    });
    
    // Manejo de logs para consola en tiempo real
    socket.on('console:subscribe', () => {
        socket.join('console-logs');
        
        // Enviar logs históricos
        const historicalLogs = logger.getLogs(100);
        socket.emit('console:history', historicalLogs);
        
        const usuario = usuariosConectados.get(socket.id);
        const nombreUsuario = usuario ? usuario.nombre : 'Desconocido';
        console.log(`📊 ${nombreUsuario} (${socket.id}) suscrito a logs de consola`);
    });
    
    socket.on('console:unsubscribe', () => {
        socket.leave('console-logs');
        const usuario = usuariosConectados.get(socket.id);
        const nombreUsuario = usuario ? usuario.nombre : 'Desconocido';
        console.log(`📊 ${nombreUsuario} (${socket.id}) desuscrito de logs de consola`);
    });
    
    socket.on('console:clear', () => {
        logger.clearLogs();
        io.to('console-logs').emit('console:cleared');
        const usuario = usuariosConectados.get(socket.id);
        const nombreUsuario = usuario ? usuario.nombre : 'Desconocido';
        console.log(`🗑️ Logs limpiados por ${nombreUsuario}`);
    });
    
    // Manejo de eventos de pase de lista
    socket.on('pase-lista-activado', (data) => {
        console.log('📋 Pase de lista activado:', data);
        // Reenviar a todos los clientes
        io.emit('pase-lista-activado', data);
    });
    
    socket.on('asistencia-marcada', (data) => {
        console.log('✅ Asistencia marcada:', data);
        // Reenviar a todos los clientes
        io.emit('asistencia-marcada', data);
    });
    
    socket.on('pase-lista-confirmado', (data) => {
        console.log('📋 Pase de lista confirmado:', data);
        // Reenviar a todos los clientes
        io.emit('pase-lista-confirmado', data);
    });
    
    socket.on('disconnect', () => {
        const usuario = usuariosConectados.get(socket.id);
        if (usuario) {
            console.log(`❌ Usuario desconectado: ${usuario.nombre} (${usuario.rol}) - Socket: ${socket.id}`);
            usuariosConectados.delete(socket.id);
            
            // Emitir lista actualizada a superadmin
            io.emit('usuarios-conectados-actualizado', Array.from(usuariosConectados.values()));
        } else {
            console.log(`❌ Cliente desconectado (no identificado) - Socket: ${socket.id}`);
        }
    });
});

// Escuchar nuevos logs y transmitirlos
logger.on('newLog', (logEntry) => {
    io.to('console-logs').emit('console:log', logEntry);
});

logger.on('logsCleared', () => {
    io.to('console-logs').emit('console:cleared');
});

// Función para iniciar el servidor de streaming
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
        }
    });

    return streamingProcess;
}

// Variable para almacenar el proceso de streaming
let streamingServer = null;

// Iniciar servidor principal
const PORT = process.env.PORT || 3333;
server.listen(PORT, () => {
    console.log('═══════════════════════════════════════════════════');
    console.log('🚀 SISTEMA DE VOTACIÓN - INICIANDO SERVICIOS');
    console.log('═══════════════════════════════════════════════════');
    console.log(`✅ Servidor principal en: http://localhost:${PORT}`);
    console.log(`📺 Pantalla pública en: http://localhost:${PORT}/pantalla`);
    
    // Iniciar servidor de streaming solo si no está deshabilitado
    if (!process.env.DISABLE_STREAMING) {
        streamingServer = iniciarServidorStreaming();
    }
    
    console.log('═══════════════════════════════════════════════════');
    console.log('✨ Todos los servicios iniciados correctamente');
    console.log('💡 Presiona Ctrl+C para detener todos los servicios');
    console.log('═══════════════════════════════════════════════════');
});

// Manejo de cierre limpio
process.on('SIGINT', () => {
    console.log('\n⏹️ Deteniendo servicios...');
    if (streamingServer) {
        console.log('   • Deteniendo servidor de streaming...');
        streamingServer.kill('SIGTERM');
    }
    console.log('   • Deteniendo servidor principal...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    if (streamingServer) {
        streamingServer.kill('SIGTERM');
    }
    process.exit(0);
});