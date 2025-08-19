const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('\n===== COORDINADORES POR PARTIDO =====\n');

db.all(`
    SELECT nombre_completo, partido, cargo_coordinador 
    FROM usuarios 
    WHERE cargo_coordinador IS NOT NULL AND cargo_coordinador != ''
    ORDER BY partido, nombre_completo
`, [], (err, rows) => {
    if (err) {
        console.error('Error:', err);
        db.close();
        return;
    }
    
    console.log('Coordinadores encontrados:');
    rows.forEach(row => {
        console.log(`- ${row.partido}: ${row.nombre_completo} (${row.cargo_coordinador})`);
    });
    
    console.log('\n===== TODOS LOS DIPUTADOS POR PARTIDO =====\n');
    
    db.all(`
        SELECT partido, nombre_completo, cargo_coordinador
        FROM usuarios 
        WHERE role = 'diputado'
        ORDER BY partido, nombre_completo
    `, [], (err, diputados) => {
        if (err) {
            console.error('Error:', err);
            db.close();
            return;
        }
        
        const porPartido = {};
        diputados.forEach(dip => {
            if (!porPartido[dip.partido]) {
                porPartido[dip.partido] = [];
            }
            porPartido[dip.partido].push({
                nombre: dip.nombre_completo,
                esCoordinador: dip.cargo_coordinador ? `✓ (${dip.cargo_coordinador})` : ''
            });
        });
        
        Object.keys(porPartido).sort().forEach(partido => {
            console.log(`\n${partido}:`);
            porPartido[partido].forEach(dip => {
                console.log(`  - ${dip.nombre} ${dip.esCoordinador}`);
            });
        });
        
        db.close();
    });
});