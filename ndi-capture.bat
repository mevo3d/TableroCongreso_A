@echo off
echo ============================================
echo   Iniciando NDI Capture para Web
echo ============================================
echo.

:: Activar NDI en vMix primero
echo IMPORTANTE: En vMix active:
echo Settings -^> Outputs -^> NDI Output -^> ON
echo.
pause

:: Iniciar NDI Screen Capture (viene con NDI Tools)
start "" "C:\Program Files\NDI\NDI 5 Tools\Bin\NDI Screen Capture.exe"

echo.
echo NDI Screen Capture iniciado.
echo Ahora puede ver el stream en el navegador.
echo.

:: Iniciar el servidor web
cd C:\ndi-server
"C:\Program Files\nodejs\node.exe" server.js

pause