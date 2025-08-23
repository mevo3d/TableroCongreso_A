const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Actualizando restricción CHECK de estados en sesiones_precargadas...');

db.serialize(() => {
    // Primero, crear una tabla temporal con la nueva estructura
    // Manteniendo exactamente el mismo orden de columnas que la tabla original
    db.run(`
        CREATE TABLE IF NOT EXISTS sesiones_precargadas_nueva (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre_sesion TEXT NOT NULL,
            fecha_sesion DATE,
            descripcion TEXT,
            estado TEXT DEFAULT 'disponible' CHECK(estado IN ('disponible', 'importada', 'archivada', 'pendiente', 'indefinida', 'programada', 'borrador', 'usada', 'cancelada')),
            creado_por INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            fecha_carga DATETIME,
            codigo_sesion TEXT,
            archivo_origen TEXT,
            fecha_propuesta DATETIME,
            cargada_por INTEGER REFERENCES usuarios(id),
            archivo_pdf TEXT,
            FOREIGN KEY (creado_por) REFERENCES usuarios(id)
        )
    `, (err) => {
        if (err) {
            console.error('❌ Error creando tabla temporal:', err);
            return;
        }
        console.log('✅ Tabla temporal creada');
        
        // Copiar todos los datos tal como están
        db.run(`
            INSERT INTO sesiones_precargadas_nueva 
            SELECT * FROM sesiones_precargadas
        `, (err) => {
            if (err) {
                console.error('❌ Error copiando datos:', err);
                return;
            }
            console.log('✅ Datos copiados a tabla temporal');
            
            // Eliminar tabla original
            db.run(`DROP TABLE sesiones_precargadas`, (err) => {
                if (err) {
                    console.error('❌ Error eliminando tabla original:', err);
                    return;
                }
                console.log('✅ Tabla original eliminada');
                
                // Renombrar tabla temporal
                db.run(`ALTER TABLE sesiones_precargadas_nueva RENAME TO sesiones_precargadas`, (err) => {
                    if (err) {
                        console.error('❌ Error renombrando tabla:', err);
                        return;
                    }
                    console.log('✅ Tabla renombrada exitosamente');
                    console.log('✨ Restricción CHECK actualizada correctamente');
                    
                    // Verificar los estados permitidos
                    db.get(`
                        SELECT sql FROM sqlite_master 
                        WHERE type='table' AND name='sesiones_precargadas'
                    `, (err, row) => {
                        if (row) {
                            console.log('\n📋 Estructura actualizada de la tabla:');
                            console.log(row.sql);
                        }
                        db.close();
                    });
                });
            });
        });
    });
});