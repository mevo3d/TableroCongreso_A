const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

/**
 * Analiza múltiples PDFs para identificar patrones y diferencias
 */
async function analizarTodosPDFs() {
    const carpetaPDFs = path.join(__dirname, 'pdfs-ejemplo');
    const archivos = fs.readdirSync(carpetaPDFs).filter(f => f.endsWith('.pdf'));
    
    console.log('🔍 ANÁLISIS COMPARATIVO DE ÓRDENES DEL DÍA\n');
    console.log(`Analizando ${archivos.length} archivos PDF...\n`);
    console.log('='.repeat(80));
    
    const resultados = [];
    
    for (const archivo of archivos) {
        console.log(`\n📄 Analizando: ${archivo}`);
        console.log('-'.repeat(60));
        
        try {
            const pdfPath = path.join(carpetaPDFs, archivo);
            const dataBuffer = fs.readFileSync(pdfPath);
            const data = await pdfParse(dataBuffer);
            
            const analisis = analizarEstructura(data.text, archivo);
            resultados.push(analisis);
            
            // Mostrar resumen del análisis
            console.log(`✓ Páginas: ${data.numpages}`);
            console.log(`✓ Secciones encontradas:`);
            Object.entries(analisis.secciones).forEach(([seccion, info]) => {
                if (info.encontrada) {
                    console.log(`  - ${seccion}: ${info.cantidad} elementos`);
                }
            });
            
            // Mostrar patrones únicos encontrados
            if (analisis.patronesUnicos.length > 0) {
                console.log(`✓ Patrones especiales:`);
                analisis.patronesUnicos.forEach(patron => {
                    console.log(`  - ${patron}`);
                });
            }
            
        } catch (error) {
            console.error(`❌ Error procesando ${archivo}:`, error.message);
        }
    }
    
    // Análisis comparativo
    console.log('\n' + '='.repeat(80));
    console.log('📊 ANÁLISIS COMPARATIVO\n');
    
    // Identificar patrones comunes
    const patronesComunes = identificarPatronesComunes(resultados);
    console.log('PATRONES COMUNES EN TODOS LOS DOCUMENTOS:');
    patronesComunes.forEach(patron => {
        console.log(`  ✓ ${patron}`);
    });
    
    // Identificar diferencias
    console.log('\nDIFERENCIAS ENCONTRADAS:');
    resultados.forEach(resultado => {
        if (resultado.diferencias.length > 0) {
            console.log(`\n  ${resultado.archivo}:`);
            resultado.diferencias.forEach(dif => {
                console.log(`    - ${dif}`);
            });
        }
    });
    
    // Estadísticas de votación
    console.log('\n📊 ESTADÍSTICAS DE VOTACIÓN:');
    resultados.forEach(resultado => {
        const porcentajeVotacion = resultado.estadisticas.requierenVotacion > 0 
            ? Math.round((resultado.estadisticas.requierenVotacion / resultado.estadisticas.totalElementos) * 100)
            : 0;
        
        console.log(`\n  ${resultado.archivo}:`);
        console.log(`    - Total elementos: ${resultado.estadisticas.totalElementos}`);
        console.log(`    - Requieren votación: ${resultado.estadisticas.requierenVotacion} (${porcentajeVotacion}%)`);
        console.log(`    - Se turnan a comisiones: ${resultado.estadisticas.turnanComisiones}`);
        console.log(`    - Primera lectura: ${resultado.estadisticas.primeraLectura}`);
    });
    
    // Generar recomendaciones
    console.log('\n' + '='.repeat(80));
    console.log('💡 RECOMENDACIONES PARA EL EXTRACTOR:\n');
    generarRecomendaciones(resultados);
}

/**
 * Analiza la estructura de un texto de PDF
 */
