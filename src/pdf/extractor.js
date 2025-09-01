const pdfParse = require('pdf-parse');

/**
 * Extractor definitivo para órdenes del día del Congreso de Morelos
 * Maneja múltiples formatos y detecta automáticamente qué requiere votación
 */

// Configuración de tipos de sección y sus características de votación
// IMPORTANTE: Los incisos (G), H), I), etc. indican secciones importantes
// Después de cada inciso viene el tipo de iniciativa y luego la numeración
const CONFIGURACION_SECCIONES = {
    'PASE_LISTA': {
        patrones: [/Pase de lista/i],
        requiereVotacion: false,
        tipoVotacion: 'no_aplica',
        descripcion: 'Verificación de asistencia',
        categoria: 'procedimiento',
        esProcedimiento: true
    },
    'QUORUM': {
        patrones: [/Declaración del quórum/i],
        requiereVotacion: false,
        tipoVotacion: 'no_aplica',
        descripcion: 'Verificación de quórum legal',
        categoria: 'procedimiento',
        esProcedimiento: true
    },
    'ORDEN_DIA': {
        patrones: [/Lectura.*orden del día/i, /votación del orden/i],
        requiereVotacion: true,
        tipoVotacion: 'procedimiento',
        descripcion: 'Aprobación del orden del día',
        categoria: 'procedimiento',
        esProcedimiento: true
    },
    'ACTA': {
        patrones: [/Aprobación del acta/i],
        requiereVotacion: true,
        tipoVotacion: 'procedimiento',
        descripcion: 'Aprobación del acta de sesión anterior',
        categoria: 'procedimiento',
        esProcedimiento: true
    },
    'COMUNICACIONES': {
        patrones: [/^\w\)\s*Comunicaciones/i, /Comunicaciones\./i],
        requiereVotacion: false,
        tipoVotacion: 'informativo',
        descripcion: 'Lectura de comunicaciones',
        categoria: 'procedimiento',
        esProcedimiento: true
    },
    'INICIATIVAS': {
        patrones: [
            /^\w\)\s*Iniciativas/i,  // Cualquier letra seguida de ) Iniciativas
            /Iniciativas\./i,  // Iniciativas.
            /Iniciativa con proyecto de decreto/i  // Detectar iniciativas individuales
        ],
        requiereVotacion: false,
        tipoVotacion: 'turno_comision',
        descripcion: 'Presentación y turno a comisiones',
        categoria: 'iniciativas',
        esProcedimiento: false
    },
    'DICTAMENES_PRIMERA': {
        patrones: [
            /^\w\)\s*Dictam.*Primera\s+Lectura/i,  // Cualquier letra ) Dictamen/Dictámenes Primera Lectura
            /Dictam[eé]n\s+de\s+Primera\s+Lectura/i,  // Dictamen de Primera Lectura
            /Dictam[eé]nes\s+de\s+Primera\s+Lectura/i,  // Dictámenes de Primera Lectura
            /Primera\s+Lectura/i,  // Primera Lectura en cualquier parte
            /Dictamen.*Primera\s+Lectura/i,  // Dictamen... Primera Lectura
            /1a\.\s*Lectura/i,  // 1a. Lectura
            /1ra\.\s*Lectura/i  // 1ra. Lectura
        ],
        requiereVotacion: false, // Por defecto no, pero puede cambiar si es urgente
        tipoVotacion: 'primera_lectura',
        descripcion: 'Primera lectura, se vota en próxima sesión',
        categoria: 'primera_lectura',
        esProcedimiento: false
    },
    'DICTAMENES_PRIMERA_URGENTE': {
        patrones: [/Primera\s+Lectura.*urgente/i, /urgente.*Primera\s+Lectura/i],
        requiereVotacion: true,
        tipoVotacion: 'primera_lectura_urgente',
        descripcion: 'Primera lectura con urgente y obvia resolución',
        categoria: 'primera_lectura',
        esProcedimiento: false
    },
    'DICTAMENES_SEGUNDA': {
        patrones: [
            /^\w\)\s*Dict[aá]m.*Segunda\s+Lectura/i,  // Cualquier letra ) Dictámenes Segunda Lectura
            /Dict[aá]men\s+de\s+Segunda\s+Lectura/i,  // Dictamen de Segunda Lectura
            /Dict[aá]menes\s+de\s+Segunda\s+Lectura/i,  // Dictámenes de Segunda Lectura
            /Segunda\s+Lectura/i,  // Segunda Lectura en cualquier parte
            /2a\.\s*Lectura/i,  // 2a. Lectura
            /2da\.\s*Lectura/i,  // 2da. Lectura
            /Dictamen emanado de las? Comisi/i,  // Dictamen emanado de la/las Comisión(es)
            /Dictámenes emanados de las? Comisi/i  // Dictámenes emanados
        ],
        requiereVotacion: true,
        tipoVotacion: 'votacion_dictamen',
        descripcion: 'Segunda lectura, votación inmediata',
        categoria: 'segunda_lectura',
        esProcedimiento: false
    },
    'PUNTOS_ACUERDO': {
        patrones: [
            /^\w\)\s*Propuestas?\s+de\s+Puntos?\s+de\s+Acuerdo/i,  // Cualquier letra ) Propuestas de Puntos de Acuerdo
            /Puntos?\s+de\s+Acuerdo/i,  // Punto/Puntos de Acuerdo
            /Proposición con Punto de Acuerdo/i  // Proposición con Punto de Acuerdo
        ],
        requiereVotacion: true, // Todos los puntos de acuerdo requieren votación
        tipoVotacion: 'punto_acuerdo',
        descripcion: 'Puntos de acuerdo',
        categoria: 'puntos_acuerdo',
        esProcedimiento: false
    },
    'PROPOSICIONES': {
        patrones: [/^\w\)\s*Proposiciones/i, /Proposiciones con/i],
        requiereVotacion: false,
        tipoVotacion: 'proposicion',
        descripcion: 'Proposiciones con punto de acuerdo',
        categoria: 'proposiciones',
        esProcedimiento: false
    },
    'CORRESPONDENCIA': {
        patrones: [/^\w\)\s*Correspondencia/i, /Correspondencia\./i],
        requiereVotacion: false,
        tipoVotacion: 'informativo',
        descripcion: 'Correspondencia',
        categoria: 'procedimiento',
        esProcedimiento: true
    },
    'ASUNTOS_GENERALES': {
        patrones: [/^\w\)\s*Asuntos\s+Generales/i, /Asuntos\s+Generales/i],
        requiereVotacion: false,
        tipoVotacion: 'informativo',
        descripcion: 'Asuntos generales',
        categoria: 'procedimiento',
        esProcedimiento: true
    },
    'CLAUSURA': {
        patrones: [/^\w\)\s*Clausura/i, /Clausura de la Sesión/i],
        requiereVotacion: false,
        tipoVotacion: 'no_aplica',
        descripcion: 'Clausura de la sesión',
        categoria: 'procedimiento',
        esProcedimiento: true
    },
    'SESION_SOLEMNE': {
        patrones: [/SESIÓN\s+SOLEMNE/i],
        requiereVotacion: false,
        tipoVotacion: 'ceremonial',
        descripcion: 'Sesión solemne ceremonial'
    }
};

