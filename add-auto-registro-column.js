const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('Agregando columna auto_registro a la tabla asistencias...');

// Verificar si la columna ya existe
db.all("PRAGMA table_info(asistencias)", (err, columns) => {
    if (err) {
        console.error('Error verificando columnas:', err);
        db.close();
        return;
    }
    
    const hasAutoRegistro = columns.some(col => col.name === 'auto_registro');
    
    if (!hasAutoRegistro) {
        // Agregar la columna
        db.run(`
            ALTER TABLE asistencias 
            ADD COLUMN auto_registro INTEGER DEFAULT 0
        `, (err) => {
            if (err) {
                console.error('Error agregando columna auto_registro:', err);
            } else {
                console.log('✓ Columna auto_registro agregada exitosamente');
            }
            db.close();
        });
    } else {
        console.log('✓ La columna auto_registro ya existe');
        db.close();
    }
});