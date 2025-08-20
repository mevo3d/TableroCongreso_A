const pdfParse = require('pdf-parse');

/**
 * Extrae iniciativas y dictámenes de un archivo PDF del Congreso
 * Identifica cuáles requieren votación y cuáles son solo informativos
 */
async function extraerIniciativasConVotacion(pdfBuffer) {
    try {
        const iniciativas = [];
        
        // Parsear el PDF
        const data = await pdfParse(pdfBuffer);
        const texto = data.text;
        
        // Dividir el texto en líneas
        const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        // Variables para rastrear la sección actual
        let seccionActual = '';
        let tipoSeccion = '';
        let numeroIniciativa = 0;
        let procesandoIniciativa = false;
        let iniciativaActual = null;
        let textoAcumulado = '';
        
        for (let i = 0; i < lineas.length; i++) {
            const linea = lineas[i];
            
            // Detectar secciones principales y determinar si requieren votación
            if (linea.match(/^[A-Z]\)\s+/)) {
                seccionActual = linea;
                procesandoIniciativa = false;
                
                // Determinar si la sección requiere votación
                if (linea.match(/Pase de lista/i)) {
                    tipoSeccion = 'NO_VOTACION';
                } else if (linea.match(/Declaración del quórum/i)) {
                    tipoSeccion = 'NO_VOTACION';
                } else if (linea.match(/Lectura.*orden del día/i)) {
                    tipoSeccion = 'VOTACION_PROCEDIMIENTO';
                } else if (linea.match(/Aprobación del acta/i)) {
                    tipoSeccion = 'VOTACION_PROCEDIMIENTO';
                } else if (linea.match(/Comunicaciones/i)) {
                    tipoSeccion = 'INFORMATIVO';
                } else if (linea.match(/Iniciativas/i)) {
                    tipoSeccion = 'TURNO_COMISIONES'; // Las iniciativas se turnan, no se votan
                } else if (linea.match(/Dictámenes.*Primera Lectura/i)) {
                    tipoSeccion = 'PRIMERA_LECTURA'; // Primera lectura no se vota
                } else if (linea.match(/Dictámenes.*Segunda Lectura/i)) {
                    tipoSeccion = 'VOTACION_DICTAMEN'; // Segunda lectura SÍ se vota
                } else if (linea.match(/Proposiciones|Puntos de Acuerdo/i)) {
                    tipoSeccion = 'VOTACION_URGENTE'; // Pueden votarse si son de urgente resolución
                } else if (linea.match(/Asuntos Generales/i)) {
                    tipoSeccion = 'INFORMATIVO';
                }
                continue;
            }
            
            // Detectar inicio de sección de Iniciativas
            if (linea.match(/^F\)\s*Iniciativas/i)) {
                seccionActual = 'INICIATIVAS';
                tipoSeccion = 'TURNO_COMISIONES';
                procesandoIniciativa = false;
                continue;
            }
            
            // Detectar inicio de sección de Dictámenes
            if (linea.match(/^G\)\s*Dictámenes\s+de\s+Primera\s+Lectura/i)) {
                seccionActual = 'DICTAMENES_PRIMERA';
                tipoSeccion = 'PRIMERA_LECTURA';
                procesandoIniciativa = false;
                continue;
            }
            
            if (linea.match(/^H\)\s*Dictámenes\s+de\s+Segunda\s+Lectura/i)) {
                seccionActual = 'DICTAMENES_SEGUNDA';
                tipoSeccion = 'VOTACION_DICTAMEN';
                procesandoIniciativa = false;
                continue;
            }
            
            // Buscar iniciativas/dictámenes numerados
            const matchIniciativa = linea.match(/^(\d+)\.\s+(Iniciativa|Dictamen|Punto de Acuerdo|Proposición)/i);
            
            if (matchIniciativa) {
                // Si había una iniciativa previa, guardarla
                if (iniciativaActual && textoAcumulado) {
                    procesarIniciativaConVotacion(iniciativaActual, textoAcumulado, iniciativas);
                }
                
                // Iniciar nueva iniciativa
                numeroIniciativa = parseInt(matchIniciativa[1]);
                procesandoIniciativa = true;
                textoAcumulado = linea;
                
                // Determinar tipo de documento
                let tipoDocumento = 'iniciativa';
                if (linea.match(/Dictamen/i)) {
                    tipoDocumento = 'dictamen';
                } else if (linea.match(/Punto de Acuerdo/i)) {
                    tipoDocumento = 'punto_acuerdo';
                } else if (linea.match(/Proposición/i)) {
                    tipoDocumento = 'proposicion';
                }
                
                // Determinar si requiere votación
                let requiereVotacion = false;
                let tipoVotacion = 'no_aplica';
                let momentoVotacion = '';
                
                if (tipoSeccion === 'VOTACION_DICTAMEN') {
                    requiereVotacion = true;
                    tipoVotacion = 'dictamen_segunda_lectura';
                    momentoVotacion = 'inmediato';
                } else if (tipoSeccion === 'TURNO_COMISIONES') {
                    requiereVotacion = false;
                    tipoVotacion = 'turno_comision';
                    momentoVotacion = 'no_aplica';
                } else if (tipoSeccion === 'PRIMERA_LECTURA') {
                    requiereVotacion = false;
                    tipoVotacion = 'primera_lectura';
                    momentoVotacion = 'proxima_sesion';
                } else if (tipoSeccion === 'VOTACION_URGENTE' || linea.match(/urgente.*resolución/i)) {
                    requiereVotacion = true;
                    tipoVotacion = 'urgente_obvia_resolucion';
                    momentoVotacion = 'inmediato';
                }
                
                iniciativaActual = {
                    numero: numeroIniciativa,
                    tipo_documento: tipoDocumento,
                    seccion: seccionActual,
                    tipo_seccion: tipoSeccion,
                    requiere_votacion: requiereVotacion,
                    tipo_votacion: tipoVotacion,
                    momento_votacion: momentoVotacion,
                    tipo_mayoria: 'simple'
                };
                
            } else if (procesandoIniciativa) {
                // Continuar acumulando texto
                if (linea.match(/^(\d+)\.\s+/)) {
                    // Es el inicio de la siguiente iniciativa
                    if (iniciativaActual && textoAcumulado) {
                        procesarIniciativaConVotacion(iniciativaActual, textoAcumulado, iniciativas);
                    }
                    procesandoIniciativa = false;
                    iniciativaActual = null;
                    textoAcumulado = '';
                    i--; // Retroceder para procesar esta línea
                } else {
                    // Acumular texto
                    textoAcumulado += ' ' + linea;
                    
                    // Buscar indicadores especiales de votación
                    if (linea.match(/urgente.*resolución|obvia.*resolución/i)) {
                        if (iniciativaActual) {
                            iniciativaActual.requiere_votacion = true;
                            iniciativaActual.tipo_votacion = 'urgente_obvia_resolucion';
                            iniciativaActual.momento_votacion = 'inmediato';
                        }
                    }
                    
                    if (linea.match(/mayoría\s+calificada|dos\s+terceras\s+partes/i)) {
                        if (iniciativaActual) {
                            iniciativaActual.tipo_mayoria = 'calificada';
                        }
                    }
                    
                    // Limitar texto acumulado
                    if (textoAcumulado.length > 2000) {
                        procesandoIniciativa = false;
                    }
                }
            }
        }
        
        // Procesar la última iniciativa
        if (iniciativaActual && textoAcumulado) {
            procesarIniciativaConVotacion(iniciativaActual, textoAcumulado, iniciativas);
        }
        
        // Ordenar por número
        iniciativas.sort((a, b) => a.numero - b.numero);
        
        // Generar resumen
        const resumen = generarResumenVotacion(iniciativas);
        
        console.log(`✅ Extraídas ${iniciativas.length} iniciativas/dictámenes`);
        console.log(`📊 Requieren votación: ${resumen.requieren_votacion}`);
        console.log(`📋 Se turnan a comisiones: ${resumen.turno_comisiones}`);
        console.log(`📖 Primera lectura: ${resumen.primera_lectura}`);
        
        return {
            iniciativas,
            resumen
        };
        
    } catch (error) {
        console.error('Error extrayendo iniciativas:', error);
        throw new Error('No se pudo procesar el archivo PDF: ' + error.message);
    }
}

