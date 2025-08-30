const express = require('express');
const router = express.Router();
const { authenticateToken, authorize } = require('../auth/middleware');

// Middleware de autenticación
router.use(authenticateToken);

// Configuración de streaming por defecto
let streamingConfig = {
    source: 'ndi',
    url: 'http://192.168.150.71:8088/live', // URL de vMix con NDI
    quality: 'auto',
    ndiSettings: {
        host: '192.168.150.71',
        port: 8088,
        streamName: 'live'
    },
    rtmpSettings: {
        url: 'rtmp://localhost/live/stream'
    },
    hlsSettings: {
        url: '/streaming/hls/stream.m3u8'
    }
};

// Verificar que sea miembro de mesa directiva
function verifyMesaDirectiva(req, res, next) {
    const db = req.db;
    const userId = req.user.id;
    
    db.get(`
        SELECT cargo_mesa_directiva 
        FROM usuarios 
        WHERE id = ?
    `, [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando permisos' });
        }
        
        if (!user || !user.cargo_mesa_directiva) {
            return res.status(403).json({ 
                error: 'Acceso denegado', 
                message: 'Solo los miembros de la mesa directiva pueden acceder al streaming' 
            });
        }
        
        const cargoNormalizado = user.cargo_mesa_directiva.toLowerCase();
        const cargosPermitidos = ['presidente', 'vicepresidente', 'secretario', 'prosecretario'];
        
        const tienePermiso = cargosPermitidos.some(cargo => 
            cargoNormalizado.includes(cargo)
        );
        
        if (!tienePermiso) {
            return res.status(403).json({ 
                error: 'Acceso denegado',
                message: 'No tienes permisos para acceder al streaming'
            });
        }
        
        req.userCargo = user.cargo_mesa_directiva;
        next();
    });
}

// Obtener configuración actual del streaming
router.get('/config', verifyMesaDirectiva, (req, res) => {
    res.json(streamingConfig);
});

// Actualizar configuración del streaming (solo presidente)
router.post('/config', verifyMesaDirectiva, (req, res) => {
    const cargo = req.userCargo.toLowerCase();
    
    // Solo el presidente puede cambiar la configuración
    if (!cargo.includes('presidente')) {
        return res.status(403).json({ 
            error: 'Solo el presidente puede modificar la configuración del streaming' 
        });
    }
    
    const { source, url, quality, ndiSettings, rtmpSettings, hlsSettings } = req.body;
    
    if (source) streamingConfig.source = source;
    if (url) streamingConfig.url = url;
    if (quality) streamingConfig.quality = quality;
    if (ndiSettings) streamingConfig.ndiSettings = { ...streamingConfig.ndiSettings, ...ndiSettings };
    if (rtmpSettings) streamingConfig.rtmpSettings = { ...streamingConfig.rtmpSettings, ...rtmpSettings };
    if (hlsSettings) streamingConfig.hlsSettings = { ...streamingConfig.hlsSettings, ...hlsSettings };
    
    // Notificar a todos los clientes conectados sobre el cambio
    const io = req.app.get('io');
    if (io) {
        io.emit('streaming-config-updated', streamingConfig);
    }
    
    res.json({ 
        success: true, 
        message: 'Configuración actualizada',
        config: streamingConfig 
    });
});

// Obtener estado del streaming
router.get('/status', verifyMesaDirectiva, (req, res) => {
    const db = req.db;
    
    // Obtener información de la sesión actual
    db.get(`
        SELECT 
            s.id,
            s.tipo_sesion,
            s.estado,
            s.fecha_inicio,
            COUNT(DISTINCT a.usuario_id) as viewers
        FROM sesiones s
        LEFT JOIN asistencias a ON a.sesion_id = s.id
        WHERE s.estado = 'activa'
        ORDER BY s.fecha_inicio DESC
        LIMIT 1
    `, (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo estado' });
        }
        
        res.json({
            streaming: true,
            sesion: sesion || null,
            viewers: sesion ? sesion.viewers : 0,
            config: {
                source: streamingConfig.source,
                quality: streamingConfig.quality
            }
        });
    });
});

// Registrar visualización
router.post('/view', verifyMesaDirectiva, (req, res) => {
    const db = req.db;
    const userId = req.user.id;
    
    // Registrar en la base de datos que el usuario está viendo el stream
    const io = req.app.get('io');
    if (io) {
        io.emit('viewer-joined', { userId, name: req.user.nombre });
    }
    
    res.json({ success: true });
});

// Configuración específica para vMix NDI
router.get('/vmix-config', verifyMesaDirectiva, (req, res) => {
    // Configuración recomendada para vMix
    res.json({
        vmixUrl: streamingConfig.ndiSettings.host + ':' + streamingConfig.ndiSettings.port,
        streamPath: '/' + streamingConfig.ndiSettings.streamName,
        fullUrl: `http://${streamingConfig.ndiSettings.host}:${streamingConfig.ndiSettings.port}/${streamingConfig.ndiSettings.streamName}`,
        instructions: {
            vmix: {
                1: 'En vMix, ve a Settings > Web Controller',
                2: 'Habilita el Web Controller',
                3: 'Configura el puerto (por defecto 8088)',
                4: 'En Settings > Streaming, configura NDI Output',
                5: 'Habilita NDI y asigna un nombre al stream',
                6: 'La URL del stream será: http://[IP_VMIX]:8088/live'
            },
            alternativas: {
                rtmp: 'Puedes usar RTMP con un servidor como nginx-rtmp',
                srt: 'SRT ofrece menor latencia que RTMP',
                webrtc: 'WebRTC ofrece la menor latencia posible'
            }
        }
    });
});

// Endpoint para recibir webhooks de vMix (opcional)
router.post('/vmix-webhook', (req, res) => {
    console.log('vMix webhook recibido:', req.body);
    
    const io = req.app.get('io');
    if (io) {
        io.emit('vmix-event', req.body);
    }
    
    res.json({ received: true });
});

module.exports = router;