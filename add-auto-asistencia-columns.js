const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('Agregando columnas de auto-asistencia a la tabla sesiones...');

// Verificar y agregar columnas una por una
const columnsToAdd = [
    { name: 'auto_asistencia_habilitada', type: 'INTEGER DEFAULT 0' },
    { name: 'auto_asistencia_iniciada_por', type: 'INTEGER' },
    { name: 'auto_asistencia_tipo_usuario', type: 'TEXT' }
];

let completed = 0;

columnsToAdd.forEach(column => {
    db.all("PRAGMA table_info(sesiones)", (err, columns) => {
        if (err) {
            console.error(`Error verificando columna ${column.name}:`, err);
            completed++;
            if (completed === columnsToAdd.length) db.close();
            return;
        }
        
        const exists = columns.some(col => col.name === column.name);
        
        if (!exists) {
            db.run(`ALTER TABLE sesiones ADD COLUMN ${column.name} ${column.type}`, (err) => {
                if (err) {
                    console.error(`Error agregando columna ${column.name}:`, err);
                } else {
                    console.log(`✓ Columna ${column.name} agregada exitosamente`);
                }
                completed++;
                if (completed === columnsToAdd.length) db.close();
            });
        } else {
            console.log(`✓ La columna ${column.name} ya existe`);
            completed++;
            if (completed === columnsToAdd.length) db.close();
        }
    });
});