// Patrones especiales que modifican el comportamiento de votación
const PATRONES_ESPECIALES = {
    'URGENTE_RESOLUCION': {
        patrones: [/urgente\s+y\s+obvia\s+resolución/i, /urgente\s+resolución/i],
        modificaVotacion: true,
        tipoVotacion: 'urgente_obvia_resolucion',
        requiereVotacion: true
    },
    'DISPENSA_TRAMITE': {
        patrones: [/dispensa\s+de\s+trámite/i, /dispensa\s+del\s+trámite/i],
        modificaVotacion: true,
        tipoVotacion: 'dispensa_tramite',
        requiereVotacion: true
    },
    'REFORMA_CONSTITUCIONAL': {
        patrones: [/reforma.*constitución/i, /reforma.*constitucional/i],
        modificaMayoria: true,
        tipoMayoria: 'calificada'
    },
    'MAYORIA_CALIFICADA': {
        patrones: [/mayoría\s+calificada/i, /dos\s+terceras\s+partes/i],
        modificaMayoria: true,
        tipoMayoria: 'calificada'
    },
    'CUMPLIMIENTO_EJECUTORIA': {
        patrones: [/cumplimiento.*ejecutoria/i, /cumplimiento.*sentencia/i, /juicio\s+de\s+amparo/i],
        esCumplimientoSentencia: true,
        prioridad: 'alta'
    },
    'OBSERVACIONES_EJECUTIVO': {
        patrones: [/observaciones.*ejecutivo/i, /observaciones.*gobernador/i],
        esObservacionEjecutivo: true,
        requiereVotacion: true,
        tipoVotacion: 'observaciones_ejecutivo'
    },
    'RECONOCIMIENTOS': {
        patrones: [/entrega.*reconocimiento/i, /presea/i, /mérito/i, /condecoración/i],
        esCeremonial: true,
        requiereVotacion: false
    }
};

/**
 * Función principal de extracción
 */
async function extraerIniciativasDefinitivo(pdfBuffer) {
    try {
        const data = await pdfParse(pdfBuffer);
        let texto = data.text;
        
        // Mejorar el formato del texto para preservar mejor la estructura
        // Reemplazar saltos de línea múltiples con uno solo
        texto = texto.replace(/\n{3,}/g, '\n\n');
        
        // Log para debugging
        console.log('=== TEXTO EXTRAÍDO DEL PDF (primeros 1000 caracteres) ===');
        console.log(texto.substring(0, 1000));
        console.log('=== FIN DEL PREVIEW ===');
        
        // Detectar tipo de sesión
        const tipoSesion = detectarTipoSesion(texto);
        
        // Extraer estructura completa de incisos
        const estructuraIncisos = extraerEstructuraIncisos(texto);
        
        // NUEVO: Extraer elementos con la estructura de incisos para mantener categorías
        const elementos = extraerElementosConCategoria(texto, estructuraIncisos, tipoSesion);
        
        // Generar estadísticas y resumen
        const estadisticas = generarEstadisticas(elementos);
        
        // Preparar respuesta
        const resultado = {
            metadatos: {
                paginas: data.numpages,
                tipoSesion: tipoSesion,
                fecha: extraerFecha(texto),
                estructuraIncisos: estructuraIncisos,  // Incluir estructura de incisos
                textoOriginal: texto  // Incluir el texto original completo del PDF
            },
            elementos: elementos,
            estadisticas: estadisticas,
            votacionesInmediatas: elementos.filter(e => 
                e.requiere_votacion && e.momento_votacion === 'inmediato'
            ).map(e => ({
                numero: e.numero,
                titulo: e.titulo.substring(0, 100) + (e.titulo.length > 100 ? '...' : ''),
                tipo: e.tipo_votacion,
                mayoria: e.tipo_mayoria,
                prioridad: e.prioridad || 'normal'
            }))
        };
        
        console.log(`\n✅ Extracción completada:`);
        console.log(`   - Total elementos: ${estadisticas.total}`);
        console.log(`   - Requieren votación: ${estadisticas.requierenVotacion}`);
        console.log(`   - Tipo de sesión: ${tipoSesion}`);
        
        return resultado;
        
    } catch (error) {
        console.error('Error en extracción:', error);
        throw error;
    }
}

/**
 * Determina la categoría de un inciso basándose en su contenido
 * Análisis inteligente del texto para categorizar correctamente
 */
function determinarCategoriaInciso(contenido) {
    const contenidoLower = contenido.toLowerCase();
    
    // Patrones mejorados para cada categoría con más variaciones
    const categoriasPatrones = {
        'iniciativas': [
            /iniciativa/i,
            /proyecto\s+de\s+decreto/i,
            /proyecto\s+de\s+ley/i,
            /reforma/i,
            /adiciona/i,
            /modifica/i,
            /deroga/i,
            /abroga/i,
            /expide/i,
            /crea/i
        ],
        'primera_lectura': [
            /primera\s+lectura/i,
            /dictamen.*primera/i,
            /dictámenes.*primera/i,
            /1a\.\s*lectura/i,
            /1ra\.\s*lectura/i,
            /1era\.\s*lectura/i,
            /dictamen\s+de\s+primera/i,
            /dictámenes\s+de\s+primera/i
        ],
        'segunda_lectura': [
            /segunda\s+lectura/i,
            /dictamen.*segunda/i,
            /dictámenes.*segunda/i,
            /2a\.\s*lectura/i,
            /2da\.\s*lectura/i,
            /dictamen\s+de\s+segunda/i,
            /dictámenes\s+de\s+segunda/i,
            /dictamen\s+emanado/i,
            /dictámenes\s+emanados/i
        ],
        'puntos_acuerdo': [
            /punto.*acuerdo/i,
            /puntos.*acuerdo/i,
            /proposición.*punto/i,
            /propuesta.*punto/i,
            /propuestas.*punto/i,
            /acuerdo\s+parlamentario/i,
            /exhorto/i,
            /exhortación/i
        ],
        'procedimiento': [
            /pase\s+de\s+lista/i,
            /quórum/i,
            /quorum/i,
            /orden\s+del\s+día/i,
            /acta/i,
            /comunicaciones/i,
            /correspondencia/i,
            /asuntos\s+generales/i,
            /clausura/i,
            /apertura/i,
            /honores\s+a\s+la\s+bandera/i,
            /himno/i
        ]
    };
    
    // Buscar coincidencias
    for (const [categoria, patrones] of Object.entries(categoriasPatrones)) {
        for (const patron of patrones) {
            if (contenido.match(patron)) {
                return categoria;
            }
        }
    }
    
    // Si no coincide con ningún patrón específico, intentar determinar por contexto
    // Si menciona "Dictamen" probablemente es segunda lectura
    if (contenido.match(/dictamen/i) && !contenido.match(/primera/i)) {
        return 'segunda_lectura';
    }
    
    // Si menciona "Iniciativa" es iniciativas
    if (contenido.match(/iniciativa/i)) {
        return 'iniciativas';
    }
    
    // Por defecto, considerarlo procedimiento
    return 'procedimiento';
}

