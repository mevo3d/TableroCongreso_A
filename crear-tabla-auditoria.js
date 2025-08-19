const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('Creando tabla de auditoría de asistencia...\n');

db.serialize(() => {
    // Crear tabla de auditoría de asistencia
    db.run(`
        CREATE TABLE IF NOT EXISTS auditoria_asistencia (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pase_lista_id INTEGER,
            modificado_por TEXT,
            razon TEXT,
            cantidad_modificaciones INTEGER,
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pase_lista_id) REFERENCES pase_lista(id)
        )
    `, (err) => {
        if (err) {
            console.error('Error creando tabla auditoria_asistencia:', err);
        } else {
            console.log('✓ Tabla auditoria_asistencia creada o ya existe');
        }
    });
    
    // Verificar que la tabla se creó correctamente
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='auditoria_asistencia'", (err, tables) => {
        if (err) {
            console.error('Error verificando tabla:', err);
        } else if (tables.length > 0) {
            console.log('✓ Tabla auditoria_asistencia verificada exitosamente');
        }
        
        db.close(() => {
            console.log('\nProceso completado.');
        });
    });
});