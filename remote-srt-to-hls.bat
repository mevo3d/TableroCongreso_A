@echo off
echo ============================================
echo   Convertidor SRT a HLS para iPad
echo ============================================
echo.

:: Crear carpeta para archivos HLS
if not exist "C:\srt-hls" mkdir C:\srt-hls

:: Iniciar conversión con FFmpeg
echo Iniciando conversion SRT a HLS...
C:\ffmpeg\bin\ffmpeg.exe ^
  -i srt://localhost:9999?mode=caller ^
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

pause