const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');

async function analizarPDF() {
    try {
        const pdfPath = path.join(__dirname, 'test-orden.pdf');
        const dataBuffer = fs.readFileSync(pdfPath);
        
        console.log('📄 Analizando PDF...\n');
        
        const data = await pdfParse(dataBuffer);
        
        console.log('=== INFORMACIÓN DEL PDF ===');
        console.log(`Páginas: ${data.numpages}`);
        console.log(`Versión PDF: ${data.version}`);
        console.log('\n=== CONTENIDO COMPLETO ===\n');
        console.log(data.text);
        
        console.log('\n\n=== ANÁLISIS DE PATRONES ===\n');
        
        // Dividir por líneas
        const lineas = data.text.split('\n');
        console.log(`Total de líneas: ${lineas.length}\n`);
        
        // Buscar líneas que parezcan iniciativas
        console.log('POSIBLES INICIATIVAS ENCONTRADAS:\n');
        lineas.forEach((linea, index) => {
            // Buscar líneas numeradas
            if (linea.match(/^\s*\d+[\.\-\)]\s+/)) {
                console.log(`Línea ${index + 1}: ${linea.substring(0, 100)}`);
            }
            // Buscar palabras clave
            if (linea.match(/iniciativa|dictamen|punto de acuerdo|decreto|proyecto/i)) {
                console.log(`Línea ${index + 1} (palabra clave): ${linea.substring(0, 100)}`);
            }
        });
        
        // Buscar secciones específicas
        console.log('\n\n=== SECCIONES DEL DOCUMENTO ===\n');
        const secciones = [
            /orden del día/i,
            /lectura y aprobación/i,
            /comunicaciones/i,
            /iniciativas/i,
            /dictámenes/i,
            /proposiciones/i,
            /puntos de acuerdo/i,
            /asuntos generales/i
        ];
        
        secciones.forEach(patron => {
            lineas.forEach((linea, index) => {
                if (linea.match(patron)) {
                    console.log(`Sección encontrada en línea ${index + 1}: ${linea}`);
                }
            });
        });
        
    } catch (error) {
        console.error('Error:', error);
    }
}

analizarPDF();