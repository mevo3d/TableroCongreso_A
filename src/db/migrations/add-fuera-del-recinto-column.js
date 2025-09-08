const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('Agregando columna fuera_del_recinto a la tabla usuarios...');

db.serialize(() => {
    // Verificar si la columna ya existe
    db.all("PRAGMA table_info(usuarios)", (err, columns) => {
        if (err) {
            console.error('Error verificando columnas:', err);
            db.close();
            return;
        }
        
        const columnExists = columns.some(col => col.name === 'fuera_del_recinto');
        
        if (!columnExists) {
            db.run(`
                ALTER TABLE usuarios 
                ADD COLUMN fuera_del_recinto INTEGER DEFAULT 0
            `, (err) => {
                if (err) {
                    console.error('Error agregando columna fuera_del_recinto:', err);
                } else {
                    console.log('✅ Columna fuera_del_recinto agregada exitosamente');
                }
                db.close();
            });
        } else {
            console.log('La columna fuera_del_recinto ya existe');
            db.close();
        }
    });
});