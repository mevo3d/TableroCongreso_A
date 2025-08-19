const sqlite3 = require('sqlite3').verbose();

// Conectar a la base de datos
const db = new sqlite3.Database('./src/db/votacion.db', (err) => {
    if (err) {
        console.error('Error conectando a la base de datos:', err);
        process.exit(1);
    }
    console.log('Conectado a la base de datos');
});

// Ejecutar en modo serializado
db.serialize(() => {
    // Agregar columna habilitado_voto
    db.run(`
        ALTER TABLE usuarios 
        ADD COLUMN habilitado_voto INTEGER DEFAULT 1
    `, (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log('✓ Columna habilitado_voto ya existe');
            } else {
                console.error('Error agregando columna habilitado_voto:', err);
            }
        } else {
            console.log('✓ Columna habilitado_voto agregada');
        }
    });
    
    // Agregar columna en_pleno
    db.run(`
        ALTER TABLE usuarios 
        ADD COLUMN en_pleno INTEGER DEFAULT 1
    `, (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log('✓ Columna en_pleno ya existe');
            } else {
                console.error('Error agregando columna en_pleno:', err);
            }
        } else {
            console.log('✓ Columna en_pleno agregada');
        }
    });
    
    // Agregar columnas para el cronómetro de sesión
    db.run(`
        ALTER TABLE sesiones 
        ADD COLUMN hora_inicio DATETIME
    `, (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log('✓ Columna hora_inicio ya existe');
            } else {
                console.error('Error agregando columna hora_inicio:', err);
            }
        } else {
            console.log('✓ Columna hora_inicio agregada');
        }
    });
    
    db.run(`
        ALTER TABLE sesiones 
        ADD COLUMN duracion_segundos INTEGER DEFAULT 0
    `, (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log('✓ Columna duracion_segundos ya existe');
            } else {
                console.error('Error agregando columna duracion_segundos:', err);
            }
        } else {
            console.log('✓ Columna duracion_segundos agregada');
        }
        
        // Cerrar la conexión después de la última operación
        setTimeout(() => {
            db.close((err) => {
                if (err) {
                    console.error('Error cerrando la base de datos:', err);
                } else {
                    console.log('\n✅ Proceso completado');
                }
            });
        }, 1000);
    });
});