/**
 * Determina la categoría de un elemento específico con análisis detallado
 */
function determinarCategoriaElemento(texto, tipoSeccionActual, categoriaActual) {
    // Si el tipo de sección ya tiene una categoría definida, usarla como base
    let categoria = tipoSeccionActual?.categoria || categoriaActual || 'procedimiento';
    
    // Análisis más profundo del texto del elemento
    const textoLower = texto.toLowerCase();
    
    // Patrones específicos que anulan la categoría de la sección
    if (textoLower.includes('iniciativa con proyecto de decreto')) {
        return 'iniciativas';
    }
    
    if (textoLower.includes('dictamen') && textoLower.includes('primera lectura')) {
        return 'primera_lectura';
    }
    
    if (textoLower.includes('dictamen emanado de') || 
        (textoLower.includes('dictamen') && textoLower.includes('segunda lectura'))) {
        return 'segunda_lectura';
    }
    
    if (textoLower.includes('proposición con punto de acuerdo') || 
        textoLower.includes('punto de acuerdo')) {
        return 'puntos_acuerdo';
    }
    
    // Análisis adicional por palabras clave (todas en minúsculas para comparación)
    const palabrasClaveCategoria = {
        'iniciativas': ['iniciativa', 'reforma', 'proyecto de ley', 'adiciona', 'modifica', 'deroga', 'abroga', 'expide', 'crea'],
        'primera_lectura': ['primera lectura', 'turno a comisión', 'estudio y dictamen', '1a lectura', '1ra lectura', '1a. lectura', '1ra. lectura'],
        'segunda_lectura': ['segunda lectura', 'dictamen emanado', 'aprobación', 'votación del dictamen', '2a lectura', '2da lectura', '2a. lectura', '2da. lectura'],
        'puntos_acuerdo': ['punto de acuerdo', 'puntos de acuerdo', 'proposición', 'exhorto', 'solicitud', 'acuerdo parlamentario']
    };
    
    for (const [cat, palabras] of Object.entries(palabrasClaveCategoria)) {
        for (const palabra of palabras) {
            if (textoLower.includes(palabra.toLowerCase())) {
                return cat;
            }
        }
    }
    
    return categoria;
}

/**
 * Detecta el tipo de sesión del documento
 */
function detectarTipoSesion(texto) {
    if (texto.match(/SESIÓN\s+SOLEMNE/i)) {
        return 'solemne';
    } else if (texto.match(/SESIÓN\s+EXTRAORDINARIA/i)) {
        return 'extraordinaria';
    } else if (texto.match(/mérito|presea|reconocimiento/i) && !texto.match(/Dictámenes/i)) {
        return 'ceremonial';
    } else {
        return 'ordinaria';
    }
}

/**
 * Extrae la fecha de la sesión
 */
function extraerFecha(texto) {
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                   'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    
    for (const mes of meses) {
        const regex = new RegExp(`(\\d{1,2})\\s+de\\s+${mes}\\s+(?:de\\s+)?(\\d{4})`, 'i');
        const match = texto.match(regex);
        if (match) {
            return `${match[1]} de ${mes} de ${match[2]}`;
        }
    }
    
    // Buscar formato alternativo
    const matchAlternativo = texto.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (matchAlternativo) {
        return `${matchAlternativo[1]}/${matchAlternativo[2]}/${matchAlternativo[3]}`;
    }
    
    return null;
}

/**
 * Extrae la estructura completa de incisos del documento
 * IMPORTANTE: Detecta secciones por CONTENIDO, no por letra fija
 * Patrón: [CUALQUIER_LETRA]) [TIPO] → 1. 2. 3. (numeración propia por sección)
 */
function extraerEstructuraIncisos(texto) {
    const estructura = [];
    const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    console.log('\n🔍 === INICIANDO DETECCIÓN DE SECCIONES POR CONTENIDO ===');
    
    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        
        // Detectar incisos principales con formato: CUALQUIER_LETRA) CONTENIDO
        const matchIncisoPrincipal = linea.match(/^([A-Z])\)\s+(.+)/);
        if (matchIncisoPrincipal) {
            const letra = matchIncisoPrincipal[1];
            const contenido = matchIncisoPrincipal[2];
            const contenidoLower = contenido.toLowerCase();
            
            // Determinar categoría por CONTENIDO, no por letra
            let tipoInciso = null;
            let categoria = null;
            let requiereVotacion = false;
            let esProcedimiento = false;
            
            // DETECTAR POR PALABRAS CLAVE (orden de prioridad importante)
            if (contenidoLower.match(/segunda\s+lectura|2a\.\s*lectura|2da\.\s*lectura/)) {
                // SEGUNDA LECTURA - SIEMPRE SE VOTA
                tipoInciso = 'DICTAMENES_SEGUNDA';
                categoria = 'segunda_lectura';
                requiereVotacion = true;
                console.log(`✅ Inciso ${letra}) - SEGUNDA LECTURA detectada → SE VOTA`);
                
            } else if (contenidoLower.match(/primera\s+lectura|1a\.\s*lectura|1ra\.\s*lectura/)) {
                // PRIMERA LECTURA - Solo se vota si es urgente
                tipoInciso = 'DICTAMENES_PRIMERA';
                categoria = 'primera_lectura';
                requiereVotacion = contenidoLower.includes('urgente') || contenidoLower.includes('obvia');
                console.log(`📋 Inciso ${letra}) - PRIMERA LECTURA detectada → ${requiereVotacion ? 'URGENTE (SE VOTA)' : 'Normal (próxima sesión)'}`);
                
            } else if (contenidoLower.match(/dict[aá]m[eé]n/i) && !contenidoLower.includes('lectura')) {
                // DICTÁMENES (sin especificar lectura) - Generalmente se votan
                tipoInciso = 'DICTAMENES';
                categoria = 'dictamenes';
                requiereVotacion = true;
                console.log(`✅ Inciso ${letra}) - DICTÁMENES detectados → SE VOTAN`);
                
            } else if (contenidoLower.match(/punto.*acuerdo|proposici[oó]n.*punto/)) {
                // PUNTOS DE ACUERDO - SE VOTAN
                tipoInciso = 'PUNTOS_ACUERDO';
                categoria = 'puntos_acuerdo';
                requiereVotacion = true;
                console.log(`✅ Inciso ${letra}) - PUNTOS DE ACUERDO detectados → SE VOTAN`);
                
            } else if (contenidoLower.match(/iniciativa/)) {
                // INICIATIVAS - Solo turno a comisión
                tipoInciso = 'INICIATIVAS';
                categoria = 'iniciativas';
                requiereVotacion = false;
                console.log(`📄 Inciso ${letra}) - INICIATIVAS detectadas → Turno a comisión (NO se votan)`);
                
            } else if (contenidoLower.match(/comunicaci[oó]n/)) {
                // COMUNICACIONES - Procedimiento
                tipoInciso = 'COMUNICACIONES';
                categoria = 'procedimiento';
                esProcedimiento = true;
                requiereVotacion = false;
                console.log(`📨 Inciso ${letra}) - COMUNICACIONES detectadas → Procedimiento`);
                
            } else if (contenidoLower.match(/pase.*lista|quorum|qu[oó]rum|orden.*d[ií]a|acta/)) {
                // PROCEDIMIENTOS
                tipoInciso = 'PROCEDIMIENTO';
                categoria = 'procedimiento';
                esProcedimiento = true;
                requiereVotacion = contenidoLower.includes('votación') || contenidoLower.includes('aprobación');
                console.log(`⚙️ Inciso ${letra}) - PROCEDIMIENTO detectado`);
                
            } else {
                // NO IDENTIFICADO - Marcar para revisión
                categoria = 'otras';
                console.log(`❓ Inciso ${letra}) - Tipo NO IDENTIFICADO: "${contenido}"`);
            }
            
            estructura.push({
                letra: letra,
                contenido: contenido,
                tipoInciso: tipoInciso,
                categoria: categoria,
                esProcedimiento: esProcedimiento,
                requiereVotacion: requiereVotacion,
                elementos: [], // Aquí se agregarán los elementos numerados
                descripcion: obtenerDescripcionCategoria(categoria)
            });
        }
    }
    
    console.log(`\n📊 Total de secciones detectadas: ${estructura.length}`);
    estructura.forEach(s => {
        console.log(`   ${s.letra}) ${s.categoria} - ${s.requiereVotacion ? '✅ SE VOTA' : '⏸️ NO se vota'}`);
    });
    
    return estructura;
}