function analizarEstructura(texto, nombreArchivo) {
    const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    const resultado = {
        archivo: nombreArchivo,
        secciones: {
            'Pase de lista': { encontrada: false, cantidad: 0 },
            'Iniciativas': { encontrada: false, cantidad: 0 },
            'Dictámenes Primera Lectura': { encontrada: false, cantidad: 0 },
            'Dictámenes Segunda Lectura': { encontrada: false, cantidad: 0 },
            'Puntos de Acuerdo': { encontrada: false, cantidad: 0 },
            'Proposiciones': { encontrada: false, cantidad: 0 },
            'Comunicaciones': { encontrada: false, cantidad: 0 },
            'Asuntos Generales': { encontrada: false, cantidad: 0 }
        },
        patronesUnicos: [],
        diferencias: [],
        estadisticas: {
            totalElementos: 0,
            requierenVotacion: 0,
            turnanComisiones: 0,
            primeraLectura: 0
        }
    };
    
    let seccionActual = '';
    let contadorElementos = 0;
    
    for (const linea of lineas) {
        // Detectar secciones principales
        if (linea.match(/^[A-Z]\)\s+/)) {
            // Identificar tipo de sección
            if (linea.match(/Pase de lista/i)) {
                seccionActual = 'Pase de lista';
                resultado.secciones['Pase de lista'].encontrada = true;
            } else if (linea.match(/Iniciativas/i)) {
                seccionActual = 'Iniciativas';
                resultado.secciones['Iniciativas'].encontrada = true;
            } else if (linea.match(/Dictámenes.*Primera/i)) {
                seccionActual = 'Dictámenes Primera Lectura';
                resultado.secciones['Dictámenes Primera Lectura'].encontrada = true;
            } else if (linea.match(/Dictámenes.*Segunda/i)) {
                seccionActual = 'Dictámenes Segunda Lectura';
                resultado.secciones['Dictámenes Segunda Lectura'].encontrada = true;
            } else if (linea.match(/Puntos? de Acuerdo/i)) {
                seccionActual = 'Puntos de Acuerdo';
                resultado.secciones['Puntos de Acuerdo'].encontrada = true;
            } else if (linea.match(/Proposiciones/i)) {
                seccionActual = 'Proposiciones';
                resultado.secciones['Proposiciones'].encontrada = true;
            } else if (linea.match(/Comunicaciones/i)) {
                seccionActual = 'Comunicaciones';
                resultado.secciones['Comunicaciones'].encontrada = true;
            } else if (linea.match(/Asuntos Generales/i)) {
                seccionActual = 'Asuntos Generales';
                resultado.secciones['Asuntos Generales'].encontrada = true;
            }
        }
        
        // Contar elementos numerados
        if (linea.match(/^(\d+)\.\s+/)) {
            contadorElementos++;
            if (seccionActual && resultado.secciones[seccionActual]) {
                resultado.secciones[seccionActual].cantidad++;
            }
            
            // Determinar si requiere votación
            resultado.estadisticas.totalElementos++;
            
            if (seccionActual === 'Dictámenes Segunda Lectura') {
                resultado.estadisticas.requierenVotacion++;
            } else if (seccionActual === 'Iniciativas') {
                resultado.estadisticas.turnanComisiones++;
            } else if (seccionActual === 'Dictámenes Primera Lectura') {
                resultado.estadisticas.primeraLectura++;
            } else if (linea.match(/urgente.*resolución/i)) {
                resultado.estadisticas.requierenVotacion++;
            }
        }
        
        // Buscar patrones especiales
        if (linea.match(/urgente.*obvia.*resolución/i)) {
            if (!resultado.patronesUnicos.includes('Urgente y obvia resolución')) {
                resultado.patronesUnicos.push('Urgente y obvia resolución');
            }
        }
        
        if (linea.match(/dispensa.*trámite/i)) {
            if (!resultado.patronesUnicos.includes('Dispensa de trámite')) {
                resultado.patronesUnicos.push('Dispensa de trámite');
            }
        }
        
        if (linea.match(/mayoría.*calificada/i)) {
            if (!resultado.patronesUnicos.includes('Mayoría calificada')) {
                resultado.patronesUnicos.push('Mayoría calificada');
            }
        }
        
        if (linea.match(/reforma.*constitucional/i)) {
            if (!resultado.patronesUnicos.includes('Reforma constitucional')) {
                resultado.patronesUnicos.push('Reforma constitucional');
            }
        }
        
        if (linea.match(/cumplimiento.*ejecutoria/i)) {
            if (!resultado.patronesUnicos.includes('Cumplimiento de ejecutoria')) {
                resultado.patronesUnicos.push('Cumplimiento de ejecutoria');
            }
        }
        
        if (linea.match(/observaciones.*ejecutivo/i)) {
            if (!resultado.patronesUnicos.includes('Observaciones del Ejecutivo')) {
                resultado.patronesUnicos.push('Observaciones del Ejecutivo');
            }
        }
        
        // Detectar formatos especiales
        if (linea.match(/SESIÓN SOLEMNE/i)) {
            if (!resultado.patronesUnicos.includes('Sesión solemne')) {
                resultado.patronesUnicos.push('Sesión solemne');
            }
        }
        
        if (linea.match(/mérito|presea|reconocimiento/i)) {
            if (!resultado.patronesUnicos.includes('Entrega de reconocimientos')) {
                resultado.patronesUnicos.push('Entrega de reconocimientos');
            }
        }
    }
    
    return resultado;
}

