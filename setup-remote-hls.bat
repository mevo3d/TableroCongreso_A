@echo off
echo ============================================
echo   Script para copiar a 192.168.150.71
echo ============================================
echo.
echo Copie y ejecute estos comandos en la máquina remota:
echo.
echo 1. Crear archivo: C:\srt-to-hls.bat
echo ----------------------------------------
echo.
echo @echo off
echo echo Convirtiendo SRT a HLS...
echo if not exist C:\srt-hls mkdir C:\srt-hls
echo C:\ffmpeg\bin\ffmpeg.exe -i srt://localhost:9999?mode=caller -c:v libx264 -preset veryfast -tune zerolatency -c:a aac -f hls -hls_time 2 -hls_list_size 5 -hls_flags delete_segments -hls_segment_filename C:\srt-hls\segment%%d.ts C:\srt-hls\playlist.m3u8
echo.
echo ----------------------------------------
echo.
echo 2. Crear archivo: C:\hls-server.js
echo ----------------------------------------
pause