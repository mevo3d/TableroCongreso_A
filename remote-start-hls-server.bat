@echo off
echo ============================================
echo   Servidor HLS para iPad - Puerto 8094
echo ============================================
echo.
echo Iniciando servidor web para streaming HLS...
echo.

cd C:\
"C:\Program Files\nodejs\node.exe" C:\hls-server.js

pause