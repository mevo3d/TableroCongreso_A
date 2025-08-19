require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const { spawn } = require('child_process');

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

app.use('/api/auth', authRoutes);
app.use('/api/operador', operadorRoutes);
app.use('/api/secretario', secretarioRoutes);
app.use('/api/diputado', diputadoRoutes);
app.use('/api/pantalla', pantallaRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/pase-lista', paseListaRoutes);
app.use('/api/servicios-legislativos', require('./src/routes/servicios-legislativos'));

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

app.get('/historial-sesiones', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/historial-sesiones.html'));
});

app.get('/pase-lista-grid', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/pase-lista-grid.html'));
});

app.get('/pase-lista-mejorado', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/pase-lista-mejorado.html'));
});

// Socket.IO
io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });
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