/**
 * Obtiene una descripción clara de la categoría
 */
function obtenerDescripcionCategoria(categoria) {
    const descripciones = {
        'primera_lectura': 'Dictámenes en primera lectura (se votan en próxima sesión)',
        'segunda_lectura': 'Dictámenes en segunda lectura (SE VOTAN HOY)',
        'puntos_acuerdo': 'Proposiciones con punto de acuerdo (SE VOTAN HOY)',
        'iniciativas': 'Iniciativas (se turnan a comisiones, no se votan)',
        'procedimiento': 'Asuntos de procedimiento parlamentario',
        'dictamenes': 'Dictámenes para votación',
        'urgente': 'Asuntos de urgente y obvia resolución (SE VOTAN HOY)'
    };
    
    return descripciones[categoria] || categoria;
}

/**
 * NUEVA FUNCIÓN: Extrae elementos respetando la estructura de incisos y numeración dual
 */
function extraerElementosConCategoria(texto, estructuraIncisos, tipoSesion) {
    const elementos = [];
    const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let numeroGeneral = 0; // Contador general de todos los elementos
    let seccionActual = null; // Sección actual (inciso)
    let numeroEnSeccion = 0; // Contador dentro de cada sección
    
    console.log('\n📋 === EXTRAYENDO ELEMENTOS CON CATEGORÍAS ===');
    
    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        
        // Detectar cambio de sección (inciso principal)
        const matchInciso = linea.match(/^([A-Z])\)\s+(.+)/);
        if (matchInciso) {
            const letra = matchInciso[1];
            // Buscar esta sección en la estructura
            seccionActual = estructuraIncisos.find(e => e.letra === letra);
            numeroEnSeccion = 0; // Reiniciar contador de sección
            
            if (seccionActual) {
                console.log(`\n📂 Entrando a sección ${letra}) ${seccionActual.categoria}`);
            }
            continue;
        }
        
        // Detectar elementos numerados (1. 2. 3. etc)
        const matchNumero = linea.match(/^(\d+)\.\s+(.+)/);
        if (matchNumero && seccionActual && !seccionActual.esProcedimiento) {
            numeroGeneral++;
            numeroEnSeccion++;
            
            const numeroOriginal = parseInt(matchNumero[1]);
            const contenido = matchNumero[2];
            
            // Crear elemento con toda la información
            const elemento = {
                // Numeración dual
                numero: numeroGeneral,
                numero_orden_dia: numeroEnSeccion,
                numero_original: numeroOriginal,
                
                // Contenido
                titulo: contenido.substring(0, 100),
                descripcion: contenido,
                contenido_completo: contenido,
                
                // Categorización
                categoria: seccionActual.categoria,
                tipo: seccionActual.tipoInciso,
                tipo_documento: seccionActual.categoria,
                
                // Votación
                requiere_votacion: seccionActual.requiereVotacion,
                tipo_votacion: seccionActual.requiereVotacion ? 
                    (seccionActual.categoria === 'segunda_lectura' ? 'votacion_dictamen' :
                     seccionActual.categoria === 'puntos_acuerdo' ? 'punto_acuerdo' :
                     seccionActual.categoria === 'dictamenes' ? 'votacion_dictamen' :
                     'votacion_general') : 'turno_comision',
                tipo_mayoria: 'simple', // Por defecto
                
                // Metadatos
                inciso_principal: seccionActual.letra,
                titulo_seccion: seccionActual.contenido,
                momento_votacion: seccionActual.requiereVotacion ? 'inmediato' : 'no_aplica',
                
                // Para UI
                recomendado_para_votacion: seccionActual.requiereVotacion,
                es_votable: seccionActual.requiereVotacion,
                marcada_para_votacion: false, // Se marcará en la UI
                seleccionada: false // Para el checkbox en la UI
            };
            
            // Detectar si es urgente
            if (contenido.toLowerCase().includes('urgente') && contenido.toLowerCase().includes('obvia')) {
                elemento.urgente = true;
                elemento.requiere_votacion = true;
                elemento.tipo_votacion = 'urgente_obvia';
            }
            
            // Extraer presentador si existe
            const matchPresentador = contenido.match(/presentad[ao]\s+por\s+(?:el\s+|la\s+)?(?:Diputad[ao]\s+)?([^(]+)(?:\(([^)]+)\))?/i);
            if (matchPresentador) {
                elemento.presentador = matchPresentador[1].trim();
                elemento.partido = matchPresentador[2] || '';
            }
            
            elementos.push(elemento);
            
            console.log(`   ✓ ${numeroGeneral}/${numeroEnSeccion}. ${contenido.substring(0, 50)}... [${seccionActual.categoria}]`);
        }
    }
    
    console.log(`\n✅ Total elementos extraídos: ${elementos.length}`);
    console.log(`   - Requieren votación: ${elementos.filter(e => e.requiere_votacion).length}`);
    console.log(`   - Por categoría:`);
    
    // Contar por categoría
    const categorias = {};
    elementos.forEach(e => {
        categorias[e.categoria] = (categorias[e.categoria] || 0) + 1;
    });
    
    Object.entries(categorias).forEach(([cat, count]) => {
        console.log(`     • ${cat}: ${count}`);
    });
    
    return elementos;
}

