const fs = require('fs');
const path = require('path');
const { extraerIniciativas } = require('./src/pdf/extractor');

/**
 * Prueba el extractor con todos los PDFs de ejemplo
 */
async function probarExtractorFinal() {
    console.log('🚀 PRUEBA FINAL DEL EXTRACTOR DE PDFs\n');
    console.log('='.repeat(80));
    
    const carpetaPDFs = path.join(__dirname, 'pdfs-ejemplo');
    const archivos = fs.readdirSync(carpetaPDFs).filter(f => f.endsWith('.pdf'));
    
    for (const archivo of archivos) {
        console.log(`\n\n📄 PROCESANDO: ${archivo}`);
        console.log('-'.repeat(60));
        
        try {
            const pdfPath = path.join(carpetaPDFs, archivo);
            const pdfBuffer = fs.readFileSync(pdfPath);
            
            const resultado = await extraerIniciativas(pdfBuffer);
            
            // Mostrar metadatos
            console.log('\n📋 METADATOS:');
            console.log(`   Páginas: ${resultado.metadatos.paginas}`);
            console.log(`   Tipo de sesión: ${resultado.metadatos.tipoSesion}`);
            console.log(`   Fecha: ${resultado.metadatos.fecha || 'No detectada'}`);
            
            // Mostrar estadísticas
            console.log('\n📊 ESTADÍSTICAS:');
            console.log(`   Total elementos: ${resultado.estadisticas.total}`);
            console.log(`   Requieren votación: ${resultado.estadisticas.requierenVotacion} (${resultado.estadisticas.porcentajeVotacion}%)`);
            console.log(`   No requieren votación: ${resultado.estadisticas.noRequierenVotacion}`);
            
            // Desglose por tipo
            console.log('\n   Desglose por acción:');
            console.log(`   - Turno a comisiones: ${resultado.estadisticas.turnoComisiones}`);
            console.log(`   - Primera lectura: ${resultado.estadisticas.primeraLectura}`);
            console.log(`   - Segunda lectura (VOTAN): ${resultado.estadisticas.segundaLectura}`);
            console.log(`   - Urgente resolución (VOTAN): ${resultado.estadisticas.urgentesObviaResolucion}`);
            
            // Casos especiales
            if (resultado.estadisticas.reformasConstitucionales > 0) {
                console.log(`\n   ⚠️ Reformas constitucionales: ${resultado.estadisticas.reformasConstitucionales} (requieren mayoría calificada)`);
            }
            if (resultado.estadisticas.cumplimientoSentencias > 0) {
                console.log(`   ⚖️ Cumplimiento de sentencias: ${resultado.estadisticas.cumplimientoSentencias}`);
            }
            if (resultado.estadisticas.observacionesEjecutivo > 0) {
                console.log(`   📝 Observaciones del Ejecutivo: ${resultado.estadisticas.observacionesEjecutivo}`);
            }
            if (resultado.estadisticas.ceremoniales > 0) {
                console.log(`   🎖️ Elementos ceremoniales: ${resultado.estadisticas.ceremoniales}`);
            }
            
            // Votaciones inmediatas
            if (resultado.votacionesInmediatas.length > 0) {
                console.log('\n🗳️ VOTACIONES INMEDIATAS REQUERIDAS:');
                resultado.votacionesInmediatas.slice(0, 5).forEach((votacion, index) => {
                    console.log(`\n   ${index + 1}. [#${votacion.numero}] ${votacion.titulo}`);
                    console.log(`      Tipo: ${votacion.tipo} | Mayoría: ${votacion.mayoria} | Prioridad: ${votacion.prioridad}`);
                });
                
                if (resultado.votacionesInmediatas.length > 5) {
                    console.log(`\n   ... y ${resultado.votacionesInmediatas.length - 5} votaciones más`);
                }
            } else {
                console.log('\n✓ No hay votaciones inmediatas en esta sesión');
            }
            
            // Distribución por partido (si hay datos)
            if (Object.keys(resultado.estadisticas.porPartido).length > 0) {
                console.log('\n🏛️ DISTRIBUCIÓN POR PARTIDO:');
                Object.entries(resultado.estadisticas.porPartido).forEach(([partido, cantidad]) => {
                    console.log(`   ${partido}: ${cantidad}`);
                });
            }
            
        } catch (error) {
            console.error(`\n❌ Error procesando ${archivo}:`, error.message);
        }
    }
    
    console.log('\n\n' + '='.repeat(80));
    console.log('✅ PRUEBA COMPLETADA');
    console.log('\nEl extractor está listo para identificar:');
    console.log('  • Qué elementos requieren votación inmediata');
    console.log('  • Qué elementos se turnan a comisiones');
    console.log('  • Qué elementos son de primera lectura');
    console.log('  • Mayorías especiales (calificada para reformas constitucionales)');
    console.log('  • Casos especiales (cumplimiento de sentencias, observaciones, etc.)');
    console.log('  • Sesiones ceremoniales que no requieren votación');
}

// Ejecutar prueba
probarExtractorFinal().catch(console.error);