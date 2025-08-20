const fs = require('fs');
const path = require('path');
const { extraerIniciativas } = require('./src/pdf/extractor');

async function probarExtractor() {
    try {
        console.log('🔍 Probando extractor mejorado con el PDF del Congreso...\n');
        
        const pdfPath = path.join(__dirname, 'test-orden.pdf');
        const pdfBuffer = fs.readFileSync(pdfPath);
        
        console.log('📄 Extrayendo iniciativas del PDF...\n');
        const iniciativas = await extraerIniciativas(pdfBuffer);
        
        console.log(`✅ Se encontraron ${iniciativas.length} iniciativas/dictámenes\n`);
        
        if (iniciativas.length > 0) {
            console.log('=== DETALLE DE INICIATIVAS ENCONTRADAS ===\n');
            
            iniciativas.forEach((iniciativa, index) => {
                console.log(`\n--- INICIATIVA #${iniciativa.numero} ---`);
                console.log(`Título: ${iniciativa.titulo}`);
                console.log(`Tipo: ${iniciativa.tipo_iniciativa}`);
                console.log(`Presentador: ${iniciativa.presentador || 'No identificado'}`);
                console.log(`Partido: ${iniciativa.partido || 'No identificado'}`);
                console.log(`Tipo de Mayoría: ${iniciativa.tipo_mayoria}`);
                
                if (iniciativa.descripcion && iniciativa.descripcion.length > 100) {
                    console.log(`Descripción: ${iniciativa.descripcion.substring(0, 100)}...`);
                }
                console.log('------------------------');
            });
            
            // Resumen estadístico
            console.log('\n\n=== RESUMEN ESTADÍSTICO ===');
            const porTipo = {};
            const porPartido = {};
            
            iniciativas.forEach(init => {
                // Contar por tipo
                porTipo[init.tipo_iniciativa] = (porTipo[init.tipo_iniciativa] || 0) + 1;
                
                // Contar por partido
                if (init.partido) {
                    porPartido[init.partido] = (porPartido[init.partido] || 0) + 1;
                }
            });
            
            console.log('\nPor tipo de documento:');
            Object.entries(porTipo).forEach(([tipo, cantidad]) => {
                console.log(`  ${tipo}: ${cantidad}`);
            });
            
            console.log('\nPor partido político:');
            Object.entries(porPartido).forEach(([partido, cantidad]) => {
                console.log(`  ${partido}: ${cantidad}`);
            });
            
            // Verificar si hay secciones específicas
            const tieneIniciativas = iniciativas.some(i => i.tipo_iniciativa === 'iniciativa');
            const tieneDictamenes = iniciativas.some(i => i.tipo_iniciativa === 'dictamen');
            
            console.log('\n=== SECCIONES DETECTADAS ===');
            if (tieneIniciativas) console.log('✓ Iniciativas');
            if (tieneDictamenes) console.log('✓ Dictámenes');
            
        } else {
            console.log('⚠️ No se encontraron iniciativas. Posible problema con el formato del PDF.');
        }
        
    } catch (error) {
        console.error('❌ Error al probar el extractor:', error.message);
        console.error(error.stack);
    }
}

probarExtractor();