/**
 * Extrae todos los elementos del documento con numeración dual (general/sección)
 * Respeta las categorías detectadas por contenido
 */
function extraerElementos(texto, tipoSesion) {
    const elementos = [];
    // NO filtrar líneas vacías, mantenerlas para detectar separaciones
    const lineas = texto.split('\n').map(l => l.trim());
    
    let seccionActual = null;
    let tipoSeccionActual = null;
    let numeroElemento = 0;
    let elementoActual = null;
    let textoAcumulado = '';
    let procesandoElemento = false;
    let incisos = [];
    let incisoPrincipalActual = null;  // Para rastrear el inciso principal (A, B, C, etc.)
    let categoriaActual = 'otras';  // Categoría por defecto para elementos no identificados
    
    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        
        // Detectar inciso principal (A), B), C), etc.)
        const matchIncisoPrincipal = linea.match(/^([A-Z])\)\s+(.+)/);
        if (matchIncisoPrincipal) {
            incisoPrincipalActual = matchIncisoPrincipal[1];
            const contenidoInciso = matchIncisoPrincipal[2];
            
            // Determinar categoría basada en el contenido del inciso
            categoriaActual = determinarCategoriaInciso(contenidoInciso);
            console.log(`📂 Inciso ${incisoPrincipalActual}) detectado: "${contenidoInciso.substring(0, 50)}..." → Categoría: ${categoriaActual}`);
            
            // Detectar si es una nueva sección basada en el contenido
            const nuevaSeccion = detectarSeccion(linea);
            if (nuevaSeccion) {
                // Procesar elemento pendiente si existe
                if (elementoActual && textoAcumulado) {
                    if (incisos.length > 0) {
                        elementoActual.incisos = incisos;
                    }
                    finalizarElemento(elementoActual, textoAcumulado, elementos);
                    incisos = [];
                }
                
                seccionActual = nuevaSeccion.nombre;
                tipoSeccionActual = nuevaSeccion;
                tipoSeccionActual.incisoPrincipal = incisoPrincipalActual;  // Guardar el inciso principal
                tipoSeccionActual.tituloCompleto = linea;  // Guardar el título completo con inciso
                tipoSeccionActual.categoria = categoriaActual;  // Usar la categoría determinada
                console.log(`   ✅ Sección establecida: ${seccionActual} con categoría: ${categoriaActual}`);
                procesandoElemento = false;
                elementoActual = null;
                textoAcumulado = '';
                continue;
            }
        }
        
        // Detectar cambio de sección (sin inciso principal)
        // Solo procesar si la línea no está vacía
        const nuevaSeccion = linea.length > 0 ? detectarSeccion(linea) : null;
        if (nuevaSeccion && !matchIncisoPrincipal) {
            // Procesar elemento pendiente si existe
            if (elementoActual && textoAcumulado) {
                if (incisos.length > 0) {
                    elementoActual.incisos = incisos;
                }
                finalizarElemento(elementoActual, textoAcumulado, elementos);
                incisos = [];
            }
            
            seccionActual = nuevaSeccion.nombre;
            tipoSeccionActual = nuevaSeccion;
            procesandoElemento = false;
            elementoActual = null;
            textoAcumulado = '';
            continue;
        }
        
        // Detectar incisos (a), b), c), etc.)
        const matchInciso = linea.match(/^[a-z]\)\s+(.+)/i);
        if (matchInciso && procesandoElemento) {
            // Es un inciso del elemento actual
            incisos.push({
                letra: linea.match(/^([a-z])\)/i)[1],
                texto: matchInciso[1]
            });
            continue;
        }
        
        // Detectar elementos válidos del orden del día
        const matchNumero = linea.match(/^(\d+)\.\s+(.+)/); // Elementos numerados: 1. xxx
        const esDictamen = linea.match(/^(\d+\.\s+)?Dict[aá]m/i);
        const esIniciativa = linea.match(/^(\d+\.\s+)?Iniciativa/i);
        const esProposicion = linea.match(/^(\d+\.\s+)?Proposición/i) || linea.match(/^(\d+\.\s+)?Punto de Acuerdo/i);
        
        // También detectar elementos que empiezan con número romano o letra
        const matchNumeroRomano = linea.match(/^[IVXLCDM]+\.\s+(.+)/);
        const matchLetra = linea.match(/^[a-z]\.\s+(.+)/i);
        
        // Detectar sub-elementos dentro de secciones (cuando ya estamos en una sección válida)
        const esSubElemento = tipoSeccionActual && procesandoElemento && 
                             (linea.match(/^\s*-\s+/) || // Elementos con guión
                              linea.match(/^\s*•\s+/) || // Elementos con bullet
                              linea.match(/^\s*\*\s+/)); // Elementos con asterisco
        
        // Solo considerar válidos los elementos que:
        // 1. Tienen numeración explícita (1., 2., etc.)
        // 2. Son dictámenes, iniciativas o proposiciones
        // 3. Tienen numeración romana o letra SOLO si estamos en una sección válida
        const esElementoValido = (matchNumero || esDictamen || esIniciativa || esProposicion || 
                                  (tipoSeccionActual && (matchNumeroRomano || matchLetra))) && 
                                  !linea.match(/^[A-Z]\)\s+/); // No es un título de sección principal
        
        if (esElementoValido) {
            // Procesar elemento anterior si existe
            if (elementoActual && textoAcumulado) {
                if (incisos.length > 0) {
                    elementoActual.incisos = incisos;
                }
                finalizarElemento(elementoActual, textoAcumulado, elementos);
            }
            
            // Iniciar nuevo elemento
            let numeroOriginal = null;
            
            // Extraer número original del documento
            if (matchNumero) {
                numeroOriginal = parseInt(matchNumero[1]);
            } else {
                // Buscar número al inicio de dictámenes, iniciativas o proposiciones
                const matchNumeroInicio = linea.match(/^(\d+)\.\s+/);
                if (matchNumeroInicio) {
                    numeroOriginal = parseInt(matchNumeroInicio[1]);
                }
            }
            
            numeroElemento++; // Siempre incrementar el número asignado por el programa
            
            procesandoElemento = true;
            textoAcumulado = linea; // Iniciar con la primera línea
            incisos = []; // Reiniciar incisos para el nuevo elemento
            
            // IMPORTANTE: Crear elementoActual INMEDIATAMENTE para que funcione la acumulación
            // Esto DEBE estar aquí antes de cualquier análisis para que el texto se acumule correctamente
            elementoActual = {
                numero: numeroElemento,
                numero_original: numeroOriginal,
                // Los demás campos se llenarán después del análisis
            };
            
            // MODIFICADO: Determinar categoría y RECOMENDAR votación (no filtrar)
            let requiereVotacionElemento = false; // Por defecto no requiere votación
            let recomendadoParaVotacion = false; // NUEVO: Campo para recomendación
            let tipoVotacionElemento = '';
            let categoriaElemento = categoriaActual; // Usar categoría actual o 'otras' por defecto
            
            // Analizar el contenido para determinar la categoría y recomendación
            const textoAnalizar = linea.toLowerCase();
            
            // Log para debugging de categorización
            if (numeroElemento <= 10) {
                console.log(`\n🔍 Analizando elemento ${numeroElemento}: "${textoAnalizar.substring(0, 100)}..."`);
            }
            
            // PRIORIDAD 1: Si estamos dentro de un inciso con categoría específica, usarla
            if (incisoPrincipalActual && tipoSeccionActual && tipoSeccionActual.categoria) {
                categoriaElemento = tipoSeccionActual.categoria;
                console.log(`   → ✅ HEREDANDO categoría del inciso ${incisoPrincipalActual}: ${categoriaElemento} (tipo sección: ${tipoSeccionActual.nombre})`);
                
                // Configurar votación según la categoría heredada
                if (categoriaElemento === 'primera_lectura') {
                    recomendadoParaVotacion = false;
                    tipoVotacionElemento = 'primera_lectura';
                } else if (categoriaElemento === 'segunda_lectura') {
                    recomendadoParaVotacion = true;
                    requiereVotacionElemento = true;
                    tipoVotacionElemento = 'votacion_dictamen';
                } else if (categoriaElemento === 'dictamenes') {
                    recomendadoParaVotacion = true;
                    tipoVotacionElemento = 'votacion_dictamen';
                } else if (categoriaElemento === 'puntos_acuerdo') {
                    recomendadoParaVotacion = true;
                    requiereVotacionElemento = true;
                    tipoVotacionElemento = 'punto_acuerdo';
                } else if (categoriaElemento === 'iniciativas') {
                    recomendadoParaVotacion = false;
                    tipoVotacionElemento = 'turno_comision';
                }
            }
            // PRIORIDAD 2: Detectar por contenido si no hay categoría del inciso
            else if (esDictamen || textoAnalizar.includes('dictamen') || textoAnalizar.includes('dictámen')) {
                // Buscar si es primera o segunda lectura
                if (textoAnalizar.match(/primera\s+lectura/) || textoAnalizar.match(/1[ae]?r?a?\.\s*lectura/)) {
                    categoriaElemento = 'primera_lectura';
                    recomendadoParaVotacion = false; // Primera lectura normalmente no se vota
                    tipoVotacionElemento = 'primera_lectura';
                    console.log(`   → Categorizado como PRIMERA LECTURA`);
                } else if (textoAnalizar.match(/segunda\s+lectura/) || textoAnalizar.match(/2[ad]?a?\.\s*lectura/)) {
                    categoriaElemento = 'segunda_lectura';
                    recomendadoParaVotacion = true; // Segunda lectura SÍ se recomienda votar
                    requiereVotacionElemento = true;
                    tipoVotacionElemento = 'votacion_dictamen';
                    console.log(`   → Categorizado como SEGUNDA LECTURA`);
                } else {
                    // Solo categorizar como dictamen genérico si NO estamos en un inciso específico
                    // Si estamos en G) o H), ya debería tener categoría del inciso
                    if (!incisoPrincipalActual || !tipoSeccionActual) {
                        categoriaElemento = 'dictamenes';
                        recomendadoParaVotacion = true; // Dictámenes generalmente se votan
                        tipoVotacionElemento = 'votacion_dictamen';
                        console.log(`   → Categorizado como DICTAMEN GENÉRICO (sin inciso específico)`);
                    }
                }
            }
            // Iniciativas - se turnan pero no se votan normalmente
            else if (esIniciativa || textoAnalizar.includes('iniciativa')) {
                categoriaElemento = 'iniciativas';
                recomendadoParaVotacion = false;
                tipoVotacionElemento = 'turno_comision';
                console.log(`   → Categorizado como INICIATIVA`);
            }
            // Puntos de acuerdo - generalmente se votan
            else if (esProposicion || textoAnalizar.includes('punto') && textoAnalizar.includes('acuerdo')) {
                categoriaElemento = 'puntos_acuerdo';
                recomendadoParaVotacion = true;
                requiereVotacionElemento = true;
                tipoVotacionElemento = 'punto_acuerdo';
                console.log(`   → Categorizado como PUNTO DE ACUERDO`);
            }
            // Urgente y obvia resolución - SIEMPRE se vota
            else if (textoAnalizar.includes('urgente') && textoAnalizar.includes('obvia')) {
                categoriaElemento = 'urgente';
                recomendadoParaVotacion = true;
                requiereVotacionElemento = true;
                tipoVotacionElemento = 'urgente_obvia';
                console.log(`   → Categorizado como URGENTE Y OBVIA RESOLUCIÓN`);
            }
            // Si no se puede categorizar, dejar como 'otras'
            else {
                categoriaElemento = 'otras';
                recomendadoParaVotacion = false;
            }
            
            // Actualizar el elementoActual que ya fue creado arriba
            Object.assign(elementoActual, {
                numero: numeroElemento,
                numero_original: numeroOriginal,
                numero_display: numeroOriginal ? `${numeroElemento}/${numeroOriginal}` : `${numeroElemento}`,
                seccion: seccionActual,
                inciso_principal: tipoSeccionActual?.incisoPrincipal || null,  // Incluir el inciso principal
                titulo_seccion: tipoSeccionActual?.tituloCompleto || null,  // Incluir título completo
                categoria: categoriaElemento,  // Usar la categoría determinada arriba
                es_procedimiento: tipoSeccionActual?.esProcedimiento || false,  // Si es procedimiento
                tipo_documento: determinarTipoDocumento(linea),
                requiere_votacion: requiereVotacionElemento,
                recomendado_para_votacion: recomendadoParaVotacion,  // NUEVO: Recomendación del sistema
                tipo_votacion: tipoVotacionElemento,
                momento_votacion: requiereVotacionElemento ? 'inmediato' : 'no_aplica',
                tipo_mayoria: 'simple',
                prioridad: 'normal',
                caracteristicas_especiales: [],
                capturado_automaticamente: true  // NUEVO: Marcar que fue capturado automáticamente
            });
            
            // En sesiones solemnes o ceremoniales, nada se vota pero mantener categorías
            if (tipoSesion === 'solemne' || tipoSesion === 'ceremonial') {
                elementoActual.requiere_votacion = false;
                // Mantener el tipo de votación original para identificar la categoría
                // Solo cambiar si no tiene tipo definido
                if (!elementoActual.tipo_votacion) {
                    elementoActual.tipo_votacion = 'ceremonial';
                }
                elementoActual.momento_votacion = 'no_aplica';
            }
            
        } else if (procesandoElemento && elementoActual) {
            // MEJORADO: Detectar nuevo elemento solo si tiene número al inicio
            // Esto evita cortar el texto cuando continúa en la siguiente línea
            const esNuevoElemento = linea.match(/^(\d+)\.\s+/); // Solo número + punto = nuevo elemento
            const esNuevoInciso = linea.match(/^[A-Z]\)\s+/); // Nuevo inciso principal (letra + paréntesis)
            
            // Verificar que realmente es un nuevo elemento y no continuación
            // IMPORTANTE: Solo considerar nuevo si tiene número Y una palabra clave específica al inicio
            // Esto evita cortar el texto cuando el PDF tiene saltos de línea
            const palabrasInicioElemento = /^(\d+)\.\s+(Iniciativa|Dictamen|Dict[aá]men|Proposici[oó]n|Punto|Comunicaci[oó]n|Solicitud|Oficio|Acuerdo|Lectura|Discusi[oó]n|Votaci[oó]n)/i;
            const esRealmenteNuevo = esNuevoElemento && linea.match(palabrasInicioElemento);
            
            // Log para debug
            if (esNuevoElemento && !esRealmenteNuevo && numeroElemento <= 10) {
                console.log(`   ⚠️ Línea con número pero NO es nuevo elemento: "${linea.substring(0, 80)}..."`);
            }
            
            if (esRealmenteNuevo || esNuevoInciso) {
                // Finalizar elemento actual y retroceder para procesar el nuevo
                if (elementoActual && textoAcumulado) {
                    if (incisos.length > 0) {
                        elementoActual.incisos = incisos;
                    }
                    finalizarElemento(elementoActual, textoAcumulado, elementos);
                }
                procesandoElemento = false;
                elementoActual = null;
                textoAcumulado = '';
                incisos = [];
                i--; // Retroceder para procesar esta línea como nuevo elemento
            } else {
                // Acumular TODAS las líneas que son continuación del elemento actual
                if (linea.length > 0) {
                    // Agregar la línea con un espacio si no termina con guión (palabra cortada)
                    if (textoAcumulado.endsWith('-')) {
                        // Palabra cortada al final de línea, unir sin espacio
                        textoAcumulado = textoAcumulado.slice(0, -1) + linea;
                    } else {
                        // Línea normal, agregar con espacio
                        textoAcumulado += ' ' + linea;
                    }
                } else if (textoAcumulado.length > 0) {
                    // Línea vacía: podría indicar fin de párrafo, agregar doble espacio
                    textoAcumulado += '  ';
                }
                
                // Log de depuración mejorado - AUMENTADO para ver más elementos
                if (numeroElemento <= 10 && linea.length > 0) {
                    console.log(`   📝 [Elemento ${numeroElemento}] Acumulando línea ${i}: "${linea.substring(0, 80)}..."`);
                    console.log(`      Texto total acumulado (${textoAcumulado.length} chars): "${textoAcumulado.substring(0, 200)}..."`);
                }
                
                // Buscar patrones especiales que modifiquen la votación
                aplicarPatronesEspeciales(elementoActual, linea);
                
                // NO cerrar automáticamente por líneas vacías
                // Seguir acumulando hasta encontrar un nuevo elemento real
                // Solo cerrar si el texto es excesivamente largo
                if (textoAcumulado.length > 25000) { // Aumentado límite a 25000 chars para textos largos
                    if (elementoActual && textoAcumulado) {
                        if (incisos.length > 0) {
                            elementoActual.incisos = incisos;
                        }
                        finalizarElemento(elementoActual, textoAcumulado, elementos);
                    }
                    procesandoElemento = false;
                    elementoActual = null;
                    textoAcumulado = '';
                    incisos = [];
                }
            }
        }
    }
    
    // Procesar último elemento
    if (elementoActual && textoAcumulado) {
        if (incisos.length > 0) {
            elementoActual.incisos = incisos;
        }
        finalizarElemento(elementoActual, textoAcumulado, elementos);
    }
    
    return elementos;
}

