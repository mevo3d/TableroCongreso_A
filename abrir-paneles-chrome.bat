@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ╔══════════════════════════════════════════════════════════════╗
echo ║      SISTEMA DE VOTACION - SELECTOR DE PANELES              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

REM Configurar la URL base del servidor
set BASE_URL=http://localhost:3333

REM Configurar Chrome (usar la ruta completa)
set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"

REM Verificar si Chrome existe
if not exist %CHROME_PATH% (
    set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

if not exist %CHROME_PATH% (
    echo ❌ ERROR: No se encontró Google Chrome
    echo Por favor, verifica la ruta de instalación
    pause
    exit /b 1
)

:MENU
cls
echo ╔══════════════════════════════════════════════════════════════╗
echo ║      SISTEMA DE VOTACION - SELECTOR DE PANELES              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
echo ┌────────────────────────────────────────────────────────────┐
echo │ Selecciona qué paneles deseas abrir:                      │
echo │                                                            │
echo │ [1] 🔧 Solo Paneles Administrativos (4 paneles)           │
echo │     • Operador                                             │
echo │     • Secretario                                           │
echo │     • Superadmin                                           │
echo │     • Servicios Legislativos                               │
echo │                                                            │
echo │ [2] 👥 Solo Mesa Directiva (4 diputados)                  │
echo │     • Presidente - Isaac Pimentel                         │
echo │     • Vicepresidente - Eleonor Martinez                   │
echo │     • Secretarios - Alberto Sanchez y Guillermina Maya    │
echo │                                                            │
echo │ [3] 🏛️ Mesa Directiva + Paneles Admin (8 paneles)         │
echo │                                                            │
echo │ [4] 📊 Todos los Paneles (24 ventanas)                    │
echo │     • 4 Administrativos + 20 Diputados                     │
echo │                                                            │
echo │ [5] ❌ Salir                                               │
echo └────────────────────────────────────────────────────────────┘
echo.
set /p OPCION="➤ Ingresa tu opción (1-5): "

if "%OPCION%"=="1" goto ADMIN_ONLY
if "%OPCION%"=="2" goto MESA_ONLY
if "%OPCION%"=="3" goto MESA_ADMIN
if "%OPCION%"=="4" goto ALL_PANELS
if "%OPCION%"=="5" goto EXIT

echo.
echo ⚠️ Opción inválida. Por favor selecciona 1, 2, 3, 4 o 5
timeout /t 2 >nul
goto MENU

:ADMIN_ONLY
cls
echo ╔══════════════════════════════════════════════════════════════╗
echo ║         ABRIENDO PANELES ADMINISTRATIVOS                    ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

echo 🔧 Abriendo ventana con pestañas administrativas...
echo.

REM Primera ventana (nueva) en modo incógnito
echo [1/4] Abriendo OPERADOR...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/operador
timeout /t 3 /nobreak >nul

REM Las siguientes como pestañas en la misma ventana incógnito
echo [2/4] Agregando SECRETARIO como pestaña...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/secretario
timeout /t 2 /nobreak >nul

echo [3/4] Agregando SUPERADMIN como pestaña...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/superadmin
timeout /t 2 /nobreak >nul

echo [4/4] Agregando SERVICIOS LEGISLATIVOS como pestaña...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/servicios
timeout /t 2 /nobreak >nul

echo.
echo ✅ 4 paneles administrativos abiertos en pestañas
goto END_SUCCESS

:MESA_ONLY
cls
echo ╔══════════════════════════════════════════════════════════════╗
echo ║            ABRIENDO MESA DIRECTIVA                          ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

echo 👥 Abriendo ventana con Mesa Directiva...
echo.

REM Primera ventana para Mesa Directiva en modo incógnito
echo [1/4] Abriendo PRESIDENTE - Isaac Pimentel Mejia...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/isaac.pimentel
timeout /t 3 /nobreak >nul

echo [2/4] Agregando VICEPRESIDENTE - Eleonor Martinez Gomez...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/eleonor.martinez
timeout /t 2 /nobreak >nul

echo [3/4] Agregando SECRETARIO 1 - Alberto Sanchez Ortega...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/alberto.sanchez
timeout /t 2 /nobreak >nul

echo [4/4] Agregando SECRETARIA 2 - Guillermina Maya Rendon...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/guillermina.maya
timeout /t 2 /nobreak >nul

echo.
echo ✅ Mesa Directiva completa abierta en pestañas
goto END_SUCCESS

:MESA_ADMIN
cls
echo ╔══════════════════════════════════════════════════════════════╗
echo ║     ABRIENDO MESA DIRECTIVA Y PANELES ADMINISTRATIVOS       ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

echo 🏛️ Abriendo ventana con todos los paneles de control...
echo.

REM Primera ventana - Administrativos en modo incógnito
echo === PANELES ADMINISTRATIVOS ===
echo [1/8] Abriendo OPERADOR...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/operador
timeout /t 3 /nobreak >nul

echo [2/8] Agregando SECRETARIO LEGISLATIVO...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/secretario
timeout /t 2 /nobreak >nul

echo [3/8] Agregando SUPERADMIN...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/superadmin
timeout /t 2 /nobreak >nul

echo [4/8] Agregando SERVICIOS LEGISLATIVOS...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/servicios
timeout /t 2 /nobreak >nul

echo.
echo === MESA DIRECTIVA ===
echo [5/8] Agregando PRESIDENTE - Isaac Pimentel...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/isaac.pimentel
timeout /t 2 /nobreak >nul

echo [6/8] Agregando VICEPRESIDENTE - Eleonor Martinez...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/eleonor.martinez
timeout /t 2 /nobreak >nul

echo [7/8] Agregando SECRETARIO MD - Alberto Sanchez...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/alberto.sanchez
timeout /t 2 /nobreak >nul

echo [8/8] Agregando SECRETARIA MD - Guillermina Maya...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/guillermina.maya
timeout /t 2 /nobreak >nul

echo.
echo ✅ 8 paneles abiertos (4 Admin + 4 Mesa Directiva)
goto END_SUCCESS

:ALL_PANELS
cls
echo ╔══════════════════════════════════════════════════════════════╗
echo ║              ABRIENDO TODOS LOS PANELES                     ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

echo 📊 Abriendo TODOS los paneles en una sola ventana...
echo.

echo === PANELES ADMINISTRATIVOS ===
echo [1/24] Abriendo OPERADOR (nueva ventana incógnito)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/operador
timeout /t 3 /nobreak >nul

echo [2/24] SECRETARIO...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/secretario
timeout /t 1 /nobreak >nul

echo [3/24] SUPERADMIN...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/superadmin
timeout /t 1 /nobreak >nul

echo [4/24] SERVICIOS LEGISLATIVOS...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/servicios
timeout /t 1 /nobreak >nul

echo.
echo === DIPUTADOS ===
echo [5/24] Isaac Pimentel Mejia (MORENA - Presidente)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/isaac.pimentel
timeout /t 1 /nobreak >nul

echo [6/24] Eleonor Martinez Gomez (PRI - Vicepresidente)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/eleonor.martinez
timeout /t 1 /nobreak >nul

echo [7/24] Alberto Sanchez Ortega (PT - Secretario MD)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/alberto.sanchez
timeout /t 1 /nobreak >nul

echo [8/24] Guillermina Maya Rendon (MORENA)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/guillermina.maya
timeout /t 1 /nobreak >nul

echo [9/24] Gerardo Abarca Pena (PAN)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/gerardo.abarca
timeout /t 1 /nobreak >nul

echo [10/24] Alfredo Dominguez Mandujano (MORENA)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/alfredo.dominguez
timeout /t 1 /nobreak >nul

echo [11/24] Brenda Espinoza Lopez (MORENA)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/brenda.espinoza
timeout /t 1 /nobreak >nul

echo [12/24] Andrea Valentina Gordillo Vega (PAN)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/andrea.gordillo
timeout /t 1 /nobreak >nul

echo [13/24] Sergio Omar Livera Chavarria (MORENA)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/sergio.livera
timeout /t 1 /nobreak >nul

echo [14/24] Daniel Martinez Terrazas (PAN)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/daniel.martinez
timeout /t 1 /nobreak >nul

echo [15/24] Melissa Montes de Oca Montoya (MORENA)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/melissa.montes
timeout /t 1 /nobreak >nul

echo [16/24] Luis Eduardo Pedrero Gonzalez (PVEM)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/luis.pedrero
timeout /t 1 /nobreak >nul

echo [17/24] Luz Dary Quevedo Maldonado (MC)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/luz.quevedo
timeout /t 1 /nobreak >nul

echo [18/24] Rafael Reyes Reyes (MORENA)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/rafael.reyes
timeout /t 1 /nobreak >nul

echo [19/24] Ruth Cleotilde Rodriguez Lopez (NUEVA ALIANZA)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/ruth.rodriguez
timeout /t 1 /nobreak >nul

echo [20/24] Tania Valentina Rodriguez Ruiz (PT)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/tania.rodriguez
timeout /t 1 /nobreak >nul

echo [21/24] Nayla Carolina Ruiz Rodriguez (MORENA)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/nayla.ruiz
timeout /t 1 /nobreak >nul

echo [22/24] Francisco Erik Sanchez Zavala (PAN)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/erik.sanchez
timeout /t 1 /nobreak >nul

echo [23/24] Jazmin Juana Solano Lopez (MORENA)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/jazmin.solano
timeout /t 1 /nobreak >nul

echo [24/24] Alfonso de Jesus Sotelo Martinez (MORENA)...
start "" %CHROME_PATH% --incognito %BASE_URL%/autologin/alfonso.sotelo

echo.
echo ✅ TODOS los 24 paneles abiertos en pestañas

:END_SUCCESS
echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                    PROCESO COMPLETADO                       ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
echo 📌 NOTAS IMPORTANTES:
echo • Los paneles se abren en modo incógnito/privado
echo • Esto evita conflictos con sesiones existentes
echo • El autologin solo funciona desde localhost
echo • Los tokens expiran en 24 horas
echo • El servidor debe estar corriendo en localhost:3333
echo.
timeout /t 5 >nul
goto EXIT

:EXIT
echo.
echo Cerrando selector de paneles...
timeout /t 2 >nul
exit /b 0