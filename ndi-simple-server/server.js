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
const fs = require('fs');

// Configuración
const PORT = 8093;

// Habilitar CORS
app.use(cors());
app.use(express.static('public'));

// Variables globales
let ffmpegProcess = null;
let isStreaming = false;

// Página principal
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>NDI Stream Viewer</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #000;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            font-family: Arial, sans-serif;
        }
        #videoContainer {
            width: 90%;
            max-width: 1280px;
            position: relative;
        }
        video {
            width: 100%;
            height: auto;
            background: #000;
        }
        .controls {
            position: absolute;
            top: 20px;
            left: 20px;
            z-index: 10;
        }
        button {
            padding: 10px 20px;
            font-size: 16px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            margin: 5px;
        }
        button:hover {
            background: #45a049;
        }
        .status {
            position: absolute;
            top: 20px;
            right: 20px;
            padding: 10px;
            background: rgba(0,0,0,0.7);
            color: white;
            border-radius: 5px;
        }
        .live-indicator {
            display: inline-block;
            width: 10px;
            height: 10px;
            background: red;
            border-radius: 50%;
            margin-right: 5px;
            animation: blink 1s infinite;
        }
        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0.3; }
        }
    </style>
</head>
<body>
    <div id="videoContainer">
        <div class="controls">
            <button onclick="connectStream()">Conectar NDI</button>
            <button onclick="disconnectStream()">Desconectar</button>
        </div>
        <div class="status">
            <span class="live-indicator"></span>
            <span id="statusText">Desconectado</span>
        </div>
        <video id="videoPlayer" controls autoplay muted></video>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        const video = document.getElementById('videoPlayer');
        const statusText = document.getElementById('statusText');
        let mediaSource;
        let sourceBuffer;
        let queue = [];
        
        function connectStream() {
            console.log('Conectando a NDI...');
            statusText.textContent = 'Conectando...';
            
            // Usar HLS.js para mejor compatibilidad
            if (Hls.isSupported()) {
                const hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                });
                hls.loadSource('/stream.m3u8');
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, function() {
                    video.play();
                    statusText.textContent = 'EN VIVO';
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Para Safari
                video.src = '/stream.m3u8';
                video.addEventListener('loadedmetadata', function() {
                    video.play();
                    statusText.textContent = 'EN VIVO';
                });
            } else {
                // Fallback a MediaSource API
                setupMediaSource();
            }
            
            socket.emit('start-ndi');
        }
        
        function setupMediaSource() {
            if ('MediaSource' in window) {
                mediaSource = new MediaSource();
                video.src = URL.createObjectURL(mediaSource);
                
                mediaSource.addEventListener('sourceopen', () => {
                    sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.42E01E,mp4a.40.2"');
                    
                    sourceBuffer.addEventListener('updateend', () => {
                        if (queue.length > 0 && !sourceBuffer.updating) {
                            sourceBuffer.appendBuffer(queue.shift());
                        }
                    });
                });
            }
        }
        
        function disconnectStream() {
            statusText.textContent = 'Desconectado';
            socket.emit('stop-ndi');
            if (video.src) {
                video.src = '';
            }
        }
        
        socket.on('stream-data', (data) => {
            if (sourceBuffer && !sourceBuffer.updating) {
                try {
                    sourceBuffer.appendBuffer(new Uint8Array(data));
                } catch (e) {
                    queue.push(new Uint8Array(data));
                }
            }
        });
        
        socket.on('stream-started', () => {
            statusText.textContent = 'EN VIVO - NDI';
        });
        
        socket.on('stream-ended', () => {
            statusText.textContent = 'Stream finalizado';
        });
    </script>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</body>
</html>
  `);
});

// Endpoint para HLS
app.get('/stream.m3u8', (req, res) => {
  const filePath = path.join(__dirname, 'stream', 'output.m3u8');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Stream no disponible');
  }
});

app.get('/stream:segment.ts', (req, res) => {
  const filePath = path.join(__dirname, 'stream', req.params.segment + '.ts');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Segmento no encontrado');
  }
});

// Función para capturar NDI/Desktop con FFmpeg
function startNDICapture() {
  if (ffmpegProcess) {
    console.log('Captura ya en proceso');
    return;
  }

  console.log('Iniciando captura...');
  
  // Crear carpeta para streams
  if (!fs.existsSync('stream')) {
    fs.mkdirSync('stream');
  }
  
  // Capturar desde SRT que ya está funcionando
  const ffmpegArgs = [
    // Input desde SRT
    '-i', 'srt://192.168.150.71:9999?mode=caller',
    '-analyzeduration', '1000000',
    '-probesize', '1000000',
    
    // Configuración de video
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-b:v', '2500k',
    '-maxrate', '2500k',
    '-bufsize', '5000k',
    '-pix_fmt', 'yuv420p',
    '-g', '30',
    
    // Audio passthrough
    '-c:a', 'aac',
    '-b:a', '128k',
    
    // Output HLS
    '-f', 'hls',
    '-hls_time', '1',
    '-hls_list_size', '5',
    '-hls_flags', 'delete_segments',
    '-hls_segment_filename', 'stream/segment%d.ts',
    'stream/output.m3u8'
  ];

  ffmpegProcess = spawn('C:\\ffmpeg\\bin\\ffmpeg.exe', ffmpegArgs);
  isStreaming = true;

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

// Socket.IO
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  socket.on('start-ndi', () => {
    if (!isStreaming) {
      startNDICapture();
      socket.emit('stream-started');
    }
  });
  
  socket.on('stop-ndi', () => {
    if (ffmpegProcess) {
      ffmpegProcess.kill('SIGTERM');
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Iniciar servidor
http.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     Servidor NDI/Desktop Capture          ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║ Acceder en: http://192.168.150.71:${PORT}    ║`);
  console.log('║                                            ║');
  console.log('║ Este servidor captura:                    ║');
  console.log('║ - Pantalla completa del PC                ║');
  console.log('║ - O ventana de vMix específicamente       ║');
  console.log('╚════════════════════════════════════════════╝');
});

// Manejo de cierre
process.on('SIGINT', () => {
  console.log('\nCerrando servidor...');
  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGTERM');
  }
  process.exit(0);
});