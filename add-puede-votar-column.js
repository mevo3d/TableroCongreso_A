const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('Agregando columna puede_votar a la tabla usuarios...');

// Verificar si la columna ya existe
db.all("PRAGMA table_info(usuarios)", (err, columns) => {
    if (err) {
        console.error('Error verificando columnas:', err);
        db.close();
        return;
    }
    
    const hasPuedeVotar = columns.some(col => col.name === 'puede_votar');
    
    if (!hasPuedeVotar) {
        // Agregar la columna con valor por defecto 1 (todos pueden votar inicialmente)
        db.run(`
            ALTER TABLE usuarios 
            ADD COLUMN puede_votar INTEGER DEFAULT 1
        `, (err) => {
            if (err) {
                console.error('Error agregando columna puede_votar:', err);
            } else {
                console.log('✓ Columna puede_votar agregada exitosamente');
                
                // Establecer todos los diputados actuales como habilitados para votar
                db.run(`
                    UPDATE usuarios 
                    SET puede_votar = 1 
                    WHERE role = 'diputado'
                `, (err) => {
                    if (err) {
                        console.error('Error actualizando puede_votar:', err);
                    } else {
                        console.log('✓ Todos los diputados habilitados para votar');
                    }
                    db.close();
                });
            }
        });
    } else {
        console.log('✓ La columna puede_votar ya existe');
        db.close();
    }
});