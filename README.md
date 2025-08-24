# 🏛️ Sistema de Votación Legislativa - Congreso Digital

## 📋 Descripción

Sistema integral de gestión y votación legislativa diseñado para modernizar y digitalizar los procesos parlamentarios. Permite la gestión completa de sesiones legislativas, votaciones en tiempo real, control de asistencia y transmisión en vivo de las sesiones del pleno.

## ✨ Características Principales

### 🎯 Gestión de Sesiones
- **Carga de Orden del Día**: Importación de documentos PDF/Word con extracción automática de iniciativas
- **Sesiones Programadas**: Planificación de sesiones futuras con fecha y hora específica
- **Sesiones Extraordinarias**: Inserción de iniciativas urgentes sin interrumpir la sesión activa
- **Control de Sesión**: Inicio, pausa, reanudación y clausura de sesiones legislativas

### 🗳️ Sistema de Votación
- **Votación en Tiempo Real**: Los diputados votan desde sus dispositivos móviles o computadoras
- **Tipos de Mayoría**: Simple, absoluta, calificada (2/3) y unanimidad
- **Resultados Instantáneos**: Conteo automático y visualización de resultados
- **Historial de Votaciones**: Registro completo de todas las votaciones realizadas

### 👥 Gestión de Usuarios
- **Roles Diferenciados**:
  - **Superadmin**: Control total del sistema
  - **Diputados**: Votación y visualización de iniciativas
  - **Secretario**: Control de asistencia y gestión de sesión
  - **Operador**: Carga de documentos y gestión técnica
  - **Servicios Legislativos**: Preparación y validación de documentos

### 📱 Interfaz Moderna
- **Diseño Responsivo**: Funciona en computadoras, tablets y móviles
- **Tema Apple Style**: Interfaz moderna con glassmorphism y efectos visuales
- **Modo Oscuro**: Soporte completo para tema claro y oscuro
- **PWA**: Instalable como aplicación en dispositivos móviles

### 📺 Pantallas Públicas
- **Pantalla de Votación**: Muestra resultados en tiempo real para el público
- **Pantalla de Asistencia**: Visualización del pase de lista y quórum
- **Transmisión en Vivo**: Streaming de video de la sesión

### 📊 Funcionalidades Especiales
- **Control de Asistencia**: Pase de lista digital con registro automático
- **Cargos en Mesa Directiva**: Reconocimiento de Presidente, Vicepresidente y Secretarios
- **Partidos Políticos**: Gestión y visualización de afiliaciones partidarias
- **Notificaciones**: Sistema de alertas y recordatorios para diputados

## 🚀 Instalación

### Requisitos Previos
- Node.js (v14 o superior)
- npm o yarn
- SQLite3

### Pasos de Instalación

1. **Clonar el repositorio**
```bash
git clone https://github.com/mevo3d/TableroCongreso_A.git
cd TableroAGit
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
Crear archivo `.env` en la raíz del proyecto:
```env
PORT=3333
JWT_SECRET=tu_clave_secreta_aqui
NODE_ENV=production
```

4. **Inicializar la base de datos**
```bash
npm run init-db
```

5. **Iniciar el servidor**
```bash
npm start
```

El sistema estará disponible en `http://localhost:3333`

## 📖 Uso del Sistema

### Acceso Inicial
- **Usuario Superadmin**: admin / admin123
- **Diputados**: usuario.apellido (ejemplo: juan.perez)
- **Otros roles**: Credenciales proporcionadas por el administrador

### Flujo de Trabajo Típico

1. **Servicios Legislativos**: Prepara y carga el orden del día (PDF/Word)
2. **Operador**: Valida y activa la sesión
3. **Presidente**: Inicia la sesión legislativa
4. **Secretario**: Realiza el pase de lista
5. **Sistema**: Verifica quórum y habilita votaciones
6. **Presidente**: Abre votación para cada iniciativa
7. **Diputados**: Emiten su voto (a favor, en contra, abstención)
8. **Sistema**: Calcula y muestra resultados
9. **Presidente**: Clausura la sesión al finalizar

