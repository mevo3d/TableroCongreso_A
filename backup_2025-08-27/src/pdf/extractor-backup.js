const pdfParse = require('pdf-parse');

/**
 * Extrae iniciativas de un archivo PDF
 * Busca patrones comunes en documentos legislativos
 */
async function extraerIniciativas(pdfBuffer, tipo = 'pdf') {
    try {
        const iniciativas = [];
        
        // Parsear el PDF
        const data = await pdfParse(pdfBuffer);
        const texto = data.text;
        
        // Patrones mejorados para buscar iniciativas y dictámenes
        const patronesIniciativa = [
            // Patrón 1: "1. Iniciativa con proyecto de decreto..."
            /(\d+)\s*\.\s*Iniciativa\s+con\s+proyecto\s+de\s+decreto([^;]+(?:;[^\n]+)?)/gi,
            // Patrón 2: "INICIATIVA No. X"
            /INICIATIVA\s+No\.\s*(\d+)[:\s]+([^\n]+)/gi,
            // Patrón 3: "Punto de Acuerdo"
            /(\d+)\s*[.-]\s*Punto\s+de\s+Acuerdo[:\s]+([^\n]+)/gi,
            // Patrón 4: "Dictamen emanado de la Comisión..."
            /(\d+)\s*\.\s*Dictamen\s+emanado\s+de\s+la\s+Comisión[^,]+,\s*([^\n]+)/gi,
            // Patrón 5: Formato numerado simple con punto
            /^(\d+)\s*\.\s+([A-Z][^\n]{20,})/gm
        ];
        
        // Buscar iniciativas con diferentes patrones
        let numeroIniciativa = 1;
        const iniciativasEncontradas = new Set();
        
        for (const patron of patronesIniciativa) {
            let match;
            const regex = new RegExp(patron);
            
            while ((match = regex.exec(texto)) !== null) {
                const numero = parseInt(match[1]) || numeroIniciativa++;
                const titulo = match[2] ? match[2].trim() : match[0].trim();
                
                // Limpiar el título antes de procesar
                let tituloLimpio = titulo.replace(/\s+/g, ' ').trim();
                
                // Evitar duplicados
                const clave = `${numero}-${tituloLimpio.substring(0, 50)}`;
                if (!iniciativasEncontradas.has(clave) && tituloLimpio.length > 10) {
                    iniciativasEncontradas.add(clave);
                    
                    // Extraer informaci�n adicional del contexto
                    const contextoInicio = Math.max(0, match.index - 200);
                    const contextoFin = Math.min(texto.length, match.index + match[0].length + 500);
                    const contexto = texto.substring(contextoInicio, contextoFin);
                    
                    // Buscar presentador mejorado para formato del documento
                    let presentador = '';
                    const patronesPresentador = [
                        /presentad[oa]\s+por\s+(?:el\s+|la\s+)?(?:Diputad[oa]\s+)?([^(]+)\s*\(/i,
                        /presentad[oa]\s+por\s+(?:el\s+|la\s+)?(?:Diputad[oa]\s+)?([^,]+)/i,
                        /(?:promovente|diputad[oa])\s*:?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)/i
                    ];
                    
                    for (const patron of patronesPresentador) {
                        const matchPresentador = contexto.match(patron);
                        if (matchPresentador) {
                            presentador = matchPresentador[1].trim();
                            break;
                        }
                    }
                    
                    // Buscar partido mejorado
                    let partido = '';
                    const patronesPartido = [
                        /\(([A-Z]+(?:\s*-?\s*[A-Z]+)*)\)/,  // Buscar siglas entre paréntesis
                        /(?:partido|fracción|grupo\s+parlamentario)\s*:?\s*([A-Z]+(?:\s*-\s*[A-Z]+)*)/i
                    ];
                    
                    for (const patron of patronesPartido) {
                        const matchPartido = contexto.match(patron);
                        if (matchPartido) {
                            partido = matchPartido[1].trim();
                            // Validar que sea un partido conocido
                            if (partido.match(/^(PAN|PRI|PRD|MORENA|PT|PVEM|MC|PES|RSP|PANAL|NA)$/)) {
                                break;
                            }
                        }
                    }
                    
                    // Determinar tipo de mayor�a basado en palabras clave
                    let tipoMayoria = 'simple';
                    if (contexto.match(/mayor�a\s+calificada|dos\s+terceras\s+partes/i)) {
                        tipoMayoria = 'calificada';
                    } else if (contexto.match(/mayor�a\s+absoluta/i)) {
                        tipoMayoria = 'absoluta';
                    } else if (contexto.match(/unanimidad/i)) {
                        tipoMayoria = 'unanime';
                    }
                    
                    // Determinar tipo de iniciativa mejorado
                    let tipoIniciativa = 'ordinaria';
                    if (tituloLimpio.match(/punto\s+de\s+acuerdo/i)) {
                        tipoIniciativa = 'punto_acuerdo';
                    } else if (tituloLimpio.match(/decreto/i)) {
                        tipoIniciativa = 'decreto';
                    } else if (tituloLimpio.match(/dictamen/i)) {
                        tipoIniciativa = 'dictamen';
                    } else if (tituloLimpio.match(/iniciativa/i)) {
                        tipoIniciativa = 'iniciativa';
                    }
                    
                    // Limpiar caracteres especiales del título
                    tituloLimpio = tituloLimpio
                        .replace(/[^\w\sÁÉÍÓÚÑáéíóúñ.,;:()\-]/g, '')
                        .trim();
                    
                    if (tituloLimpio.length > 200) {
                        tituloLimpio = tituloLimpio.substring(0, 197) + '...';
                    }
                    
                    // Generar descripción del contexto
                    let descripcion = contexto
                        .replace(/\s+/g, ' ')
                        .replace(/[^\w\sÁÉÍÓÚÑáéíóúñ.,;:()\-]/g, '')
                        .trim();
                    
                    if (descripcion.length > 500) {
                        descripcion = descripcion.substring(0, 497) + '...';
                    }
                    
                    iniciativas.push({
                        numero: numero,
                        titulo: tituloLimpio,
                        descripcion: descripcion,
                        presentador: presentador,
                        partido: partido,
                        tipo_mayoria: tipoMayoria,
                        tipo_iniciativa: tipoIniciativa
                    });
                }
            }
        }
        
        // Si no se encontraron suficientes iniciativas, buscar con método alternativo
        if (iniciativas.length < 5) {
            const lineas = texto.split('\n');
            let numeroActual = 1;
            
            for (let i = 0; i < lineas.length; i++) {
                const linea = lineas[i].trim();
                
                // Buscar líneas que parezcan títulos de iniciativas o dictámenes
                if (linea.length > 20 && linea.length < 500) {
                    // Verificar si empieza con número y punto
                    const matchNumero = linea.match(/^(\d+)\s*\./);
                    if (matchNumero && (linea.match(/Iniciativa|Dictamen|decreto|reforma/i))) {
                        numeroActual = parseInt(matchNumero[1]);
                        const tituloIniciativa = linea.replace(/^\d+\s*\.\s*/, '').trim();
                        
                        if (tituloIniciativa.length > 10) {
                            // Buscar descripción y presentador en las siguientes líneas
                            let descripcion = '';
                            let presentador = '';
                            let partido = '';
                            
                            for (let j = i + 1; j < Math.min(i + 10, lineas.length); j++) {
                                const lineaSiguiente = lineas[j].trim();
                                if (lineaSiguiente.length > 0 && !lineaSiguiente.match(/^\d+\s*\./)) {
                                    descripcion += lineaSiguiente + ' ';
                                    
                                    // Buscar presentador y partido
                                    if (lineaSiguiente.match(/presentad[oa]\s+por/i)) {
                                        const matchPres = lineaSiguiente.match(/presentad[oa]\s+por\s+(?:el\s+|la\s+)?(?:Diputad[oa]\s+)?([^(]+)(?:\(([A-Z]+)\))?/i);
                                        if (matchPres) {
                                            presentador = matchPres[1] ? matchPres[1].trim() : '';
                                            partido = matchPres[2] ? matchPres[2].trim() : '';
                                        }
                                    }
                                } else {
                                    break;
                                }
                            }
                            
                            // Determinar tipo basado en el título
                            let tipoIniciativa = 'ordinaria';
                            if (tituloIniciativa.match(/dictamen/i)) {
                                tipoIniciativa = 'dictamen';
                            } else if (tituloIniciativa.match(/decreto/i)) {
                                tipoIniciativa = 'decreto';
                            } else if (tituloIniciativa.match(/iniciativa/i)) {
                                tipoIniciativa = 'iniciativa';
                            }
                            
                            // Solo agregar si no está duplicado
                            const clave = `${numeroActual}-${tituloIniciativa.substring(0, 50)}`;
                            const yaExiste = iniciativas.some(init => 
                                init.titulo.substring(0, 50) === tituloIniciativa.substring(0, 50)
                            );
                            
                            if (!yaExiste) {
                                iniciativas.push({
                                    numero: numeroActual,
                                    titulo: tituloIniciativa.substring(0, 200),
                                    descripcion: descripcion.substring(0, 500),
                                    presentador: presentador || '',
                                    partido: partido || '',
                                    tipo_mayoria: 'simple',
                                    tipo_iniciativa: tipoIniciativa
                                });
                            }
                            
                            numeroActual++;
                        }
                    }
                    // Tambi�n buscar iniciativas sin numeraci�n expl�cita
                    else if (linea.match(/^(INICIATIVA|PUNTO\s+DE\s+ACUERDO|DICTAMEN|PROYECTO)/i)) {
                        iniciativas.push({
                            numero: numeroActual++,
                            titulo: linea.substring(0, 200),
                            descripcion: '',
                            presentador: '',
                            partido: '',
                            tipo_mayoria: 'simple',
                            tipo_iniciativa: linea.match(/PUNTO\s+DE\s+ACUERDO/i) ? 'punto_acuerdo' : 'ordinaria'
                        });
                    }
                }
            }
        }
        
        // Ordenar por n�mero
        iniciativas.sort((a, b) => a.numero - b.numero);
        
        // Renumerar consecutivamente si es necesario
        iniciativas.forEach((init, index) => {
            init.numero = index + 1;
        });
        
        console.log(` Extra�das ${iniciativas.length} iniciativas del PDF`);
        return iniciativas;
        
    } catch (error) {
        console.error('Error extrayendo iniciativas del PDF:', error);
        throw new Error('No se pudo procesar el archivo PDF: ' + error.message);
    }
}

/**
 * Valida si un buffer es un PDF v�lido
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
    validarPDF,
    extraerMetadatos
};