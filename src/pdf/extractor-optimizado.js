const pdfParse = require('pdf-parse');

/**
 * Extrae iniciativas y dictámenes de un archivo PDF del Congreso de Morelos
 * Optimizado para el formato específico de las órdenes del día
 */
async function extraerIniciativasOptimizado(pdfBuffer) {
    try {
        const iniciativas = [];
        
        // Parsear el PDF
        const data = await pdfParse(pdfBuffer);
        const texto = data.text;
        
        // Dividir el texto en líneas
        const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        // Variables para rastrear la sección actual
        let seccionActual = '';
        let numeroIniciativa = 0;
        let procesandoIniciativa = false;
        let iniciativaActual = null;
        let textoAcumulado = '';
        
        for (let i = 0; i < lineas.length; i++) {
            const linea = lineas[i];
            const lineaSiguiente = i < lineas.length - 1 ? lineas[i + 1] : '';
            
            // Detectar secciones principales
            if (linea.match(/^[A-Z]\)\s+/)) {
                // Es una sección principal (A), B), C), etc.)
                seccionActual = linea;
                procesandoIniciativa = false;
                continue;
            }
            
            // Detectar inicio de sección de Iniciativas
            if (linea.match(/^F\)\s*Iniciativas/i)) {
                seccionActual = 'INICIATIVAS';
                procesandoIniciativa = false;
                continue;
            }
            
            // Detectar inicio de sección de Dictámenes
            if (linea.match(/^G\)\s*Dictámenes\s+de\s+Primera\s+Lectura/i)) {
                seccionActual = 'DICTAMENES_PRIMERA';
                procesandoIniciativa = false;
                continue;
            }
            
            if (linea.match(/^H\)\s*Dictámenes\s+de\s+Segunda\s+Lectura/i)) {
                seccionActual = 'DICTAMENES_SEGUNDA';
                procesandoIniciativa = false;
                continue;
            }
            
            // Buscar iniciativas numeradas (formato: "1. Iniciativa...")
            const matchIniciativa = linea.match(/^(\d+)\.\s+(Iniciativa\s+con\s+proyecto\s+de\s+decreto|Dictamen\s+emanado)/i);
            
            if (matchIniciativa) {
                // Si había una iniciativa previa, guardarla
                if (iniciativaActual && textoAcumulado) {
                    procesarIniciativa(iniciativaActual, textoAcumulado, iniciativas);
                }
                
                // Iniciar nueva iniciativa
                numeroIniciativa = parseInt(matchIniciativa[1]);
                procesandoIniciativa = true;
                textoAcumulado = linea;
                
                // Determinar tipo
                let tipo = 'iniciativa';
                if (linea.match(/Dictamen/i)) {
                    tipo = 'dictamen';
                }
                
                iniciativaActual = {
                    numero: numeroIniciativa,
                    tipo_iniciativa: tipo,
                    seccion: seccionActual,
                    tipo_mayoria: 'simple'
                };
                
            } else if (procesandoIniciativa) {
                // Continuar acumulando texto de la iniciativa actual
                // Detener si encontramos el siguiente número
                if (linea.match(/^(\d+)\.\s+/)) {
                    // Es el inicio de la siguiente iniciativa
                    if (iniciativaActual && textoAcumulado) {
                        procesarIniciativa(iniciativaActual, textoAcumulado, iniciativas);
                    }
                    procesandoIniciativa = false;
                    iniciativaActual = null;
                    textoAcumulado = '';
                    i--; // Retroceder para procesar esta línea en la siguiente iteración
                } else {
                    // Acumular texto
                    textoAcumulado += ' ' + linea;
                    
                    // Limitar la cantidad de texto acumulado
                    if (textoAcumulado.length > 1500) {
                        procesandoIniciativa = false;
                    }
                }
            }
        }
        
        // Procesar la última iniciativa si existe
        if (iniciativaActual && textoAcumulado) {
            procesarIniciativa(iniciativaActual, textoAcumulado, iniciativas);
        }
        
        // Ordenar por número
        iniciativas.sort((a, b) => a.numero - b.numero);
        
        console.log(`✅ Extraídas ${iniciativas.length} iniciativas/dictámenes del PDF`);
        return iniciativas;
        
    } catch (error) {
        console.error('Error extrayendo iniciativas del PDF:', error);
        throw new Error('No se pudo procesar el archivo PDF: ' + error.message);
    }
}

/**
 * Procesa el texto de una iniciativa para extraer información detallada
 */
function procesarIniciativa(iniciativa, texto, listaIniciativas) {
    // Limpiar el texto
    texto = texto.replace(/\s+/g, ' ').trim();
    
    // Extraer título (todo antes de "presentada por" o hasta 200 caracteres)
    let titulo = texto;
    const indicePresenta = texto.search(/presentad[oa]\s+por/i);
    if (indicePresenta > 0) {
        titulo = texto.substring(0, indicePresenta).trim();
    }
    
    // Limpiar el número del inicio del título
    titulo = titulo.replace(/^\d+\.\s*/, '');
    
    // Limitar longitud del título
    if (titulo.length > 200) {
        titulo = titulo.substring(0, 197) + '...';
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
    
    // Si no se encontró partido en paréntesis, buscar en el contexto
    if (!partido && presentador) {
        const partidos = ['PAN', 'PRI', 'PRD', 'MORENA', 'PT', 'PVEM', 'MC', 'PES', 'RSP'];
        for (const p of partidos) {
            if (texto.includes(`(${p})`)) {
                partido = p;
                break;
            }
        }
    }
    
    iniciativa.presentador = presentador;
    iniciativa.partido = partido;
    
    // Generar descripción (primeros 300 caracteres del texto completo)
    iniciativa.descripcion = texto.length > 300 ? texto.substring(0, 297) + '...' : texto;
    
    // Determinar tipo de mayoría basado en palabras clave
    if (texto.match(/mayoría\s+calificada|dos\s+terceras\s+partes/i)) {
        iniciativa.tipo_mayoria = 'calificada';
    } else if (texto.match(/mayoría\s+absoluta/i)) {
        iniciativa.tipo_mayoria = 'absoluta';
    } else if (texto.match(/unanimidad/i)) {
        iniciativa.tipo_mayoria = 'unanime';
    }
    
    // Agregar a la lista solo si tiene información válida
    if (iniciativa.titulo && iniciativa.titulo.length > 10) {
        listaIniciativas.push(iniciativa);
    }
}

/**
 * Función principal que decide qué extractor usar
 */
async function extraerIniciativas(pdfBuffer) {
    // Usar el extractor optimizado
    return await extraerIniciativasOptimizado(pdfBuffer);
}

/**
 * Valida si un buffer es un PDF válido
 */
function validarPDF(buffer) {
    // Verificar header de PDF
    const header = buffer.slice(0, 5).toString();
    return header === '%PDF-';
}

/**
 * Extrae metadatos del PDF
 */
async function extraerMetadatos(pdfBuffer) {
    try {
        const data = await pdfParse(pdfBuffer);
        
        return {
            numPaginas: data.numpages,
            info: data.info,
            metadata: data.metadata,
            version: data.version,
            texto: data.text.substring(0, 1000) // Primeros 1000 caracteres
        };
    } catch (error) {
        console.error('Error extrayendo metadatos:', error);
        return null;
    }
}

module.exports = {
    extraerIniciativas,
    extraerIniciativasOptimizado,
    validarPDF,
    extraerMetadatos
};