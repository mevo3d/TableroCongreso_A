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
        patrones: [/^\w\)\s*Comunicaciones/i, /Comunicaciones\./i],
        requiereVotacion: false,
        tipoVotacion: 'informativo',
        descripcion: 'Lectura de comunicaciones'
    },
    'INICIATIVAS': {
        patrones: [
            /^\w\)\s*Iniciativas/i,  // Cualquier letra seguida de ) Iniciativas
            /Iniciativas\./i,  // Iniciativas.
            /Iniciativa con proyecto de decreto/i  // Detectar iniciativas individuales
        ],
        requiereVotacion: false,
        tipoVotacion: 'turno_comision',
        descripcion: 'Presentación y turno a comisiones'
    },
    'DICTAMENES_PRIMERA': {
        patrones: [
            /^\w\)\s*Dictam.*Primera\s+Lectura/i,  // Cualquier letra ) Dictamen/Dictámenes Primera Lectura
            /Primera\s+Lectura/i,  // Primera Lectura en cualquier parte
            /Dictamen.*Primera\s+Lectura/i  // Dictamen... Primera Lectura
        ],
        requiereVotacion: false, // Por defecto no, pero puede cambiar si es urgente
        tipoVotacion: 'primera_lectura',
        descripcion: 'Primera lectura, se vota en próxima sesión'
    },
    'DICTAMENES_PRIMERA_URGENTE': {
        patrones: [/Primera\s+Lectura.*urgente/i, /urgente.*Primera\s+Lectura/i],
        requiereVotacion: true,
        tipoVotacion: 'primera_lectura_urgente',
        descripcion: 'Primera lectura con urgente y obvia resolución'
    },
    'DICTAMENES_SEGUNDA': {
        patrones: [
            /^\w\)\s*Dictám.*Segunda\s+Lectura/i,  // Cualquier letra ) Dictámenes Segunda Lectura
            /Segunda\s+Lectura/i,  // Segunda Lectura en cualquier parte
            /Dictamen emanado de las? Comision/i  // Dictamen emanado de la/las Comisión(es)
        ],
        requiereVotacion: true,
        tipoVotacion: 'votacion_dictamen',
        descripcion: 'Segunda lectura, votación inmediata'
    },
    'PUNTOS_ACUERDO': {
        patrones: [
            /^\w\)\s*Propuestas?\s+de\s+Puntos?\s+de\s+Acuerdo/i,  // Cualquier letra ) Propuestas de Puntos de Acuerdo
            /Puntos?\s+de\s+Acuerdo/i,  // Punto/Puntos de Acuerdo
            /Proposición con Punto de Acuerdo/i  // Proposición con Punto de Acuerdo
        ],
        requiereVotacion: true, // Todos los puntos de acuerdo requieren votación
        tipoVotacion: 'punto_acuerdo',
        descripcion: 'Puntos de acuerdo'
    },
    'PROPOSICIONES': {
        patrones: [/^\w\)\s*Proposiciones/i, /Proposiciones con/i],
        requiereVotacion: false,
        tipoVotacion: 'proposicion',
        descripcion: 'Proposiciones con punto de acuerdo'
    },
    'ASUNTOS_GENERALES': {
        patrones: [/^\w\)\s*Asuntos\s+Generales/i, /Asuntos\s+Generales/i],
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
    let incisos = [];
    
    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        
        // Detectar cambio de sección
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
        const esDictamen = linea.match(/^Dictamen emanado de las?\s+Comisi/i);
        const esIniciativa = linea.match(/^Iniciativa con proyecto de decreto/i);
        const esProposicion = linea.match(/^Proposición con Punto de Acuerdo/i);
        
        if ((matchNumero || esDictamen || esIniciativa || esProposicion) && tipoSeccionActual) {
            // Procesar elemento anterior si existe
            if (elementoActual && textoAcumulado) {
                if (incisos.length > 0) {
                    elementoActual.incisos = incisos;
                }
                finalizarElemento(elementoActual, textoAcumulado, elementos);
            }
            
            // Iniciar nuevo elemento
            if (matchNumero) {
                numeroElemento = parseInt(matchNumero[1]);
            } else {
                numeroElemento++;  // Incrementar si no tiene número explícito
            }
            
            procesandoElemento = true;
            textoAcumulado = linea;
            incisos = []; // Reiniciar incisos para el nuevo elemento
            
            // Determinar si requiere votación basándose en el contenido
            let requiereVotacionElemento = tipoSeccionActual.requiereVotacion;
            let tipoVotacionElemento = tipoSeccionActual.tipoVotacion;
            
            // Los dictámenes en segunda lectura SIEMPRE se votan
            if (esDictamen && seccionActual === 'DICTAMENES_SEGUNDA') {
                requiereVotacionElemento = true;
                tipoVotacionElemento = 'votacion_dictamen';
            }
            // Las iniciativas NO se votan (solo se turnan)
            else if (esIniciativa) {
                requiereVotacionElemento = false;
                tipoVotacionElemento = 'turno_comision';
            }
            // Las proposiciones con punto de acuerdo SÍ se votan
            else if (esProposicion) {
                requiereVotacionElemento = true;
                tipoVotacionElemento = 'punto_acuerdo';
            }
            
            elementoActual = {
                numero: numeroElemento,
                seccion: seccionActual,
                tipo_documento: determinarTipoDocumento(linea),
                requiere_votacion: requiereVotacionElemento,
                tipo_votacion: tipoVotacionElemento,
                momento_votacion: requiereVotacionElemento ? 'inmediato' : 'no_aplica',
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
        if (incisos.length > 0) {
            elementoActual.incisos = incisos;
        }
        finalizarElemento(elementoActual, textoAcumulado, elementos);
    }
    
    return elementos;
}

/**
 * Detecta el tipo de sección de una línea
 * NO depende de los incisos (A,B,C) ya que cambian en cada sesión
 * Busca por el CONTENIDO de la línea
 */
function detectarSeccion(linea) {
    // Buscar por contenido, no por inciso
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
    
    // Si no coincide con ningún patrón de sección, verificar si es un título de sección genérico
    // Esto detecta líneas como: "G) Dictamen de Primera Lectura" o "H) Dictámenes de Segunda Lectura"
    if (linea.match(/^[A-Z]\)\s+/)) {
        // Es un inciso, ahora determinar qué tipo basándose en el contenido
        if (linea.match(/Primera\s+Lectura/i)) {
            return {
                nombre: 'DICTAMENES_PRIMERA',
                ...CONFIGURACION_SECCIONES.DICTAMENES_PRIMERA
            };
        }
        if (linea.match(/Segunda\s+Lectura/i)) {
            return {
                nombre: 'DICTAMENES_SEGUNDA',
                ...CONFIGURACION_SECCIONES.DICTAMENES_SEGUNDA
            };
        }
        if (linea.match(/Iniciativas/i)) {
            return {
                nombre: 'INICIATIVAS',
                ...CONFIGURACION_SECCIONES.INICIATIVAS
            };
        }
        if (linea.match(/Puntos?\s+de\s+Acuerdo/i) || linea.match(/Propuestas?\s+de\s+Puntos/i)) {
            return {
                nombre: 'PUNTOS_ACUERDO',
                ...CONFIGURACION_SECCIONES.PUNTOS_ACUERDO
            };
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