## 🛠️ Tecnologías Utilizadas

### Backend
- **Node.js**: Servidor y lógica de negocio
- **Express.js**: Framework web
- **Socket.io**: Comunicación en tiempo real
- **SQLite**: Base de datos
- **JWT**: Autenticación y autorización
- **Multer**: Manejo de archivos
- **PDF-Parse**: Extracción de texto de PDFs

### Frontend
- **HTML5/CSS3**: Estructura y estilos
- **JavaScript Vanilla**: Lógica del cliente
- **Bootstrap 5**: Framework CSS
- **Font Awesome**: Iconos
- **WebRTC**: Transmisión de video (experimental)

## 📱 Pantallas del Sistema

### Panel de Diputado
- Visualización de iniciativas activas
- Emisión de votos
- Configuración de perfil personal
- Historial de votaciones

### Panel de Secretario
- Control de asistencia (pase de lista)
- Gestión de diputados presentes
- Agregar iniciativas extraordinarias
- Estadísticas de sesión

### Panel de Operador
- Carga de orden del día (PDF/Word)
- Validación de iniciativas
- Gestión de sesiones programadas
- Control técnico del sistema

### Panel de Presidente
- Control total de la sesión
- Apertura/cierre de votaciones
- Pausa/reanudación de sesión
- Vista de resultados en tiempo real

### Pantallas Públicas
- `/pantalla`: Tablero de votación en vivo
- `/pantalla-asistencia`: Estado de asistencia
- `/pase-lista`: Control de asistencia (para secretario)

## 🔒 Seguridad

- Autenticación JWT con tokens seguros
- Autorización basada en roles
- Encriptación de contraseñas con bcrypt
- Validación de entrada de datos
- Protección contra inyección SQL
- Sesiones con expiración automática

## 📊 Base de Datos

### Tablas Principales
- `usuarios`: Información de usuarios y diputados
- `sesiones`: Registro de sesiones legislativas
- `iniciativas`: Iniciativas y propuestas
- `votaciones`: Registro de votos emitidos
- `asistencia`: Control de asistencia
- `configuracion`: Parámetros del sistema

## 🎨 Personalización

### Logos y Branding
- Subir logos desde panel de Superadmin
- Personalizar nombre del congreso
- Configurar colores de partidos políticos

### Temas Visuales
- Modo claro/oscuro automático
- Tema Apple con glassmorphism
- Personalización de colores por partido

## 🐛 Solución de Problemas

### El servidor no inicia
- Verificar que el puerto 3333 esté disponible
- Revisar que todas las dependencias estén instaladas
- Comprobar permisos de escritura en la carpeta

### No se pueden cargar PDFs
- Verificar tamaño máximo de archivo (50MB)
- Asegurar que el PDF no esté protegido
- Revisar formato del documento

### Problemas de conexión en tiempo real
- Verificar configuración de firewall
- Asegurar que WebSocket esté habilitado
- Revisar configuración de proxy reverso

## 👥 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto es privado y propietario. Todos los derechos reservados.

## 📞 Soporte

Para soporte técnico o consultas sobre el sistema, contactar a:
- Email: soporte@congreso.gob
- Teléfono: +52 XXX XXX XXXX

## 🔄 Actualizaciones Recientes

### Versión 2.0 (Diciembre 2024)
- ✅ Implementación de tema Apple con modo oscuro
- ✅ Sistema completo de iniciativas extraordinarias
- ✅ Mejoras en ordenamiento de diputados
- ✅ Restricciones de configuración por rol
- ✅ Optimización de pantallas públicas
- ✅ Corrección de logos de partidos políticos

### Versión 1.5 (Noviembre 2024)
- ✅ Sistema de pase de lista digital
- ✅ Control de quórum automático
- ✅ Gestión de sesiones programadas

### Versión 1.0 (Octubre 2024)
- ✅ Lanzamiento inicial
- ✅ Sistema básico de votación
- ✅ Gestión de usuarios

---

**Desarrollado con ❤️ para la modernización legislativa**