/**
 * Detecta el tipo de sección de una línea con análisis mejorado
 * Usa análisis inteligente del contenido para categorizar correctamente
 */
function detectarSeccion(linea) {
    const lineaNormalizada = linea.trim();
    
    // Si es un inciso principal (A), B), etc.), analizar su contenido
    if (lineaNormalizada.match(/^[A-Z]\)\s+/)) {
        const contenido = lineaNormalizada.replace(/^[A-Z]\)\s+/, '');
        
        // Buscar específicamente por tipo de contenido - Mejorado para detectar más variaciones
        if (contenido.match(/dict[aá]m.*primera/i) || 
            contenido.match(/primera\s+lectura/i) ||
            contenido.match(/1[ae]?r?a?\.\s*lectura/i)) {
            return {
                nombre: 'DICTAMENES_PRIMERA',
                ...CONFIGURACION_SECCIONES.DICTAMENES_PRIMERA,
                categoria: 'primera_lectura'
            };
        }
        
        if (contenido.match(/dict[aá]m.*segunda/i) || 
            contenido.match(/segunda\s+lectura/i) ||
            contenido.match(/2[ad]?a?\.\s*lectura/i) ||
            contenido.match(/dictamen\s+emanado/i)) {
            return {
                nombre: 'DICTAMENES_SEGUNDA',
                ...CONFIGURACION_SECCIONES.DICTAMENES_SEGUNDA,
                categoria: 'segunda_lectura'
            };
        }
        
        if (contenido.match(/iniciativa/i)) {
            return {
                nombre: 'INICIATIVAS',
                ...CONFIGURACION_SECCIONES.INICIATIVAS,
                categoria: 'iniciativas'
            };
        }
        
        if (contenido.match(/punto.*acuerdo/i) || contenido.match(/propuesta.*punto/i)) {
            return {
                nombre: 'PUNTOS_ACUERDO',
                ...CONFIGURACION_SECCIONES.PUNTOS_ACUERDO,
                categoria: 'puntos_acuerdo'
            };
        }
    }
    
    // Luego intentar con los patrones configurados
    for (const [nombre, config] of Object.entries(CONFIGURACION_SECCIONES)) {
        for (const patron of config.patrones) {
            if (lineaNormalizada.match(patron)) {
                // Determinar categoría basada en el contenido
                const categoria = determinarCategoriaInciso(lineaNormalizada);
                return {
                    nombre: nombre,
                    ...config,
                    categoria: categoria  // Usar categoría determinada dinámicamente
                };
            }
        }
    }
    
    return null;
}

