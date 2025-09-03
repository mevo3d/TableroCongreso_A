@echo off
echo ============================================
echo   Servidor HLS para iPad - Puerto 8094
echo ============================================
echo.
echo Iniciando servidor web para streaming HLS...
echo.

cd C:\hls-streaming
"C:\Program Files\nodejs\node.exe" hls-server.js

pause