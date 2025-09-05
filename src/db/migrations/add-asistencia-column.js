const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('Agregando columna asistencia a asistencia_diputados...');

db.serialize(() => {
    // Verificar si la columna ya existe
    db.all("PRAGMA table_info(asistencia_diputados)", (err, columns) => {
        if (err) {
            console.error('Error verificando columnas:', err);
            return;
        }
        
        const hasAsistencia = columns.some(col => col.name === 'asistencia');
        const hasJustificado = columns.some(col => col.name === 'justificado');
        const hasJustificacionMotivo = columns.some(col => col.name === 'justificacion_motivo');
        
        if (!hasAsistencia) {
            // Agregar columna asistencia (valores: 'presente', 'ausente', 'justificado')
            db.run(`
                ALTER TABLE asistencia_diputados 
                ADD COLUMN asistencia TEXT
            `, (err) => {
                if (err) {
                    console.error('Error agregando columna asistencia:', err);
                } else {
                    console.log('✓ Columna asistencia agregada exitosamente');
                    
                    // Migrar datos existentes
                    db.run(`
                        UPDATE asistencia_diputados 
                        SET asistencia = CASE 
                            WHEN presente = 1 THEN 'presente'
                            WHEN presente = 0 THEN 'ausente'
                            ELSE 'pending'
                        END
                        WHERE asistencia IS NULL
                    `, (err) => {
                        if (err) {
                            console.error('Error migrando datos:', err);
                        } else {
                            console.log('✓ Datos migrados exitosamente');
                        }
                    });
                }
            });
        } else {
            console.log('✓ La columna asistencia ya existe');
        }
        
        if (!hasJustificado) {
            // Agregar columna justificado
            db.run(`
                ALTER TABLE asistencia_diputados 
                ADD COLUMN justificado INTEGER DEFAULT 0
            `, (err) => {
                if (err) {
                    console.error('Error agregando columna justificado:', err);
                } else {
                    console.log('✓ Columna justificado agregada exitosamente');
                }
            });
        } else {
            console.log('✓ La columna justificado ya existe');
        }
        
        if (!hasJustificacionMotivo) {
            // Agregar columna justificacion_motivo
            db.run(`
                ALTER TABLE asistencia_diputados 
                ADD COLUMN justificacion_motivo TEXT
            `, (err) => {
                if (err) {
                    console.error('Error agregando columna justificacion_motivo:', err);
                } else {
                    console.log('✓ Columna justificacion_motivo agregada exitosamente');
                }
            });
        } else {
            console.log('✓ La columna justificacion_motivo ya existe');
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
}, 3000);