@echo off
echo ============================================
echo   INICIAR TODO EL SISTEMA DE STREAMING
echo ============================================
echo.

:: Verificar que los archivos existen
if not exist "C:\hls-streaming\srt-to-hls.bat" (
    echo ERROR: No se encuentra srt-to-hls.bat
    pause
    exit /b 1
)

if not exist "C:\hls-streaming\start-hls-server.bat" (
    echo ERROR: No se encuentra start-hls-server.bat
    pause
    exit /b 1
)

echo Iniciando sistema de streaming...
echo.

:: Cambiar al directorio correcto
cd /d C:\hls-streaming

:: Iniciar convertidor SRT a HLS en nueva ventana
echo Iniciando Convertidor SRT-HLS...
start "Convertidor SRT-HLS" cmd /c "srt-to-hls.bat"

:: Esperar 3 segundos para que inicie el convertidor
echo Esperando 3 segundos...
timeout /t 3 /nobreak > nul

:: Iniciar servidor HLS en nueva ventana
echo Iniciando Servidor HLS...
start "Servidor HLS" cmd /c "start-hls-server.bat"

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
echo Para detener, cierre las ventanas abiertas.
echo.
pause