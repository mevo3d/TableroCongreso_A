const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('Ejecutando migración para agregar columnas fecha_inicio y hora_inicio...');

// Array de comandos SQL a ejecutar
const migrations = [
    "ALTER TABLE sesiones ADD COLUMN fecha_inicio DATETIME",
    "ALTER TABLE sesiones ADD COLUMN hora_inicio DATETIME",
    "ALTER TABLE sesiones ADD COLUMN pausada INTEGER DEFAULT 0",
    "ALTER TABLE sesiones ADD COLUMN pase_lista_activo INTEGER DEFAULT 0"
];

// Función para ejecutar cada migración
function runMigration(sql, callback) {
    db.run(sql, (err) => {
        if (err) {
            // Si el error es que la columna ya existe, lo ignoramos
            if (err.message.includes('duplicate column name')) {
                console.log(`✓ Columna ya existe (ignorando): ${sql.substring(0, 50)}...`);
                callback();
            } else {
                console.error(`✗ Error ejecutando: ${sql}`);
                console.error(err);
                callback(err);
            }
        } else {
            console.log(`✓ Ejecutado exitosamente: ${sql.substring(0, 50)}...`);
            callback();
        }
    });
}

// Ejecutar migraciones secuencialmente
let index = 0;
function runNext() {
    if (index >= migrations.length) {
        // Actualizar sesiones activas existentes
        db.run(`UPDATE sesiones 
                SET fecha_inicio = fecha,
                    hora_inicio = fecha
                WHERE activa = 1 AND fecha_inicio IS NULL`, (err) => {
            if (err) {
                console.error('Error actualizando sesiones existentes:', err);
            } else {
                console.log('✓ Sesiones activas actualizadas');
            }
            
            db.close((err) => {
                if (err) {
                    console.error(err.message);
                }
                console.log('\n✅ Migración completada exitosamente');
            });
        });
        return;
    }
    
    runMigration(migrations[index], (err) => {
        if (!err || err.message.includes('duplicate column name')) {
            index++;
            runNext();
        } else {
            db.close();
            process.exit(1);
        }
    });
}

// Iniciar proceso
runNext();