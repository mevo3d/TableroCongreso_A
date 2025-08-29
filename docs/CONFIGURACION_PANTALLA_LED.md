# Configuración de Pantalla LED - Sistema de Votación

## Especificaciones Técnicas de la Pantalla LED

### Resolución
- **Resolución exacta:** 1180px x 745px
- **Tipo:** Pantalla LED para Congreso
- **Orientación:** Horizontal

## Configuración CSS - Ubicaciones en el Código

### 1. Ancho de Columnas de Votación
**Archivo:** `src/views/pantalla.html`
**Líneas:** 236-239

```css
.voting-column {
    width: 510px;        /* Ancho optimizado para pantalla LED */
    min-width: 510px;
    max-width: 510px;
}
```

### 2. Separación entre Columnas
**Archivo:** `src/views/pantalla.html`
**Líneas:** 141-142

```css
.voting-table-container-full {
    gap: 50px;                      /* Espacio entre columnas */
    justify-content: space-between; /* Distribuir a los extremos */
}
```

### 3. Altura de Filas de Diputados
**Archivo:** `src/views/pantalla.html`
**Líneas:** 257-259

```css
.voting-table tr {
    min-height: 48px;  /* Altura mínima de cada fila */
    height: auto;      /* Ajuste automático para 2 líneas */
}
```

### 4. Padding de Celdas
**Archivo:** `src/views/pantalla.html`
**Línea:** 271

```css
.voting-table td {
    padding: 4px 4px;  /* Padding reducido para optimizar espacio */
}
```

### 5. Ancho del Nombre del Diputado
**Archivo:** `src/views/pantalla.html`
**Líneas:** 339-341

```css
.deputy-name {
    min-width: 350px;   /* Ancho mínimo para nombres largos */
    width: 350px;       /* Ancho fijo */
    max-width: 400px;   /* Ancho máximo permitido */
    -webkit-line-clamp: 2;  /* Máximo 2 líneas de texto */
}
```

## Valores Optimizados para Pantalla LED 1180x745

### Distribución de Espacio Horizontal
- **Ancho total disponible:** 1180px
- **2 columnas de votación:** 510px cada una = 1020px
- **Separación entre columnas:** 50px
- **Padding lateral:** 40px x 2 = 80px
- **Total usado:** 1020px + 50px + 80px = 1150px
- **Margen de seguridad:** 30px

### Distribución de Espacio Vertical
- **Altura total disponible:** 745px
- **Información de iniciativa:** 160px (máximo)
- **Barra de resultados inferior:** 80px
- **Área de votación disponible:** 505px
- **10 filas por columna:** ~48px cada una

### Configuración de Elementos Visuales

#### Círculos de Votación
- **Tamaño:** 35px x 35px
- **Separación:** 5px entre círculos

#### Logos de Partidos
- **Tamaño del contenedor:** 45px ancho
- **Tamaño del ícono:** 35px x 35px

#### Barra de Resultados
- **Altura fija:** 80px
- **Círculos de resultado:** 35px x 35px
- **Tamaño de fuente:** 1.1em para etiquetas, 1.3em para números

## Parámetros URL para Visualización

Para optimizar la visualización en la pantalla LED, usar:

```
http://[servidor]/pantalla?width=1180&height=745
```

### Parámetros Adicionales Disponibles:
- `?standalone=true` - Modo standalone para sistemas de captura
- `?header=false` - Ocultar encabezado
- `?sidebar=false` - Ocultar panel lateral
- `?transparent=true` - Fondo transparente
- `?chromakey=true` - Modo chromakey (fondo verde)
- `?minimal=true` - Modo minimalista
- `?fontscale=[porcentaje]` - Escalar fuentes

## Notas de Implementación

### Consideraciones Importantes:
1. **NO modificar** estos valores sin probar en la pantalla LED real
2. Los valores están optimizados para mostrar 20 diputados (10 por columna)
3. El texto de nombres largos se ajusta automáticamente a 2 líneas
4. La separación de 50px entre columnas es crítica para la legibilidad

### Ajustes de Texto de Iniciativa:
- Tamaño mínimo: 1.5rem
- Tamaño máximo: 3rem
- Se ajusta automáticamente según la longitud del texto
- Máximo 4 líneas de texto visible

### Colores de Fondo:
- Filas pares: `#333`
- Filas impares: `#2a2a2a`
- Fondo general: `#2c2c2c`

## Mantenimiento

### Para modificar la configuración:
1. Editar los valores en `src/views/pantalla.html`
2. Probar en navegador con resolución 1180x745
3. Verificar en pantalla LED real antes de confirmar cambios
4. Actualizar este documento con los nuevos valores

### Archivos Relacionados:
- `/src/views/pantalla.html` - Vista principal de la pantalla
- `/src/views/pantalla-asistencia.html` - Vista de asistencia
- `/src/views/tablero-diputado.html` - Vista individual de diputado

## Historial de Cambios

### 29/08/2025
- Ancho de columnas aumentado de 420px a 510px
- Separación entre columnas reducida de 100px a 50px
- Ancho de nombre de diputado aumentado de 260px a 350px
- Padding de celdas reducido de 8px a 4px
- Optimización para resolución 1180x745