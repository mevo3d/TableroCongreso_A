@echo off
echo ========================================
echo Reiniciando servidor del Sistema de Votacion
echo ========================================
echo.

echo Deteniendo procesos Node.js...
taskkill /F /IM node.exe 2>nul
if %errorlevel%==0 (
    echo ✓ Procesos Node.js detenidos
) else (
    echo - No habia procesos Node.js ejecutandose
)

echo.
echo Esperando 2 segundos...
timeout /t 2 /nobreak >nul

echo.
echo Iniciando servidor...
start cmd /k "cd /d %~dp0 && npm start"

echo.
echo ========================================
echo ✓ Servidor reiniciado correctamente
echo ========================================
echo.
echo El servidor se esta ejecutando en una nueva ventana.
echo Puedes cerrar esta ventana.
echo.
pause