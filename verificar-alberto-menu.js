const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Verificando datos de Alberto Sánchez...\n');

db.serialize(() => {
    // Buscar a Alberto Sánchez
    db.all(`
        SELECT 
            d.id,
            d.nombre,
            d.partido,
            d.es_presidente,
            d.es_coordinador,
            d.activo,
            u.id as user_id,
            u.username,
            u.role,
            u.nombre_completo
        FROM diputados d
        LEFT JOIN usuarios u ON u.diputado_id = d.id
        WHERE d.nombre LIKE '%Alberto%' 
           OR d.nombre LIKE '%Sánchez%'
           OR d.nombre LIKE '%Sanchez%'
    `, (err, rows) => {
        if (err) {
            console.error('❌ Error:', err);
            db.close();
            return;
        }
        
        if (rows.length === 0) {
            console.log('⚠️ No se encontró ningún diputado con nombre Alberto o Sánchez');
            
            // Buscar todos los diputados para ver los nombres
            db.all(`SELECT id, nombre, partido FROM diputados ORDER BY nombre`, (err, allDiputados) => {
                if (!err && allDiputados) {
                    console.log('\n📋 Lista de todos los diputados:');
                    allDiputados.forEach(d => {
                        console.log(`  ${d.id}. ${d.nombre} (${d.partido})`);
                    });
                }
                db.close();
            });
            return;
        }
        
        console.log('✅ Datos encontrados:\n');
        rows.forEach(row => {
            console.log('═══════════════════════════════════════');
            console.log(`📌 Diputado: ${row.nombre}`);
            console.log(`   ID: ${row.id}`);
            console.log(`   Partido: ${row.partido}`);
            console.log(`   Es Presidente: ${row.es_presidente ? 'SÍ' : 'NO'}`);
            console.log(`   Es Coordinador: ${row.es_coordinador ? 'SÍ' : 'NO'}`);
            console.log(`   Activo: ${row.activo ? 'SÍ' : 'NO'}`);
            
            if (row.user_id) {
                console.log('\n👤 Usuario asociado:');
                console.log(`   User ID: ${row.user_id}`);
                console.log(`   Username: ${row.username}`);
                console.log(`   Role: ${row.role}`);
                console.log(`   Nombre completo: ${row.nombre_completo}`);
            } else {
                console.log('\n⚠️ NO tiene usuario asociado');
            }
        });
        
        db.close();
    });
});