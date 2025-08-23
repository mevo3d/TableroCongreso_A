const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('📋 Verificando estructura de tabla sesiones_precargadas...\n');

db.serialize(() => {
    // Obtener información de columnas
    db.all(`PRAGMA table_info(sesiones_precargadas)`, (err, columns) => {
        if (err) {
            console.error('Error:', err);
            return;
        }
        
        console.log('Columnas actuales:');
        console.log('==================');
        columns.forEach(col => {
            console.log(`${col.cid}. ${col.name} (${col.type}) ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
        });
        
        console.log('\n');
        
        // Obtener el SQL de creación
        db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='sesiones_precargadas'`, (err, row) => {
            if (err) {
                console.error('Error:', err);
                return;
            }
            
            if (row) {
                console.log('SQL de creación actual:');
                console.log('=======================');
                console.log(row.sql);
            }
            
            db.close();
        });
    });
});