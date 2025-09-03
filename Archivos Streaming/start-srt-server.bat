@echo off
echo ========================================
echo   Iniciando Servidor SRT-WebRTC
echo ========================================
echo.

cd C:\srt-webrtc

:: Agregar FFmpeg al PATH temporalmente
set PATH=%PATH%;C:\ffmpeg\bin

:: Iniciar servidor
"C:\Program Files\nodejs\node.exe" server.js

pause