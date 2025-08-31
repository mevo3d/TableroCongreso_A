const pdfParse = require('pdf-parse');

/**
 * Extractor definitivo para órdenes del día del Congreso de Morelos
 * Maneja múltiples formatos y detecta automáticamente qué requiere votación
 */

// Configuración de tipos de sección y sus características de votación
// IMPORTANTE: No buscar por incisos (A,B,C,etc) ya que cambian en cada sesión
// Buscar por el CONTENIDO después del inciso
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
        const texto = data.text;
        
        // Detectar tipo de sesión
        const tipoSesion = detectarTipoSesion(texto);
        
        // Extraer estructura completa de incisos
        const estructuraIncisos = extraerEstructuraIncisos(texto);
        
        // Extraer elementos
        const elementos = extraerElementos(texto, tipoSesion);
        
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
 * Retorna un mapa de todos los incisos principales (A, B, C, etc.)
 */
function extraerEstructuraIncisos(texto) {
    const estructura = [];
    const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        
        // Detectar incisos principales con formato: A), B), C), etc.
        const matchIncisoPrincipal = linea.match(/^([A-Z])\)\s+(.+)/);
        if (matchIncisoPrincipal) {
            const letra = matchIncisoPrincipal[1];
            const contenido = matchIncisoPrincipal[2];
            
            // Determinar el tipo de inciso
            let tipoInciso = null;
            let categoria = 'procedimiento';
            let esProcedimiento = true;
            
            // Buscar en configuración de secciones
            for (const [key, config] of Object.entries(CONFIGURACION_SECCIONES)) {
                for (const patron of config.patrones) {
                    if (contenido.match(patron)) {
                        tipoInciso = key;
                        categoria = config.categoria || 'procedimiento';
                        esProcedimiento = config.esProcedimiento !== undefined ? config.esProcedimiento : true;
                        break;
                    }
                }
                if (tipoInciso) break;
            }
            
            estructura.push({
                letra: letra,
                contenido: contenido,
                tipoInciso: tipoInciso,
                categoria: categoria,
                esProcedimiento: esProcedimiento,
                referencia: esProcedimiento ? null : `Ver pestaña ${categoria}`
            });
        }
    }
    
    return estructura;
}

/**
 * Extrae todos los elementos del documento con mejor detección de categorías
 */
