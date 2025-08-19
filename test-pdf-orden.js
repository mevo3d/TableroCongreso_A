const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');

// Lista de posibles archivos PDF del orden del día
const posiblesPDFs = [
    'C:\\Users\\BALERION\\Downloads\\ORDEN DEL DÍA 19 JUNIO 2025 (1).pdf',
    'C:\\Users\\BALERION\\Downloads\\ORDEN DEL DIA 19 JUNIO 2025 (1).pdf',
    'C:\\Users\\BALERION\\Downloads\\ORDEN DEL DÍA 05 JUNIO 2025 sesion ordinaria.pdf',
    'C:\\Users\\BALERION\\Downloads\\ORDEN DEL DIA 05 JUNIO 2025 sesion ordinaria.pdf'
];

async function leerPDF() {
    // Intentar con diferentes encodings del nombre
    for (const rutaPDF of posiblesPDFs) {
        try {
            console.log(`Intentando leer: ${rutaPDF}`);
            
            if (fs.existsSync(rutaPDF)) {
                const dataBuffer = fs.readFileSync(rutaPDF);
                const pdfData = await pdfParse(dataBuffer);
                
                console.log('\n========== CONTENIDO DEL PDF ==========\n');
                console.log(pdfData.text);
                console.log('\n========== FIN DEL CONTENIDO ==========\n');
                
                // Guardar el texto en un archivo para análisis
                fs.writeFileSync('orden_dia_texto.txt', pdfData.text);
                console.log('Texto guardado en orden_dia_texto.txt');
                
                return pdfData.text;
            }
        } catch (error) {
            console.log(`Error con ${rutaPDF}: ${error.message}`);
        }
    }
    
    // Si ninguno funciona, buscar cualquier PDF con "ORDEN" en el nombre
    console.log('\nBuscando PDFs con ORDEN en el nombre...');
    const downloadsDir = 'C:\\Users\\BALERION\\Downloads';
    const files = fs.readdirSync(downloadsDir);
    
    for (const file of files) {
        if (file.includes('ORDEN') && file.endsWith('.pdf')) {
            const fullPath = path.join(downloadsDir, file);
            console.log(`Encontrado: ${file}`);
            
            try {
                const dataBuffer = fs.readFileSync(fullPath);
                const pdfData = await pdfParse(dataBuffer);
                
                console.log('\n========== CONTENIDO DEL PDF ==========\n');
                console.log(pdfData.text.substring(0, 5000)); // Primeros 5000 caracteres
                console.log('\n... [CONTENIDO TRUNCADO] ...\n');
                
                // Guardar el texto completo
                fs.writeFileSync('orden_dia_texto.txt', pdfData.text);
                console.log('Texto completo guardado en orden_dia_texto.txt');
                
                // Buscar iniciativas
                const lineas = pdfData.text.split('\n');
                console.log('\n========== INICIATIVAS ENCONTRADAS ==========\n');
                
                let iniciativasEncontradas = false;
                for (let i = 0; i < lineas.length; i++) {
                    const linea = lineas[i];
                    if (linea.toLowerCase().includes('dictamen') || 
                        linea.toLowerCase().includes('iniciativa') ||
                        linea.toLowerCase().includes('decreto') ||
                        linea.toLowerCase().includes('reforma')) {
                        console.log(`Línea ${i}: ${linea}`);
                        iniciativasEncontradas = true;
                    }
                }
                
                if (!iniciativasEncontradas) {
                    console.log('No se encontraron iniciativas explícitas');
                }
                
                return pdfData.text;
            } catch (error) {
                console.log(`Error leyendo ${file}: ${error.message}`);
            }
        }
    }
    
    console.log('No se pudo leer ningún PDF del orden del día');
}

// Ejecutar
leerPDF().catch(console.error);