/**
 * Identifica patrones comunes entre todos los documentos
 */
function identificarPatronesComunes(resultados) {
    const patrones = [];
    
    // Secciones que aparecen en todos
    const seccionesComunes = ['Iniciativas', 'Dictámenes Primera Lectura', 'Dictámenes Segunda Lectura'];
    
    seccionesComunes.forEach(seccion => {
        const enTodos = resultados.every(r => r.secciones[seccion] && r.secciones[seccion].encontrada);
        if (enTodos) {
            patrones.push(`Sección "${seccion}" presente en todos`);
        }
    });
    
    // Estructura de numeración
    const todosNumerados = resultados.every(r => r.estadisticas.totalElementos > 0);
    if (todosNumerados) {
        patrones.push('Todos usan numeración decimal (1. 2. 3. etc.)');
    }
    
    // Formato de secciones
    const todosUsanLetras = resultados.every(r => {
        return Object.keys(r.secciones).some(s => r.secciones[s].encontrada);
    });
    if (todosUsanLetras) {
        patrones.push('Todos usan letras mayúsculas para secciones (A) B) C) etc.)');
    }
    
    return patrones;
}

/**
 * Genera recomendaciones basadas en el análisis
 */
function generarRecomendaciones(resultados) {
    const recomendaciones = [];
    
    // Verificar variabilidad en secciones
    const seccionesVariables = new Set();
    resultados.forEach(r => {
        Object.keys(r.secciones).forEach(s => {
            if (r.secciones[s].encontrada) {
                seccionesVariables.add(s);
            }
        });
    });
    
    recomendaciones.push(`1. El extractor debe manejar ${seccionesVariables.size} tipos diferentes de secciones`);
    
    // Verificar patrones especiales
    const patronesEspeciales = new Set();
    resultados.forEach(r => {
        r.patronesUnicos.forEach(p => patronesEspeciales.add(p));
    });
    
    if (patronesEspeciales.size > 0) {
        recomendaciones.push(`2. Implementar detección para ${patronesEspeciales.size} patrones especiales:`);
        patronesEspeciales.forEach(p => {
            recomendaciones.push(`   - ${p}`);
        });
    }
    
    // Verificar rangos de elementos
    const minElementos = Math.min(...resultados.map(r => r.estadisticas.totalElementos));
    const maxElementos = Math.max(...resultados.map(r => r.estadisticas.totalElementos));
    
    recomendaciones.push(`3. El extractor debe manejar entre ${minElementos} y ${maxElementos} elementos por sesión`);
    
    // Verificar proporción de votaciones
    const porcentajesVotacion = resultados.map(r => 
        r.estadisticas.totalElementos > 0 
            ? (r.estadisticas.requierenVotacion / r.estadisticas.totalElementos) * 100 
            : 0
    );
    const promVotacion = Math.round(porcentajesVotacion.reduce((a, b) => a + b, 0) / porcentajesVotacion.length);
    
    recomendaciones.push(`4. En promedio, ${promVotacion}% de los elementos requieren votación inmediata`);
    
    // Casos especiales
    const tieneSesionSolemne = resultados.some(r => r.patronesUnicos.includes('Sesión solemne'));
    if (tieneSesionSolemne) {
        recomendaciones.push('5. Implementar manejo especial para sesiones solemnes (no votación)');
    }
    
    const tieneReconocimientos = resultados.some(r => r.patronesUnicos.includes('Entrega de reconocimientos'));
    if (tieneReconocimientos) {
        recomendaciones.push('6. Detectar entregas de reconocimientos/preseas (ceremonial, no votación)');
    }
    
    recomendaciones.forEach(rec => console.log(`  ${rec}`));
}

// Ejecutar análisis
analizarTodosPDFs().catch(console.error);