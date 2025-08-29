const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mediasoup = require('mediasoup');
const NodeMediaServer = require('node-media-server');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Configuración de MediaSoup
let worker;
let router;
let producers = new Map();
let consumers = new Map();
let transports = new Map();
let viewers = new Map(); // Track de espectadores

// Configuración del Media Server para RTMP
const nmsConfig = {
    rtmp: {
        port: 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60
    },
    http: {
        port: 5667,
        mediaroot: './media',
        allow_origin: '*'
    },
    trans: {
        ffmpeg: 'ffmpeg',
        tasks: [
            {
                app: 'live',
                hls: true,
                hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
                dash: true,
                dashFlags: '[f=dash:window_size=3:extra_window_size=5]'
            }
        ]
    }
};

const nms = new NodeMediaServer(nmsConfig);

// Inicializar MediaSoup
async function startMediasoup() {
    try {
        // Crear worker
        worker = await mediasoup.createWorker({
            logLevel: 'warn',
            rtcMinPort: 10000,
            rtcMaxPort: 10100,
        });

        console.log('✅ MediaSoup Worker creado');

        // Manejar muerte del worker
        worker.on('died', () => {
            console.error('MediaSoup worker murió, reiniciando...');
            setTimeout(() => startMediasoup(), 2000);
        });

        // Crear router con codecs
        router = await worker.createRouter({
            mediaCodecs: [
                {
                    kind: 'video',
                    mimeType: 'video/VP8',
                    clockRate: 90000,
                    parameters: {
                        'x-google-start-bitrate': 1000,
                    },
                },
                {
                    kind: 'video',
                    mimeType: 'video/H264',
                    clockRate: 90000,
                    parameters: {
                        'packetization-mode': 1,
                        'profile-level-id': '42e01f',
                        'level-asymmetry-allowed': 1,
                    },
                },
                {
                    kind: 'audio',
                    mimeType: 'audio/opus',
                    clockRate: 48000,
                    channels: 2,
                },
            ],
        });

        console.log('✅ MediaSoup Router creado');
    } catch (error) {
        console.error('Error iniciando MediaSoup:', error);
    }
}

// Endpoints para OBS Publisher
app.get('/api/streaming/capabilities', (req, res) => {
    if (!router) {
        return res.status(500).json({ error: 'Router no disponible' });
    }
    res.json(router.rtpCapabilities);
});

// Crear transport para producir (OBS)
app.post('/api/streaming/produce/transport', async (req, res) => {
    try {
        const transport = await router.createWebRtcTransport({
            listenIps: [
                {
                    ip: '0.0.0.0',
                    announcedIp: req.body.announcedIp || '127.0.0.1'
                }
            ],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            initialAvailableOutgoingBitrate: 1000000,
        });

        transports.set(transport.id, transport);

        res.json({
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
        });
    } catch (error) {
        console.error('Error creando transport:', error);
        res.status(500).json({ error: error.message });
    }
});

// Conectar transport de producción
app.post('/api/streaming/produce/connect', async (req, res) => {
    const { transportId, dtlsParameters } = req.body;
    const transport = transports.get(transportId);
    
    if (!transport) {
        return res.status(404).json({ error: 'Transport no encontrado' });
    }

    await transport.connect({ dtlsParameters });
    res.json({ connected: true });
});

// Producir stream
app.post('/api/streaming/produce', async (req, res) => {
    const { transportId, kind, rtpParameters } = req.body;
    const transport = transports.get(transportId);
    
    if (!transport) {
        return res.status(404).json({ error: 'Transport no encontrado' });
    }

    const producer = await transport.produce({
        kind,
        rtpParameters,
    });

    producers.set(producer.id, producer);
    
    // Notificar a todos los clientes que hay stream disponible
    io.emit('stream-available', { 
        producerId: producer.id,
        kind 
    });

    res.json({ id: producer.id });
});

