const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('Agregando columnas para registro de llegadas tardías...');

// Columnas a agregar
const columnsToAdd = [
    // En tabla asistencias
    { table: 'asistencias', name: 'llegada_tardia', type: 'INTEGER DEFAULT 0' },
    { table: 'asistencias', name: 'hora_llegada_tardia', type: 'DATETIME' },
    // En tabla pase_lista
    { table: 'pase_lista', name: 'pase_lista_confirmado', type: 'INTEGER DEFAULT 0' },
    { table: 'pase_lista', name: 'hora_confirmacion_pase', type: 'DATETIME' }
];

let completed = 0;

columnsToAdd.forEach(column => {
    db.all(`PRAGMA table_info(${column.table})`, (err, columns) => {
        if (err) {
            console.error(`Error verificando columna ${column.name} en ${column.table}:`, err);
            completed++;
            if (completed === columnsToAdd.length) db.close();
            return;
        }
        
        const exists = columns.some(col => col.name === column.name);
        
        if (!exists) {
            db.run(`ALTER TABLE ${column.table} ADD COLUMN ${column.name} ${column.type}`, (err) => {
                if (err) {
                    console.error(`Error agregando columna ${column.name} en ${column.table}:`, err);
                } else {
                    console.log(`✓ Columna ${column.name} agregada a tabla ${column.table}`);
                }
                completed++;
                if (completed === columnsToAdd.length) db.close();
            });
        } else {
            console.log(`✓ La columna ${column.name} ya existe en ${column.table}`);
            completed++;
            if (completed === columnsToAdd.length) db.close();
        }
    });
});