const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Agregando columna tipo_iniciativa a iniciativas_precargadas...\n');

db.serialize(() => {
    // Primero verificar la estructura actual
    db.all(`PRAGMA table_info(iniciativas_precargadas)`, (err, columns) => {
        if (err) {
            console.error('❌ Error obteniendo información de tabla:', err);
            db.close();
            return;
        }
        
        console.log('📋 Columnas actuales:');
        columns.forEach(col => {
            console.log(`  - ${col.name} (${col.type})`);
        });
        
        // Verificar si la columna ya existe
        const tipoIniciativaExists = columns.some(col => col.name === 'tipo_iniciativa');
        
        if (tipoIniciativaExists) {
            console.log('\n✅ La columna tipo_iniciativa ya existe');
            db.close();
            return;
        }
        
        // Agregar la columna si no existe
        console.log('\n➕ Agregando columna tipo_iniciativa...');
        
        db.run(`
            ALTER TABLE iniciativas_precargadas 
            ADD COLUMN tipo_iniciativa TEXT
        `, (err) => {
            if (err) {
                console.error('❌ Error agregando columna:', err);
                db.close();
                return;
            }
            
            console.log('✅ Columna tipo_iniciativa agregada exitosamente');
            
            // Verificar la estructura actualizada
            db.all(`PRAGMA table_info(iniciativas_precargadas)`, (err, newColumns) => {
                if (!err && newColumns) {
                    console.log('\n📋 Estructura actualizada:');
                    newColumns.forEach(col => {
                        console.log(`  - ${col.name} (${col.type})`);
                    });
                }
                
                db.close();
                console.log('\n✨ Proceso completado');
            });
        });
    });
});