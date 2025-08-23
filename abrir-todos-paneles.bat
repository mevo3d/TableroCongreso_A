@echo off
echo ===================================================
echo     SISTEMA DE VOTACION - APERTURA DE PANELES
echo ===================================================
echo.
echo Iniciando apertura automatica de todos los paneles...
echo.

REM Configurar la URL base del servidor
set BASE_URL=http://localhost:3333

REM Configurar Chrome
set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"

REM Verificar si Chrome existe
if not exist %CHROME_PATH% (
    set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

if not exist %CHROME_PATH% (
    echo ERROR: No se encontro Google Chrome
    echo Por favor, verifica la ruta de instalacion
    pause
    exit /b 1
)

echo ===================================================
echo     ABRIENDO PANELES ADMINISTRATIVOS
echo ===================================================
echo.

echo [1/24] Abriendo SUPERADMIN...
start "" %CHROME_PATH% --incognito --new-window "%BASE_URL%/autologin/admin"
timeout /t 2 /nobreak >nul

echo [2/24] Abriendo SERVICIOS LEGISLATIVOS...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/servicios"
timeout /t 2 /nobreak >nul

echo [3/24] Abriendo OPERADOR...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/operador"
timeout /t 2 /nobreak >nul

echo [4/24] Abriendo SECRETARIO...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/secretario"
timeout /t 2 /nobreak >nul

echo.
echo ===================================================
echo     ABRIENDO PANELES DE DIPUTADOS (Orden solicitado)
echo ===================================================
echo.

REM Primeros 4 diputados en orden específico
echo [5/24] Isaac Pimentel Mejia (MORENA)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/isaac.pimentel"
timeout /t 1 /nobreak >nul

echo [6/24] Eleonor Martinez Gomez (PRI)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/eleonor.martinez"
timeout /t 1 /nobreak >nul

echo [7/24] Alberto Sanchez Ortega (PT)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/alberto.sanchez"
timeout /t 1 /nobreak >nul

echo [8/24] Guillermina Maya Rendon (MORENA)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/guillermina.maya"
timeout /t 1 /nobreak >nul

REM Resto de diputados en orden alfabético
echo.
echo Abriendo resto de diputados...
echo.

echo [9/24] Gerardo Abarca Pena (PAN)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/gerardo.abarca"
timeout /t 1 /nobreak >nul

echo [10/24] Alfredo Dominguez Mandujano (MORENA)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/alfredo.dominguez"
timeout /t 1 /nobreak >nul

echo [11/24] Brenda Espinoza Lopez (MORENA)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/brenda.espinoza"
timeout /t 1 /nobreak >nul

echo [12/24] Andrea Valentina Gordillo Vega (PAN)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/andrea.gordillo"
timeout /t 1 /nobreak >nul

echo [13/24] Sergio Omar Livera Chavarria (MORENA)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/sergio.livera"
timeout /t 1 /nobreak >nul

echo [14/24] Daniel Martinez Terrazas (PAN)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/daniel.martinez"
timeout /t 1 /nobreak >nul

echo [15/24] Melissa Montes de Oca Montoya (MORENA)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/melissa.montes"
timeout /t 1 /nobreak >nul

echo [16/24] Luis Eduardo Pedrero Gonzalez (PVEM)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/luis.pedrero"
timeout /t 1 /nobreak >nul

echo [17/24] Luz Dary Quevedo Maldonado (MC)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/luz.quevedo"
timeout /t 1 /nobreak >nul

echo [18/24] Rafael Reyes Reyes (MORENA)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/rafael.reyes"
timeout /t 1 /nobreak >nul

echo [19/24] Ruth Cleotilde Rodriguez Lopez (NUEVA ALIANZA)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/ruth.rodriguez"
timeout /t 1 /nobreak >nul

echo [20/24] Tania Valentina Rodriguez Ruiz (PT)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/tania.rodriguez"
timeout /t 1 /nobreak >nul

echo [21/24] Nayla Carolina Ruiz Rodriguez (MORENA)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/nayla.ruiz"
timeout /t 1 /nobreak >nul

echo [22/24] Francisco Erik Sanchez Zavala (PAN)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/erik.sanchez"
timeout /t 1 /nobreak >nul

echo [23/24] Jazmin Juana Solano Lopez (MORENA)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/jazmin.solano"
timeout /t 1 /nobreak >nul

echo [24/24] Alfonso de Jesus Sotelo Martinez (MORENA)...
start "" %CHROME_PATH% --incognito "%BASE_URL%/autologin/alfonso.sotelo"
timeout /t 1 /nobreak >nul

echo.
echo ===================================================
echo     TODOS LOS PANELES HAN SIDO ABIERTOS
echo ===================================================
echo.
echo Resumen:
echo - 1 Superadmin
echo - 1 Servicios Legislativos
echo - 1 Operador
echo - 1 Secretario
echo - 20 Diputados
echo.
echo Total: 24 ventanas abiertas en modo incognito
echo.
echo NOTA IMPORTANTE:
echo - Esta funcion de autologin solo funciona desde localhost
echo - Los tokens expiran en 24 horas
echo - Asegurate de que el servidor este corriendo en localhost:3333
echo.
pause