function extraerElementos(texto, tipoSesion) {
    const elementos = [];
    const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let seccionActual = null;
    let tipoSeccionActual = null;
    let numeroElemento = 0;
    let elementoActual = null;
    let textoAcumulado = '';
    let procesandoElemento = false;
    let incisos = [];
    let incisoPrincipalActual = null;  // Para rastrear el inciso principal (A, B, C, etc.)
    let categoriaActual = 'procedimiento';  // Categoría actual basada en el inciso
    
    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        
        // Detectar inciso principal (A), B), C), etc.)
        const matchIncisoPrincipal = linea.match(/^([A-Z])\)\s+(.+)/);
        if (matchIncisoPrincipal) {
            incisoPrincipalActual = matchIncisoPrincipal[1];
            const contenidoInciso = matchIncisoPrincipal[2];
            
            // Determinar categoría basada en el contenido del inciso
            categoriaActual = determinarCategoriaInciso(contenidoInciso);
            
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
                procesandoElemento = false;
                elementoActual = null;
                textoAcumulado = '';
                continue;
            }
        }
        
        // Detectar cambio de sección (sin inciso principal)
        const nuevaSeccion = detectarSeccion(linea);
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
        
        // Detectar elementos: pueden ser numerados o empezar con palabras clave
        const matchNumero = linea.match(/^(\d+)\.\s+(.+)/);
        const esDictamen = linea.match(/^(\d+\.\s+)?Dict[aá]m/i);
        const esIniciativa = linea.match(/^(\d+\.\s+)?Iniciativa/i);
        const esProposicion = linea.match(/^(\d+\.\s+)?Proposición/i) || linea.match(/^(\d+\.\s+)?Punto de Acuerdo/i);
        
        // También detectar elementos que empiezan con número romano o letra
        const matchNumeroRomano = linea.match(/^[IVXLCDM]+\.\s+(.+)/);
        const matchLetra = linea.match(/^[a-z]\.\s+(.+)/i);
        
        // Detectar si es un elemento válido basado en la sección actual y el contenido
        const esElementoValido = (matchNumero || esDictamen || esIniciativa || esProposicion || 
                                  (tipoSeccionActual && (matchNumeroRomano || matchLetra))) && 
                                  tipoSeccionActual && 
                                  // Asegurar que no es un título de sección
                                  !linea.match(/^[A-Z]\)\s+/);
        
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
            textoAcumulado = linea;
            incisos = []; // Reiniciar incisos para el nuevo elemento
            
            // Determinar si requiere votación basándose en el contenido
            let requiereVotacionElemento = tipoSeccionActual?.requiereVotacion || false;
            let tipoVotacionElemento = tipoSeccionActual?.tipoVotacion || '';
            let categoriaElemento = tipoSeccionActual?.categoria || 'procedimiento';
            
            // Analizar el contenido para determinar la categoría correcta
            if (esDictamen) {
                // Buscar si es primera o segunda lectura en el texto
                if (linea.match(/primera\s+lectura/i) || linea.match(/1[ae]?r?a?\.\s*lectura/i)) {
                    categoriaElemento = 'primera_lectura';
                    requiereVotacionElemento = false;
                    tipoVotacionElemento = 'primera_lectura';
                } else if (linea.match(/segunda\s+lectura/i) || linea.match(/2[ad]?a?\.\s*lectura/i)) {
                    categoriaElemento = 'segunda_lectura';
                    requiereVotacionElemento = true;
                    tipoVotacionElemento = 'votacion_dictamen';
                } else {
                    // Si es dictamen sin especificar, asumir segunda lectura
                    categoriaElemento = 'segunda_lectura';
                    requiereVotacionElemento = true;
                    tipoVotacionElemento = 'votacion_dictamen';
                }
            }
            // Las iniciativas NO se votan (solo se turnan)
            else if (esIniciativa) {
                categoriaElemento = 'iniciativas';
                requiereVotacionElemento = false;
                tipoVotacionElemento = 'turno_comision';
            }
            // Las proposiciones con punto de acuerdo SÍ se votan
            else if (esProposicion) {
                categoriaElemento = 'puntos_acuerdo';
                requiereVotacionElemento = true;
                tipoVotacionElemento = 'punto_acuerdo';
            }
            
            elementoActual = {
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
                tipo_votacion: tipoVotacionElemento,
                momento_votacion: requiereVotacionElemento ? 'inmediato' : 'no_aplica',
                tipo_mayoria: 'simple',
                prioridad: 'normal',
                caracteristicas_especiales: []
            };
            
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
            // Continuar acumulando texto del elemento actual
            if (linea.match(/^(\d+)\.\s+/)) {
                // Es el siguiente elemento, retroceder
                if (elementoActual && textoAcumulado) {
                    finalizarElemento(elementoActual, textoAcumulado, elementos);
                }
                procesandoElemento = false;
                elementoActual = null;
                textoAcumulado = '';
                i--;
            } else {
                textoAcumulado += ' ' + linea;
                
                // Buscar patrones especiales que modifiquen la votación
                aplicarPatronesEspeciales(elementoActual, linea);
                
                // Limitar acumulación
                if (textoAcumulado.length > 2500) {
                    procesandoElemento = false;
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
    // Limpiar texto
    texto = texto.replace(/\s+/g, ' ').trim();
    
    // Extraer descripción completa (NO título)
    let descripcion = texto;
    
    // Limpiar número del inicio si existe
    descripcion = descripcion.replace(/^\d+\.\s*/, '');
    
    // No limitar la longitud de la descripción para preservar todo el contenido
    // Solo poner la descripción, NO el título
    elemento.titulo = '';  // No usar título
    elemento.descripcion = descripcion;  // Todo el texto va en descripción
    
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
        if (elem.caracteristicas_especiales.includes('REFORMA_CONSTITUCIONAL')) {
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
        stats.porTipoMayoria[elem.tipo_mayoria]++;
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