/**
 * Determina el tipo de documento basado en el texto
 */
function determinarTipoDocumento(texto) {
    if (texto.match(/Dictamen/i)) return 'dictamen';
    if (texto.match(/Iniciativa/i)) return 'iniciativa';
    if (texto.match(/Punto\s+de\s+Acuerdo/i)) return 'punto_acuerdo';
    if (texto.match(/Proposición/i)) return 'proposicion';
    if (texto.match(/Decreto/i)) return 'decreto';
    if (texto.match(/Acuerdo/i)) return 'acuerdo';
    return 'otro';
}

/**
 * Aplica patrones especiales que pueden modificar las características del elemento
 */
function aplicarPatronesEspeciales(elemento, texto) {
    for (const [nombre, config] of Object.entries(PATRONES_ESPECIALES)) {
        for (const patron of config.patrones) {
            if (texto.match(patron)) {
                elemento.caracteristicas_especiales.push(nombre);
                
                if (config.modificaVotacion) {
                    elemento.requiere_votacion = config.requiereVotacion;
                    elemento.tipo_votacion = config.tipoVotacion;
                    elemento.momento_votacion = 'inmediato';
                }
                
                if (config.modificaMayoria) {
                    elemento.tipo_mayoria = config.tipoMayoria;
                }
                
                if (config.esCumplimientoSentencia) {
                    elemento.es_cumplimiento_sentencia = true;
                    elemento.prioridad = config.prioridad;
                }
                
                if (config.esObservacionEjecutivo) {
                    elemento.es_observacion_ejecutivo = true;
                    elemento.requiere_votacion = true;
                    elemento.tipo_votacion = config.tipoVotacion;
                }
                
                if (config.esCeremonial) {
                    elemento.es_ceremonial = true;
                    elemento.requiere_votacion = false;
                }
                
                break;
            }
        }
    }
}

