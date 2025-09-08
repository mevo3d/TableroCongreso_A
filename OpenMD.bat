@echo off
echo ===================================================
echo     SISTEMA DE VOTACION - MESA DIRECTIVA
echo ===================================================
echo.
echo Abriendo paneles administrativos y Mesa Directiva en Edge...
echo.

REM Configurar la URL base del servidor
set BASE_URL=http://localhost:3333

REM Configurar Microsoft Edge
set EDGE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

REM Verificar si Edge existe
if not exist %EDGE_PATH% (
    set EDGE_PATH="C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

if not exist %EDGE_PATH% (
    echo ERROR: No se encontro Microsoft Edge
    echo Por favor, verifica la ruta de instalacion
    pause
    exit /b 1
)

echo ===================================================
echo     ABRIENDO PANELES ADMINISTRATIVOS
echo ===================================================
echo.

echo [1/6] Abriendo OPERADOR...
start "" %EDGE_PATH% --new-window "%BASE_URL%/autologin/operador"
timeout /t 2 /nobreak >nul

echo [2/6] Abriendo SECRETARIO LEGISLATIVO...
start "" %EDGE_PATH% "%BASE_URL%/autologin/secretario"
timeout /t 2 /nobreak >nul

echo.
echo ===================================================
echo     ABRIENDO MESA DIRECTIVA
echo ===================================================
echo.

echo [3/6] Abriendo PRESIDENTE - Isaac Pimentel Mejia...
start "" %EDGE_PATH% "%BASE_URL%/autologin/isaac.pimentel"
timeout /t 2 /nobreak >nul

echo [4/6] Abriendo VICEPRESIDENTE - Eleonor Martinez Gomez...
start "" %EDGE_PATH% "%BASE_URL%/autologin/eleonor.martinez"
timeout /t 2 /nobreak >nul

echo [5/6] Abriendo SECRETARIO 1 - Guillermina Maya Rendon...
start "" %EDGE_PATH% "%BASE_URL%/autologin/guillermina.maya"
timeout /t 2 /nobreak >nul

echo [6/6] Abriendo SECRETARIO 2 - Alberto Sanchez Ortega...
start "" %EDGE_PATH% "%BASE_URL%/autologin/alberto.sanchez"
timeout /t 2 /nobreak >nul

echo.
echo ===================================================
echo     TODOS LOS PANELES HAN SIDO ABIERTOS
echo ===================================================
echo.
echo Resumen:
echo - 1 Operador
echo - 1 Secretario Legislativo
echo - 4 Mesa Directiva (Presidente, Vicepresidente, 2 Secretarios)
echo.
echo Total: 6 ventanas abiertas en Microsoft Edge
echo.
echo NOTA IMPORTANTE:
echo - Esta funcion de autologin solo funciona desde localhost
echo - Los tokens expiran en 24 horas
echo - Asegurate de que el servidor este corriendo en localhost:3333
echo - NO se usa modo privado para que funcione el autologin
echo.
pause