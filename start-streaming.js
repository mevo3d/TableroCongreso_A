// Script para iniciar el servidor de streaming WebRTC
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Iniciando servidor de streaming...\n');

// Iniciar el servidor de streaming
const streamingServer = spawn('node', [path.join(__dirname, 'src/streaming/webrtc-server.js')], {
    stdio: 'inherit',
    shell: true
});

streamingServer.on('error', (error) => {
    console.error('❌ Error iniciando servidor de streaming:', error);
    process.exit(1);
});

streamingServer.on('exit', (code) => {
    if (code !== 0) {
        console.error(`❌ Servidor de streaming terminó con código ${code}`);
        process.exit(code);
    }
});

// Manejar cierre graceful
process.on('SIGINT', () => {
    console.log('\n⏹️ Deteniendo servidor de streaming...');
    streamingServer.kill('SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    streamingServer.kill('SIGTERM');
    process.exit(0);
});