/**
 * Finaliza el procesamiento de un elemento
 */
function finalizarElemento(elemento, texto, listaElementos) {
    // Log de debugging para ver qué categoría se está guardando
    console.log(`📝 Finalizando elemento #${elemento.numero} con categoría: ${elemento.categoria} (inciso: ${elemento.inciso_principal || 'ninguno'})`);
    
    // Limpiar texto
    texto = texto.replace(/\s+/g, ' ').trim();
    
    // Extraer descripción completa (NO título)
    let descripcion = texto;
    
    // Limpiar número del inicio si existe
    descripcion = descripcion.replace(/^\d+\.\s*/, '');
    
    // No limitar la longitud de la descripción para preservar todo el contenido
    // Mantener el texto completo sin cortes
    elemento.titulo = '';  // No usar título
    elemento.descripcion = descripcion;  // Todo el texto va en descripción
    elemento.contenido = texto; // Guardar también el texto original completo
    
    // Extraer presentador y partido
    const matchPresentador = texto.match(/presentad[oa]\s+por\s+(?:el\s+|la\s+)?(?:Diputad[oa]\s+)?([^(,;]+)(?:\s*\(([A-Z]+)\))?/i);
    if (matchPresentador) {
        elemento.presentador = matchPresentador[1] ? matchPresentador[1].trim() : '';
        elemento.partido = matchPresentador[2] ? matchPresentador[2].trim() : '';
        
        // Validar partido
        const partidosValidos = ['PAN', 'PRI', 'PRD', 'MORENA', 'PT', 'PVEM', 'MC', 'PES', 'RSP', 'NA'];
        if (!partidosValidos.includes(elemento.partido)) {
            // Buscar en el texto
            for (const p of partidosValidos) {
                if (texto.includes(`(${p})`)) {
                    elemento.partido = p;
                    break;
                }
            }
        }
    } else {
        elemento.presentador = '';
        elemento.partido = '';
    }
    
    // No limitar la descripción - mantener el texto completo
    // elemento.descripcion ya fue asignado arriba
    
    // Solo agregar si tiene información válida (verificar descripción, no título)
    if (elemento.descripcion && elemento.descripcion.length > 10) {
        listaElementos.push(elemento);
    }
}

/**
 * Genera estadísticas del documento
 */
function generarEstadisticas(elementos) {
    const stats = {
        total: elementos.length,
        requierenVotacion: 0,
        noRequierenVotacion: 0,
        turnoComisiones: 0,
        primeraLectura: 0,
        segundaLectura: 0,
        urgentesObviaResolucion: 0,
        reformasConstitucionales: 0,
        cumplimientoSentencias: 0,
        observacionesEjecutivo: 0,
        ceremoniales: 0,
        porTipoDocumento: {},
        porPartido: {},
        porTipoVotacion: {},
        porTipoMayoria: {
            simple: 0,
            absoluta: 0,
            calificada: 0
        }
    };
    
    elementos.forEach(elem => {
        // Votación
        if (elem.requiere_votacion) {
            stats.requierenVotacion++;
        } else {
            stats.noRequierenVotacion++;
        }
        
        // Tipo de votación
        stats.porTipoVotacion[elem.tipo_votacion] = (stats.porTipoVotacion[elem.tipo_votacion] || 0) + 1;
        
        // Casos especiales
        if (elem.tipo_votacion === 'turno_comision') stats.turnoComisiones++;
        if (elem.tipo_votacion === 'primera_lectura') stats.primeraLectura++;
        if (elem.tipo_votacion === 'votacion_dictamen') stats.segundaLectura++;
        if (elem.tipo_votacion === 'urgente_obvia_resolucion') stats.urgentesObviaResolucion++;
        
        if (elem.es_cumplimiento_sentencia) stats.cumplimientoSentencias++;
        if (elem.es_observacion_ejecutivo) stats.observacionesEjecutivo++;
        if (elem.es_ceremonial) stats.ceremoniales++;
        
        // Reformas constitucionales
        if (elem.caracteristicas_especiales && elem.caracteristicas_especiales.includes('REFORMA_CONSTITUCIONAL')) {
            stats.reformasConstitucionales++;
        }
        
        // Por tipo de documento
        stats.porTipoDocumento[elem.tipo_documento] = 
            (stats.porTipoDocumento[elem.tipo_documento] || 0) + 1;
        
        // Por partido
        if (elem.partido) {
            stats.porPartido[elem.partido] = (stats.porPartido[elem.partido] || 0) + 1;
        }
        
        // Por tipo de mayoría
        if (elem.tipo_mayoria) {
            stats.porTipoMayoria[elem.tipo_mayoria] = (stats.porTipoMayoria[elem.tipo_mayoria] || 0) + 1;
        }
    });
    
    // Calcular porcentajes
    stats.porcentajeVotacion = stats.total > 0 
        ? Math.round((stats.requierenVotacion / stats.total) * 100) 
        : 0;
    
    return stats;
}

/**
 * Función wrapper para compatibilidad con código existente
 * Puede devolver solo el array de elementos o el objeto completo
 */
async function extraerIniciativasCompatible(pdfBuffer, tipo) {
    const resultado = await extraerIniciativasDefinitivo(pdfBuffer);
    
    // Si el código espera solo un array, devolver elementos
    // Para mantener compatibilidad con código existente
    if (resultado && resultado.elementos) {
        // Agregar propiedades del resultado como metadata a los elementos
        resultado.elementos._metadata = {
            estadisticas: resultado.estadisticas,
            metadatos: resultado.metadatos,
            votacionesInmediatas: resultado.votacionesInmediatas
        };
        return resultado.elementos;
    }
    
    return resultado;
}

// Exportar funciones
module.exports = {
    extraerIniciativas: extraerIniciativasDefinitivo,
    extraerIniciativasCompatible,
    extraerIniciativasDefinitivo,
    CONFIGURACION_SECCIONES,
    PATRONES_ESPECIALES
};