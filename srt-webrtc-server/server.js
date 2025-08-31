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
const SRT_PORT = 9999;
const WEB_PORT = 8091;
const VMIX_IP = '127.0.0.1'; // Local en la misma máquina

// Habilitar CORS
app.use(cors());
app.use(express.static('public'));

// Variables globales
let ffmpegProcess = null;
let isStreaming = false;

// Página de prueba
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Función para iniciar FFmpeg y convertir SRT a WebRTC
function startFFmpeg(socketId) {
  if (ffmpegProcess) {
    console.log('FFmpeg ya está ejecutándose');
    return;
  }

  console.log('Iniciando FFmpeg para recibir SRT y convertir a WebRTC...');
  
  // Comando FFmpeg para recibir SRT y convertir a formato web
  const ffmpegArgs = [
    // Input SRT
    '-f', 'mpegts',
    '-i', `srt://127.0.0.1:${SRT_PORT}?mode=listener`,
    
    // Configuración de video
    '-c:v', 'libvpx-vp9',  // Codec VP9 para WebRTC
    '-b:v', '2M',           // Bitrate 2 Mbps
    '-g', '60',             // Keyframe cada 60 frames
    '-quality', 'realtime',
    '-speed', '6',
    '-threads', '4',
    
    // Configuración de audio
    '-c:a', 'libopus',      // Codec Opus para WebRTC
    '-b:a', '128k',
    '-ar', '48000',
    
    // Output
    '-f', 'webm',
    '-cluster_size_limit', '2M',
    '-cluster_time_limit', '100',
    '-content_type', 'video/webm',
    '-headers', 'Access-Control-Allow-Origin: *',
    'pipe:1'
  ];

  ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
  isStreaming = true;

  // Enviar stream a través de Socket.IO
  ffmpegProcess.stdout.on('data', (chunk) => {
    io.emit('stream-data', chunk);
  });

  ffmpegProcess.stderr.on('data', (data) => {
    console.log('FFmpeg:', data.toString());
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

// Función para detener FFmpeg
function stopFFmpeg() {
  if (ffmpegProcess) {
    console.log('Deteniendo FFmpeg...');
    ffmpegProcess.kill('SIGTERM');
    ffmpegProcess = null;
    isStreaming = false;
  }
}

// Socket.IO para señalización WebRTC
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  // Enviar estado inicial
  socket.emit('server-ready', { streaming: isStreaming });
  
  // Cliente solicita iniciar stream
  socket.on('request-stream', () => {
    console.log('Cliente solicita stream');
    if (!isStreaming) {
      startFFmpeg(socket.id);
    }
    socket.emit('stream-started');
  });
  
  // Cliente se desconecta
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
    // Si no hay más clientes, detener FFmpeg
    if (io.engine.clientsCount === 0) {
      setTimeout(() => {
        if (io.engine.clientsCount === 0) {
          stopFFmpeg();
        }
      }, 5000); // Esperar 5 segundos antes de detener
    }
  });
  
  // Manejo de errores
  socket.on('error', (error) => {
    console.error('Error en socket:', error);
  });
});

// Iniciar servidor
http.listen(WEB_PORT, () => {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     Servidor SRT to WebRTC para vMix      ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║ WebSocket escuchando en: http://localhost:${WEB_PORT}`);
  console.log(`║ SRT esperando en: srt://127.0.0.1:${SRT_PORT}`);
  console.log('╠════════════════════════════════════════════╣');
  console.log('║ Configurar vMix:                           ║');
  console.log(`║ URL: srt://127.0.0.1:${SRT_PORT}?mode=caller    ║`);
  console.log('║ Codec: H.264, Audio: AAC                  ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log('\nEsperando conexión de vMix...\n');
});

// Manejo de cierre graceful
process.on('SIGINT', () => {
  console.log('\nCerrando servidor...');
  stopFFmpeg();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopFFmpeg();
  process.exit(0);
});