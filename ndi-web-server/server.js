const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');

// Configuración
const WEB_PORT = 8092;
const RTMP_PORT = 1935;
const HLS_PORT = 8080;

// Habilitar CORS
app.use(cors());
app.use(express.static('public'));
app.use('/hls', express.static('media'));

// Variables globales
let ffmpegProcess = null;
let isStreaming = false;

// Página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Función para iniciar captura NDI con FFmpeg
function startNDICapture() {
  if (ffmpegProcess) {
    console.log('NDI capture ya está ejecutándose');
    return;
  }

  console.log('Iniciando captura NDI desde vMix...');
  
  // FFmpeg con soporte NDI
  // Primero lista las fuentes NDI disponibles
  const listNDI = spawn('C:\\ffmpeg\\bin\\ffmpeg.exe', [
    '-f', 'libndi_newtek',
    '-list_sources', '1',
    '-i', 'dummy'
  ]);

  listNDI.stderr.on('data', (data) => {
    console.log('Fuentes NDI disponibles:', data.toString());
  });

  // Capturar NDI y convertir a HLS para web
  const ffmpegArgs = [
    // Input NDI - ajustar el nombre según tu vMix
    '-f', 'libndi_newtek',
    '-i', 'vMix Output',  // Nombre del output NDI de vMix
    
    // Configuración de video
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-b:v', '3000k',
    '-maxrate', '3000k',
    '-bufsize', '6000k',
    '-pix_fmt', 'yuv420p',
    '-g', '30',
    
    // Configuración de audio
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    
    // Output HLS
    '-f', 'hls',
    '-hls_time', '1',
    '-hls_list_size', '3',
    '-hls_flags', 'delete_segments',
    '-hls_segment_type', 'mpegts',
    'media/stream.m3u8',
    
    // Output adicional para WebSocket (FLV)
    '-f', 'flv',
    '-flvflags', 'no_duration_filesize',
    'rtmp://localhost:1935/live/stream'
  ];

  ffmpegProcess = spawn('C:\\ffmpeg\\bin\\ffmpeg.exe', ffmpegArgs);
  isStreaming = true;

  ffmpegProcess.stdout.on('data', (data) => {
    console.log('FFmpeg output:', data.toString());
  });

  ffmpegProcess.stderr.on('data', (data) => {
    const message = data.toString();
    console.log('FFmpeg:', message);
    
    // Enviar estadísticas a los clientes
    if (message.includes('fps=')) {
      io.emit('stream-stats', extractStats(message));
    }
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`FFmpeg cerrado con código ${code}`);
    ffmpegProcess = null;
    isStreaming = false;
    io.emit('stream-ended');
  });

  ffmpegProcess.on('error', (err) => {
    console.error('Error en FFmpeg:', err);
    ffmpegProcess = null;
    isStreaming = false;
  });
}

// Extraer estadísticas de FFmpeg
function extractStats(message) {
  const stats = {};
  
  // Extraer FPS
  const fpsMatch = message.match(/fps=\s*(\d+)/);
  if (fpsMatch) stats.fps = parseInt(fpsMatch[1]);
  
  // Extraer bitrate
  const bitrateMatch = message.match(/bitrate=\s*([\d.]+)kbits/);
  if (bitrateMatch) stats.bitrate = parseFloat(bitrateMatch[1]);
  
  return stats;
}

// Socket.IO para comunicación en tiempo real
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  // Enviar estado inicial
  socket.emit('server-ready', { streaming: isStreaming });
  
  // Cliente solicita iniciar stream
  socket.on('request-stream', () => {
    console.log('Cliente solicita stream NDI');
    if (!isStreaming) {
      startNDICapture();
    }
    socket.emit('stream-started', {
      hlsUrl: `http://192.168.150.71:${WEB_PORT}/hls/stream.m3u8`,
      wsUrl: `ws://192.168.150.71:${WEB_PORT}`
    });
  });
  
  // Cliente se desconecta
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Crear servidor RTMP simple para recibir el stream
const NodeMediaServer = require('node-media-server');
const nms = new NodeMediaServer({
  rtmp: {
    port: RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: HLS_PORT,
    allow_origin: '*',
    mediaroot: './media'
  },
  trans: {
    ffmpeg: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=1:hls_list_size=3:hls_flags=delete_segments]',
        hlsKeep: false
      }
    ]
  }
});

// Iniciar servidor RTMP
nms.run();

// Iniciar servidor web
http.listen(WEB_PORT, () => {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║      Servidor NDI to Web para vMix        ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║ Web Server: http://192.168.150.71:${WEB_PORT}    ║`);
  console.log(`║ HLS Stream: http://192.168.150.71:${HLS_PORT}    ║`);
  console.log(`║ RTMP Server: rtmp://localhost:${RTMP_PORT}       ║`);
  console.log('╠════════════════════════════════════════════╣');
  console.log('║ Configurar vMix:                           ║');
  console.log('║ 1. Settings → Outputs → NDI Output ON     ║');
  console.log('║ 2. El servidor detectará automáticamente  ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log('\nEsperando conexión NDI de vMix...\n');
  
  // Intentar capturar NDI automáticamente
  setTimeout(() => {
    console.log('Buscando fuentes NDI...');
    startNDICapture();
  }, 2000);
});

// Manejo de cierre
process.on('SIGINT', () => {
  console.log('\nCerrando servidor...');
  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGTERM');
  }
  nms.stop();
  process.exit(0);
});