/**
 * Procesa el texto de una iniciativa y determina sus características de votación
 */
function procesarIniciativaConVotacion(iniciativa, texto, listaIniciativas) {
    // Limpiar el texto
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
    if (titulo.length > 250) {
        titulo = titulo.substring(0, 247) + '...';
    }
    
    iniciativa.titulo = titulo;
    
    // Extraer presentador y partido
    let presentador = '';
    let partido = '';
    
    const matchPresentador = texto.match(/presentad[oa]\s+por\s+(?:el\s+|la\s+)?(?:Diputad[oa]\s+)?([^(,;]+)(?:\s*\(([A-Z]+)\))?/i);
    if (matchPresentador) {
        presentador = matchPresentador[1] ? matchPresentador[1].trim() : '';
        partido = matchPresentador[2] ? matchPresentador[2].trim() : '';
    }
    
    // Buscar partido en contexto si no se encontró
    if (!partido && presentador) {
        const partidos = ['PAN', 'PRI', 'PRD', 'MORENA', 'PT', 'PVEM', 'MC', 'PES', 'RSP', 'NA'];
        for (const p of partidos) {
            if (texto.includes(`(${p})`)) {
                partido = p;
                break;
            }
        }
    }
    
    iniciativa.presentador = presentador;
    iniciativa.partido = partido;
    
    // Descripción
    iniciativa.descripcion = texto.length > 400 ? texto.substring(0, 397) + '...' : texto;
    
    // Análisis adicional del contenido para determinar características especiales
    
    // Verificar si es reforma constitucional (requiere mayoría calificada)
    if (texto.match(/reforma.*constitución|constitucional/i)) {
        iniciativa.tipo_mayoria = 'calificada';
        iniciativa.es_reforma_constitucional = true;
    }
    
    // Verificar si es ley de ingresos o presupuesto
    if (texto.match(/ley de ingresos|presupuesto de egresos/i)) {
        iniciativa.es_presupuestal = true;
    }
    
    // Verificar si menciona dispensa de trámite
    if (texto.match(/dispensa.*trámite|dispensa.*turno/i)) {
        iniciativa.requiere_votacion = true;
        iniciativa.tipo_votacion = 'dispensa_tramite';
        iniciativa.momento_votacion = 'inmediato';
    }
    
    // Verificar cumplimiento de sentencias (usualmente se votan de inmediato)
    if (texto.match(/cumplimiento.*ejecutoria|cumplimiento.*sentencia|amparo/i)) {
        iniciativa.es_cumplimiento_sentencia = true;
        if (iniciativa.tipo_seccion === 'VOTACION_DICTAMEN') {
            iniciativa.prioridad = 'alta';
        }
    }
    
    // Verificar si son observaciones del Ejecutivo
    if (texto.match(/observaciones.*ejecutivo|observaciones.*gobernador/i)) {
        iniciativa.es_observacion_ejecutivo = true;
        iniciativa.requiere_votacion = true;
        iniciativa.tipo_votacion = 'observaciones';
    }
    
    // Agregar solo si tiene información válida
    if (iniciativa.titulo && iniciativa.titulo.length > 10) {
        listaIniciativas.push(iniciativa);
    }
}

/**
 * Genera un resumen de las votaciones requeridas
 */
function generarResumenVotacion(iniciativas) {
    const resumen = {
        total: iniciativas.length,
        requieren_votacion: 0,
        turno_comisiones: 0,
        primera_lectura: 0,
        segunda_lectura: 0,
        urgente_resolucion: 0,
        reformas_constitucionales: 0,
        cumplimiento_sentencias: 0,
        observaciones_ejecutivo: 0,
        por_tipo_documento: {},
        por_partido: {},
        votaciones_inmediatas: []
    };
    
    iniciativas.forEach(init => {
        // Contar por tipo de votación
        if (init.requiere_votacion) {
            resumen.requieren_votacion++;
            
            if (init.momento_votacion === 'inmediato') {
                resumen.votaciones_inmediatas.push({
                    numero: init.numero,
                    titulo: init.titulo.substring(0, 80) + '...',
                    tipo: init.tipo_votacion,
                    mayoria: init.tipo_mayoria
                });
            }
        }
        
        if (init.tipo_votacion === 'turno_comision') {
            resumen.turno_comisiones++;
        }
        
        if (init.tipo_votacion === 'primera_lectura') {
            resumen.primera_lectura++;
        }
        
        if (init.tipo_votacion === 'dictamen_segunda_lectura') {
            resumen.segunda_lectura++;
        }
        
        if (init.tipo_votacion === 'urgente_obvia_resolucion') {
            resumen.urgente_resolucion++;
        }
        
        // Contar especiales
        if (init.es_reforma_constitucional) {
            resumen.reformas_constitucionales++;
        }
        
        if (init.es_cumplimiento_sentencia) {
            resumen.cumplimiento_sentencias++;
        }
        
        if (init.es_observacion_ejecutivo) {
            resumen.observaciones_ejecutivo++;
        }
        
        // Por tipo de documento
        resumen.por_tipo_documento[init.tipo_documento] = 
            (resumen.por_tipo_documento[init.tipo_documento] || 0) + 1;
        
        // Por partido
        if (init.partido) {
            resumen.por_partido[init.partido] = 
                (resumen.por_partido[init.partido] || 0) + 1;
        }
    });
    
    return resumen;
}

/**
 * Función principal exportada
 */
async function extraerIniciativas(pdfBuffer) {
    return await extraerIniciativasConVotacion(pdfBuffer);
}

module.exports = {
    extraerIniciativas,
    extraerIniciativasConVotacion
};