// Socket.IO para consumidores (iPads)
io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    // Cliente quiere consumir stream
    socket.on('consume-stream', async (data) => {
        try {
            const { rtpCapabilities, diputadoId, nombre } = data;

            // Verificar que hay un producer
            if (producers.size === 0) {
                socket.emit('no-stream-available');
                return;
            }

            // Crear transport para consumidor
            const transport = await router.createWebRtcTransport({
                listenIps: [
                    {
                        ip: '0.0.0.0',
                        announcedIp: '127.0.0.1'
                    }
                ],
                enableUdp: true,
                enableTcp: true,
                preferUdp: true,
            });

            transports.set(transport.id, transport);

            // Enviar parámetros del transport
            socket.emit('transport-created', {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            });

            // Guardar info del transport para este socket
            socket.transportId = transport.id;

            // Conectar transport cuando el cliente esté listo
            socket.on('connect-transport', async ({ dtlsParameters }) => {
                const transport = transports.get(socket.transportId);
                await transport.connect({ dtlsParameters });
                socket.emit('transport-connected');
            });

            // Consumir cada producer disponible
            socket.on('consume', async ({ transportId }) => {
                const consumerTransport = transports.get(transportId);
                
                for (const [producerId, producer] of producers) {
                    // Verificar si el router puede consumir
                    if (!router.canConsume({
                        producerId: producer.id,
                        rtpCapabilities
                    })) {
                        continue;
                    }

                    // Crear consumer
                    const consumer = await consumerTransport.consume({
                        producerId: producer.id,
                        rtpCapabilities,
                        paused: false,
                    });

                    consumers.set(consumer.id, consumer);

                    // Enviar parámetros del consumer
                    socket.emit('consumer-created', {
                        id: consumer.id,
                        producerId: producer.id,
                        kind: consumer.kind,
                        rtpParameters: consumer.rtpParameters,
                    });
                }
            });

            // Registrar espectador
            viewers.set(socket.id, {
                diputadoId,
                nombre,
                connectedAt: new Date()
            });

            // Notificar contador de espectadores
            io.emit('viewer-count', { count: viewers.size });

        } catch (error) {
            console.error('Error en consume-stream:', error);
            socket.emit('error', { message: error.message });
        }
    });

    // Cambiar calidad del stream
    socket.on('change-quality', async ({ consumerId, quality }) => {
        const consumer = consumers.get(consumerId);
        if (consumer) {
            // Ajustar bitrate según calidad
            const bitrates = {
                high: 1000000,   // 1 Mbps
                medium: 500000,  // 500 Kbps
                low: 250000      // 250 Kbps
            };
            
            await consumer.setPreferredLayers({
                spatialLayer: quality === 'high' ? 2 : quality === 'medium' ? 1 : 0,
                temporalLayer: quality === 'high' ? 2 : 1
            });
            
            socket.emit('quality-changed', { quality });
        }
    });

    // Desconexión
    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
        
        // Limpiar recursos
        if (socket.transportId) {
            const transport = transports.get(socket.transportId);
            if (transport) {
                transport.close();
                transports.delete(socket.transportId);
            }
        }

        // Remover de espectadores
        viewers.delete(socket.id);
        
        // Actualizar contador
        io.emit('viewer-count', { count: viewers.size });
    });
});

// Endpoint para estadísticas
app.get('/api/streaming/stats', (req, res) => {
    res.json({
        viewers: viewers.size,
        producers: producers.size,
        consumers: consumers.size,
        viewersList: Array.from(viewers.values())
    });
});

// Eventos del Node Media Server
nms.on('preConnect', (id, args) => {
    console.log('[NodeMediaServer] Stream iniciando:', id, args);
});

nms.on('postConnect', (id, args) => {
    console.log('[NodeMediaServer] Stream conectado:', id, args);
});

nms.on('doneConnect', (id, args) => {
    console.log('[NodeMediaServer] Stream terminado:', id, args);
});

nms.on('prePublish', (id, StreamPath, args) => {
    console.log('[NodeMediaServer] Stream publicando:', id, StreamPath, args);
    
    // Notificar que el stream está disponible
    io.emit('stream-live', { 
        path: StreamPath,
        timestamp: new Date()
    });
});

nms.on('donePublish', (id, StreamPath, args) => {
    console.log('[NodeMediaServer] Stream detenido:', id, StreamPath, args);
    
    // Notificar que el stream se detuvo
    io.emit('stream-ended', { 
        path: StreamPath,
        timestamp: new Date()
    });
});

// Iniciar servidores
async function start() {
    await startMediasoup();
    
    // Iniciar Node Media Server para RTMP
    nms.run();
    console.log('✅ Node Media Server iniciado en puerto 1935 (RTMP) y 5667 (HTTP)');
    
    // Iniciar servidor WebRTC
    const PORT = process.env.WEBRTC_PORT || 3001;
    server.listen(PORT, () => {
        console.log(`✅ Servidor WebRTC corriendo en puerto ${PORT}`);
        console.log('');
        console.log('📹 Configuración OBS:');
        console.log('   Server: rtmp://localhost:1935/live');
        console.log('   Stream Key: congreso');
        console.log('');
        console.log('🌐 Stream HLS disponible en:');
        console.log('   http://localhost:5667/live/congreso/index.m3u8');
    });
}

start().catch(console.error);

module.exports = { io };