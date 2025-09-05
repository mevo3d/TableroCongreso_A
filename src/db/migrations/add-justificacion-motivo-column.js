const path = require('path');
const Database = require('better-sqlite3');

// Función para ejecutar la migración
function runMigration() {
    const dbPath = path.join(__dirname, '..', 'votacion.db');
    console.log('Abriendo base de datos en:', dbPath);
    
    const db = new Database(dbPath);
    
    try {
        // Agregar columna justificacion_motivo
        console.log('Agregando columna justificacion_motivo a tabla asistencias...');
        
        db.exec(`
            ALTER TABLE asistencias 
            ADD COLUMN justificacion_motivo TEXT DEFAULT NULL
        `);
        
        console.log('✅ Migración completada exitosamente');
        console.log('La tabla asistencias ahora incluye la columna justificacion_motivo');
        
    } catch (error) {
        // Si la columna ya existe, no es un error crítico
        if (error.message.includes('duplicate column name')) {
            console.log('⚠️ La columna justificacion_motivo ya existe, no se requiere migración');
        } else {
            console.error('❌ Error durante la migración:', error);
            throw error;
        }
    } finally {
        db.close();
    }
}

// Ejecutar migración
if (require.main === module) {
    runMigration();
}

module.exports = { runMigration };