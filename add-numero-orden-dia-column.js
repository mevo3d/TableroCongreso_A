const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('Agregando columna numero_orden_dia a la tabla iniciativas...');

db.run(`
    ALTER TABLE iniciativas 
    ADD COLUMN numero_orden_dia INTEGER
`, (err) => {
    if (err) {
        if (err.message.includes('duplicate column name')) {
            console.log('✓ La columna numero_orden_dia ya existe');
        } else {
            console.error('Error agregando columna:', err.message);
        }
    } else {
        console.log('✅ Columna numero_orden_dia agregada exitosamente');
    }
    
    // Verificar estructura de la tabla
    db.all("PRAGMA table_info(iniciativas)", (err, columns) => {
        if (err) {
            console.error('Error obteniendo información de la tabla:', err);
        } else {
            console.log('\nColumnas actuales en la tabla iniciativas:');
            columns.forEach(col => {
                console.log(`  - ${col.name} (${col.type})`);
            });
        }
        
        db.close((err) => {
            if (err) {
                console.error('Error cerrando la base de datos:', err);
            } else {
                console.log('\n✅ Base de datos actualizada correctamente');
            }
        });
    });
});