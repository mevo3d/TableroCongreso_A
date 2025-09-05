const path = require('path');
const Database = require('better-sqlite3');

// Función para ejecutar la migración
function runMigration() {
    const dbPath = path.join(__dirname, '..', 'votacion.db');
    console.log('Abriendo base de datos en:', dbPath);
    
    const db = new Database(dbPath);
    
    try {
        // Iniciar transacción
        db.exec('BEGIN TRANSACTION');
        
        // Crear tabla temporal con la nueva restricción
        console.log('Creando tabla temporal con nueva restricción...');
        db.exec(`
            CREATE TABLE asistencias_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pase_lista_id INTEGER,
                diputado_id INTEGER,
                asistencia TEXT CHECK(asistencia IN ('presente', 'ausente', 'justificado')),
                hora DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (pase_lista_id) REFERENCES pase_lista(id),
                FOREIGN KEY (diputado_id) REFERENCES usuarios(id),
                UNIQUE(pase_lista_id, diputado_id)
            )
        `);
        
        // Copiar datos existentes
        console.log('Copiando datos existentes...');
        db.exec(`
            INSERT INTO asistencias_new (id, pase_lista_id, diputado_id, asistencia, hora)
            SELECT id, pase_lista_id, diputado_id, asistencia, hora
            FROM asistencias
        `);
        
        // Eliminar tabla original
        console.log('Eliminando tabla original...');
        db.exec('DROP TABLE asistencias');
        
        // Renombrar tabla nueva
        console.log('Renombrando tabla nueva...');
        db.exec('ALTER TABLE asistencias_new RENAME TO asistencias');
        
        // Confirmar transacción
        db.exec('COMMIT');
        
        console.log('✅ Migración completada exitosamente');
        console.log('La tabla asistencias ahora acepta valores: presente, ausente, justificado');
        
    } catch (error) {
        console.error('❌ Error durante la migración:', error);
        db.exec('ROLLBACK');
        throw error;
    } finally {
        db.close();
    }
}

// Ejecutar migración
if (require.main === module) {
    runMigration();
}

module.exports = { runMigration };