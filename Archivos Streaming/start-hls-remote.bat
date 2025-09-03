@echo off
echo ============================================
echo   Iniciar HLS en Servidor 192.168.150.71
echo ============================================
echo.
echo Este script inicia el servidor HLS remotamente
echo.

echo Iniciando servidor HLS...
ssh stream@192.168.150.71 "start /B \"C:\Program Files\nodejs\node.exe\" C:\hls-server.js"

echo.
echo Servidor HLS iniciado en puerto 8094
echo Acceder desde iPad: http://192.168.150.71:8094
echo.
echo IMPORTANTE: También debe ejecutar C:\srt-to-hls.bat en el servidor
echo.
pause