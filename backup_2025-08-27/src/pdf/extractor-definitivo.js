const pdfParse = require('pdf-parse');

/**
 * Extractor definitivo para órdenes del día del Congreso de Morelos
 * Maneja múltiples formatos y detecta automáticamente qué requiere votación
 */

// Configuración de tipos de sección y sus características de votación
const CONFIGURACION_SECCIONES = {
    'PASE_LISTA': {
        patrones: [/Pase de lista/i],
        requiereVotacion: false,
        tipoVotacion: 'no_aplica',
        descripcion: 'Verificación de asistencia'
    },
    'QUORUM': {
        patrones: [/Declaración del quórum/i],
        requiereVotacion: false,
        tipoVotacion: 'no_aplica',
        descripcion: 'Verificación de quórum legal'
    },
    'ORDEN_DIA': {
        patrones: [/Lectura.*orden del día/i, /votación del orden/i],
        requiereVotacion: true,
        tipoVotacion: 'procedimiento',
        descripcion: 'Aprobación del orden del día'
    },
    'ACTA': {
        patrones: [/Aprobación del acta/i],
        requiereVotacion: true,
        tipoVotacion: 'procedimiento',
        descripcion: 'Aprobación del acta de sesión anterior'
    },
    'COMUNICACIONES': {
        patrones: [/Comunicaciones/i],
        requiereVotacion: false,
        tipoVotacion: 'informativo',
        descripcion: 'Lectura de comunicaciones'
    },
    'INICIATIVAS': {
        patrones: [/^[A-Z]\)\s*Iniciativas/i],
        requiereVotacion: false,
        tipoVotacion: 'turno_comision',
        descripcion: 'Presentación y turno a comisiones'
    },
    'DICTAMENES_PRIMERA': {
        patrones: [/Dictámenes.*Primera\s+Lectura/i],
        requiereVotacion: false,
        tipoVotacion: 'primera_lectura',
        descripcion: 'Primera lectura, se vota en próxima sesión'
    },
    'DICTAMENES_SEGUNDA': {
        patrones: [/Dictámenes.*Segunda\s+Lectura/i],
        requiereVotacion: true,
        tipoVotacion: 'votacion_dictamen',
        descripcion: 'Segunda lectura, votación inmediata'
    },
    'PUNTOS_ACUERDO': {
        patrones: [/Puntos?\s+de\s+Acuerdo/i],
        requiereVotacion: false, // Por defecto no, pero puede cambiar si es urgente
        tipoVotacion: 'punto_acuerdo',
        descripcion: 'Puntos de acuerdo'
    },
    'PROPOSICIONES': {
        patrones: [/Proposiciones/i],
        requiereVotacion: false,
        tipoVotacion: 'proposicion',
        descripcion: 'Proposiciones con punto de acuerdo'
    },
    'ASUNTOS_GENERALES': {
        patrones: [/Asuntos\s+Generales/i],
        requiereVotacion: false,
        tipoVotacion: 'informativo',
        descripcion: 'Asuntos generales'
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
        
        // Extraer elementos
        const elementos = extraerElementos(texto, tipoSesion);
        
        // Generar estadísticas y resumen
        const estadisticas = generarEstadisticas(elementos);
        
        // Preparar respuesta
        const resultado = {
            metadatos: {
                paginas: data.numpages,
                tipoSesion: tipoSesion,
                fecha: extraerFecha(texto)
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
 * Extrae todos los elementos del documento
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
    
    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        
        // Detectar cambio de sección
        const nuevaSeccion = detectarSeccion(linea);
        if (nuevaSeccion) {
            // Procesar elemento pendiente si existe
            if (elementoActual && textoAcumulado) {
                finalizarElemento(elementoActual, textoAcumulado, elementos);
            }
            
            seccionActual = nuevaSeccion.nombre;
            tipoSeccionActual = nuevaSeccion;
            procesandoElemento = false;
            elementoActual = null;
            textoAcumulado = '';
            continue;
        }
        
        // Detectar elementos numerados
        const matchNumero = linea.match(/^(\d+)\.\s+(.+)/);
        if (matchNumero && tipoSeccionActual) {
            // Procesar elemento anterior si existe
            if (elementoActual && textoAcumulado) {
                finalizarElemento(elementoActual, textoAcumulado, elementos);
            }
            
            // Iniciar nuevo elemento
            numeroElemento = parseInt(matchNumero[1]);
            procesandoElemento = true;
            textoAcumulado = linea;
            
            elementoActual = {
                numero: numeroElemento,
                seccion: seccionActual,
                tipo_documento: determinarTipoDocumento(linea),
                requiere_votacion: tipoSeccionActual.requiereVotacion,
                tipo_votacion: tipoSeccionActual.tipoVotacion,
                momento_votacion: tipoSeccionActual.requiereVotacion ? 'inmediato' : 'no_aplica',
                tipo_mayoria: 'simple',
                prioridad: 'normal',
                caracteristicas_especiales: []
            };
            
            // En sesiones solemnes o ceremoniales, nada se vota
            if (tipoSesion === 'solemne' || tipoSesion === 'ceremonial') {
                elementoActual.requiere_votacion = false;
                elementoActual.tipo_votacion = 'ceremonial';
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
        finalizarElemento(elementoActual, textoAcumulado, elementos);
    }
    
    return elementos;
}

/**
 * Detecta el tipo de sección de una línea
 */
function detectarSeccion(linea) {
    // Primero verificar si es una línea de sección (formato A) B) etc.)
    if (!linea.match(/^[A-Z]\)/)) {
        return null;
    }
    
    for (const [nombre, config] of Object.entries(CONFIGURACION_SECCIONES)) {
        for (const patron of config.patrones) {
            if (linea.match(patron)) {
                return {
                    nombre: nombre,
                    ...config
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
    
    // Extraer título
    let titulo = texto;
    const indicePresenta = texto.search(/presentad[oa]\s+por/i);
    if (indicePresenta > 0) {
        titulo = texto.substring(0, indicePresenta).trim();
    }
    
    // Limpiar número del título
    titulo = titulo.replace(/^\d+\.\s*/, '');
    
    // Limitar longitud
    if (titulo.length > 300) {
        titulo = titulo.substring(0, 297) + '...';
    }
    
    elemento.titulo = titulo;
    
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
    
    // Descripción
    elemento.descripcion = texto.length > 500 ? texto.substring(0, 497) + '...' : texto;
    
    // Solo agregar si tiene información válida
    if (elemento.titulo && elemento.titulo.length > 10) {
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

// Exportar funciones
module.exports = {
    extraerIniciativas: extraerIniciativasDefinitivo,
    extraerIniciativasDefinitivo,
    CONFIGURACION_SECCIONES,
    PATRONES_ESPECIALES
};