# Configuraciones de Streaming para Sistema de Votación

## 🚀 CONFIGURACIÓN ACTUAL (LiveLAN - Más rápida)

### Ubicación
- **Archivo:** `src/views/streaming-live.html`
- **URL de streaming:** `http://192.168.150.71:8088/livelan`
- **Protocolo:** LiveLAN de vMix (transmisión directa)

### Ventajas
- ✅ Latencia muy baja (casi tiempo real)
- ✅ Configuración simple
- ✅ No requiere conversión
- ✅ Funciona directamente desde vMix

### Configuración en vMix
1. Settings → Web Controller
2. Habilitar en puerto 8088
3. El LiveLAN se activa automáticamente

### Uso
Los diputados presionan "EN VIVO" y se abre automáticamente el streaming LiveLAN.

---

## 💾 CONFIGURACIÓN ALTERNATIVA (HLS - Para futuro uso)

### Ubicación del servidor
- **Servidor:** 192.168.150.71
- **Carpeta:** `C:\hls-streaming\`
- **Puerto:** 8094

### Archivos instalados
```
C:\hls-streaming\
├── srt-to-hls.bat          # Convierte SRT a HLS
├── start-hls-server.bat    # Inicia servidor web
├── start-all-streaming.bat # Inicia todo el sistema
├── hls-server.js           # Servidor Node.js
└── package.json            # Dependencias
```

### Para activar HLS en lugar de LiveLAN

1. **En streaming-live.html cambiar:**
```html
<!-- De LiveLAN -->
<iframe src="http://192.168.150.71:8088/livelan">

<!-- A HLS -->
<video id="streamingVideo" autoplay muted playsinline controls></video>
```

2. **En el script cambiar a:**
```javascript
const HLS_URL = 'http://192.168.150.71:8094/hls/playlist.m3u8';
// (Usar el código HLS que está comentado en este documento)
```

3. **En el servidor 192.168.150.71:**
   - Ejecutar: `C:\hls-streaming\start-all-streaming.bat`

### Ventajas de HLS
- ✅ Compatible con todos los navegadores
- ✅ Funciona nativamente en Safari/iOS
- ✅ Adaptable a diferentes calidades
- ✅ Más robusto para conexiones lentas

### Desventajas
- ❌ Mayor latencia (5-10 segundos)
- ❌ Requiere conversión con FFmpeg
- ❌ Más complejo de configurar

---

## 📱 Compatibilidad iPad/iOS

### LiveLAN (Actual)
- Funciona en Safari mediante iframe
- Puede requerir interacción del usuario para iniciar

### HLS (Alternativa)
- Soporte nativo en Safari
- Mejor para PWA
- Autoplay más confiable

---

## 🔧 Solución de problemas

### Si LiveLAN no funciona:
1. Verificar que vMix esté transmitiendo
2. Verificar puerto 8088 abierto
3. Verificar IP 192.168.150.71

### Si HLS no funciona:
1. Verificar que SRT esté transmitiendo (puerto 9999)
2. Ejecutar `start-all-streaming.bat` en servidor
3. Verificar puerto 8094 abierto

---

## 📝 Notas

- **LiveLAN** es la opción preferida por su baja latencia
- **HLS** está configurado y listo como respaldo
- Ambas soluciones están probadas y funcionando
- El servidor 192.168.150.71 tiene todo instalado para ambas opciones