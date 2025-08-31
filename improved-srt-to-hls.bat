@echo off
echo ============================================
echo   Convertidor SRT a HLS para iPad
echo ============================================
echo.

:: Crear carpeta para archivos HLS si no existe
if not exist "C:\srt-hls" (
    echo Creando carpeta C:\srt-hls...
    mkdir C:\srt-hls
)

:: Verificar si FFmpeg existe
if not exist "C:\ffmpeg\bin\ffmpeg.exe" (
    echo ERROR: FFmpeg no encontrado en C:\ffmpeg\bin\
    echo Por favor instale FFmpeg primero.
    pause
    exit /b 1
)

echo.
echo Iniciando conversion SRT a HLS...
echo Conectando a srt://192.168.150.71:9999
echo.

:retry
C:\ffmpeg\bin\ffmpeg.exe ^
  -reconnect 1 ^
  -reconnect_at_eof 1 ^
  -reconnect_streamed 1 ^
  -reconnect_delay_max 2 ^
  -i srt://192.168.150.71:9999?mode=caller ^
  -c:v libx264 ^
  -preset veryfast ^
  -tune zerolatency ^
  -c:a aac ^
  -f hls ^
  -hls_time 2 ^
  -hls_list_size 5 ^
  -hls_flags delete_segments ^
  -hls_segment_filename C:\srt-hls\segment%%d.ts ^
  C:\srt-hls\playlist.m3u8

echo.
echo ERROR: La conversion se detuvo.
echo Reintentando en 5 segundos...
timeout /t 5 /nobreak
goto retry