@echo off
echo ============================================
echo   INICIAR TODO EL SISTEMA DE STREAMING
echo ============================================
echo.
echo Este script inicia tanto el convertidor SRT-HLS
echo como el servidor web en ventanas separadas
echo.

:: Iniciar convertidor SRT a HLS en nueva ventana
start "Convertidor SRT-HLS" cmd /k "C:\hls-streaming\srt-to-hls.bat"

:: Esperar 3 segundos para que inicie el convertidor
timeout /t 3 /nobreak > nul

:: Iniciar servidor HLS en nueva ventana
start "Servidor HLS" cmd /k "C:\hls-streaming\start-hls-server.bat"

echo.
echo ============================================
echo   SISTEMA DE STREAMING INICIADO
echo ============================================
echo.
echo Convertidor SRT-HLS: Ejecutandose
echo Servidor HLS: Puerto 8094
echo.
echo Acceso desde iPad: http://192.168.150.71:8094
echo.
echo Los diputados pueden presionar EN VIVO en sus iPads
echo.
pause