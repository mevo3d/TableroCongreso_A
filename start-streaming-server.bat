@echo off
echo ============================================
echo   Iniciando Servidor de Streaming SRT
echo ============================================
echo.

cd /d C:\Users\Vaghar\votacion\ndi-simple-server

echo Instalando dependencias...
call npm install

echo.
echo Iniciando servidor...
node server.js

pause