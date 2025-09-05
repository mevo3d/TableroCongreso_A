const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('Agregando columna registrado_por a asistencia_diputados...');

db.serialize(() => {
    // Verificar si la columna ya existe
    db.all("PRAGMA table_info(asistencia_diputados)", (err, columns) => {
        if (err) {
            console.error('Error verificando columnas:', err);
            return;
        }
        
        const hasRegistradoPor = columns.some(col => col.name === 'registrado_por');
        const hasTipoRegistro = columns.some(col => col.name === 'tipo_registro');
        
        if (!hasRegistradoPor) {
            // Agregar columna registrado_por (ID del usuario que registró)
            db.run(`
                ALTER TABLE asistencia_diputados 
                ADD COLUMN registrado_por INTEGER
            `, (err) => {
                if (err) {
                    console.error('Error agregando columna registrado_por:', err);
                } else {
                    console.log('✓ Columna registrado_por agregada exitosamente');
                }
            });
        } else {
            console.log('✓ La columna registrado_por ya existe');
        }
        
        if (!hasTipoRegistro) {
            // Agregar columna tipo_registro ('personal', 'secretario', 'auto')
            db.run(`
                ALTER TABLE asistencia_diputados 
                ADD COLUMN tipo_registro TEXT DEFAULT 'secretario'
            `, (err) => {
                if (err) {
                    console.error('Error agregando columna tipo_registro:', err);
                } else {
                    console.log('✓ Columna tipo_registro agregada exitosamente');
                }
            });
        } else {
            console.log('✓ La columna tipo_registro ya existe');
        }
    });
});

// Cerrar la base de datos después de un tiempo
setTimeout(() => {
    db.close((err) => {
        if (err) {
            console.error('Error cerrando la base de datos:', err);
        } else {
            console.log('\nMigración completada');
        }
    });
}, 2000);