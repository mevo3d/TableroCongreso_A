# 📋 GUÍA DE USO - TABLERO CONGRESO

## 🚀 Inicio Rápido

### Opción 1: Desde el directorio raíz (RECOMENDADO)
```bash
# Instalar dependencias (primera vez)
npm run install-all

# Iniciar el servidor del tablero
npm start

# O en modo desarrollo (con auto-recarga)
npm run dev
```

### Opción 2: Desde el subdirectorio
```bash
cd TableroCongreso_A
npm start
```

## 📦 Comandos Disponibles

### Desde la raíz (C:\Users\BALERION\proyectos-automatizacion\TableroAGit)
```bash
# Sistema del Tablero
npm start              # Inicia el servidor del tablero en puerto 3899
npm run dev           # Inicia en modo desarrollo con nodemon
npm run tablero       # Alternativa para iniciar el servidor
npm run streaming     # Inicia el servidor de streaming

# Análisis de PDFs
npm run analizar-orden  # Analiza el PDF del orden del día del Congreso
npm run test-pdf       # Prueba la extracción de PDFs

# Instalación
npm run install-all    # Instala todas las dependencias
npm run install-tablero # Instala solo dependencias del tablero

# Ayuda
npm run help          # Muestra comandos disponibles
```

### Desde TableroCongreso_A
```bash
npm start             # Inicia el servidor
npm run dev          # Modo desarrollo
npm test             # Ejecutar pruebas
npm run test:e2e     # Pruebas end-to-end
```

## 🌐 URLs de Acceso

Una vez iniciado el servidor:
- **Login**: http://localhost:3899
- **Diputado**: http://localhost:3899/diputado
- **Operador**: http://localhost:3899/operador
- **Secretario**: http://localhost:3899/secretario
- **Pantalla**: http://localhost:3899/pantalla
- **Superadmin**: http://localhost:3899/superadmin
- **Servicios Legislativos**: http://localhost:3899/servicios-legislativos

## 🔧 Solución de Problemas

### Error: "Missing script: start"
- Asegúrate de estar en el directorio correcto
- Si estás en la raíz, ejecuta: `npm run install-all` primero
- O navega a TableroCongreso_A: `cd TableroCongreso_A`

### Error: "Cannot find module"
```bash
npm run install-all
```

### Puerto 3899 ocupado
```bash
# Windows
netstat -ano | findstr :3899
taskkill /PID [numero_pid] /F
```

## 📁 Estructura del Proyecto
```
TableroAGit/
├── package.json (raíz - scripts de workspace)
├── analizarOrdenDelDia.js (análisis de PDFs del Congreso)
├── test-pdf-orden.js (pruebas de extracción)
└── TableroCongreso_A/
    ├── package.json (proyecto principal)
    ├── server.js (servidor Express)
    ├── public/ (archivos estáticos)
    ├── src/ (código fuente)
    └── tests/ (pruebas)
```

## 🔑 Credenciales por Defecto

### Superadmin
- Usuario: `admin`
- Contraseña: `admin123`

### Secretario
- Usuario: `secretario`
- Contraseña: `secretario123`

### Diputados
- Se crean automáticamente al primer acceso
- Token de ejemplo: `DIP001`, `DIP002`, etc.

## 📱 Análisis de Documentos PDF

Para analizar el orden del día del Congreso:
```bash
# Desde la raíz
npm run analizar-orden

# O directamente
node analizarOrdenDelDia.js
```

El sistema:
1. Busca el PDF más reciente del orden del día en Downloads
2. Extrae todas las iniciativas y dictámenes
3. Genera un resumen con IA
4. Envía el resultado por Telegram

## 💡 Tips

- Usa `npm run dev` para desarrollo (auto-recarga al guardar cambios)
- Los logs se muestran en la consola
- La base de datos SQLite está en `src/db/votacion.db`
- Los PDFs subidos se guardan en `public/uploads/`