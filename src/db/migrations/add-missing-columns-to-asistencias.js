const path = require('path');
const Database = require('better-sqlite3');

// Función para ejecutar la migración
function runMigration() {
    const dbPath = path.join(__dirname, '..', 'votacion.db');
    console.log('Abriendo base de datos en:', dbPath);
    
    const db = new Database(dbPath);
    
    try {
        // Obtener columnas existentes
        const tableInfo = db.prepare("PRAGMA table_info(asistencias)").all();
        const existingColumns = tableInfo.map(col => col.name);
        console.log('Columnas existentes:', existingColumns);
        
        // Columnas que necesitamos agregar
        const columnsToAdd = [
            { name: 'justificado_por', definition: 'INTEGER' },
            { name: 'hora_justificacion', definition: 'DATETIME' },
            { name: 'llegada_tardia', definition: 'INTEGER DEFAULT 0' },
            { name: 'hora_llegada_tardia', definition: 'DATETIME' },
            { name: 'auto_registro', definition: 'INTEGER DEFAULT 0' },
            { name: 'hora_pase_lista_inicial', definition: 'DATETIME' }
        ];
        
        let columnsAdded = 0;
        
        // Agregar cada columna si no existe
        for (const column of columnsToAdd) {
            if (!existingColumns.includes(column.name)) {
                try {
                    console.log(`Agregando columna ${column.name}...`);
                    db.exec(`ALTER TABLE asistencias ADD COLUMN ${column.name} ${column.definition}`);
                    columnsAdded++;
                    console.log(`✅ Columna ${column.name} agregada exitosamente`);
                } catch (error) {
                    if (error.message.includes('duplicate column name')) {
                        console.log(`⚠️ La columna ${column.name} ya existe`);
                    } else {
                        console.error(`❌ Error agregando columna ${column.name}:`, error.message);
                    }
                }
            } else {
                console.log(`⚠️ La columna ${column.name} ya existe, saltando...`);
            }
        }
        
        if (columnsAdded > 0) {
            console.log(`\n✅ Migración completada: ${columnsAdded} columnas agregadas`);
        } else {
            console.log('\n⚠️ No se agregaron columnas nuevas (todas ya existían)');
        }
        
    } catch (error) {
        console.error('❌ Error durante la migración:', error);
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