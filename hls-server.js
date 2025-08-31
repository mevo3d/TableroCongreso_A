const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8094;

// Habilitar CORS para Safari
app.use(cors());

// Servir archivos HLS
app.use('/hls', express.static('C:\\srt-hls', {
  setHeaders: (res, path) => {
    if (path.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (path.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/MP2T');
    }
  }
}));

// Página de prueba
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Stream HLS - Congreso</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #000;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }
        video {
            width: 100%;
            max-width: 1280px;
            height: auto;
        }
        .status {
            position: absolute;
            top: 20px;
            left: 20px;
            color: white;
            background: rgba(255,0,0,0.8);
            padding: 10px;
            border-radius: 5px;
            font-family: Arial;
        }
    </style>
</head>
<body>
    <div class="status">🔴 EN VIVO</div>
    <video id="video" controls autoplay playsinline></video>
    
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script>
        var video = document.getElementById('video');
        var videoSrc = '/hls/playlist.m3u8';
        
        if (Hls.isSupported()) {
            var hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
            });
            hls.loadSource(videoSrc);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                video.play();
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Para Safari iOS
            video.src = videoSrc;
            video.addEventListener('loadedmetadata', function() {
                video.play();
            });
        }
    </script>
</body>
</html>
  `);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║         Servidor HLS para iPad             ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║ Acceder desde iPad:                        ║`);
  console.log(`║ http://192.168.150.71:${PORT}                  ║`);
  console.log('║                                            ║');
  console.log('║ IMPORTANTE: Primero ejecutar               ║');
  console.log('║ srt-to-hls.bat para convertir el stream    ║');
  console.log('╚════════════════════════════════════════════╝');
});