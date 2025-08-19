const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Conectar a la base de datos
const db = new sqlite3.Database(path.join(__dirname, 'src', 'db', 'votacion.db'), (err) => {
    if (err) {
        console.error('Error conectando a la base de datos:', err);
        process.exit(1);
    }
    console.log('✅ Conectado a la base de datos');
});

// Función para verificar si una columna existe
function columnExists(tableName, columnName) {
    return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const exists = rows.some(row => row.name === columnName);
                resolve(exists);
            }
        });
    });
}

// Ejecutar migraciones
async function ejecutarMigracion() {
    try {
        // Verificar si la columna tipo_iniciativa existe
        const existeTipoIniciativa = await columnExists('iniciativas', 'tipo_iniciativa');
        
        if (!existeTipoIniciativa) {
            console.log('🔄 Agregando columna tipo_iniciativa...');
            
            await new Promise((resolve, reject) => {
                db.run(`
                    ALTER TABLE iniciativas 
                    ADD COLUMN tipo_iniciativa TEXT DEFAULT 'normal'
                `, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('✅ Columna tipo_iniciativa agregada');
                        resolve();
                    }
                });
            });
        } else {
            console.log('ℹ️  La columna tipo_iniciativa ya existe');
        }
        
        // Actualizar iniciativas existentes para establecer tipo_iniciativa por defecto
        await new Promise((resolve, reject) => {
            db.run(`
                UPDATE iniciativas 
                SET tipo_iniciativa = 'normal' 
                WHERE tipo_iniciativa IS NULL
            `, function(err) {
                if (err) {
                    reject(err);
                } else {
                    console.log(`✅ Actualizadas ${this.changes} iniciativas con tipo_iniciativa = 'normal'`);
                    resolve();
                }
            });
        });
        
        // Verificar la estructura actual de la tabla
        console.log('\n📋 Estructura actual de la tabla iniciativas:');
        await new Promise((resolve, reject) => {
            db.all(`PRAGMA table_info(iniciativas)`, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    rows.forEach(row => {
                        console.log(`  - ${row.name}: ${row.type}${row.notnull ? ' NOT NULL' : ''}${row.dflt_value ? ` DEFAULT ${row.dflt_value}` : ''}`);
                    });
                    resolve();
                }
            });
        });
        
        console.log('\n✅ Migración completada exitosamente');
        
    } catch (error) {
        console.error('❌ Error durante la migración:', error);
        process.exit(1);
    } finally {
        db.close((err) => {
            if (err) {
                console.error('Error cerrando la base de datos:', err);
            } else {
                console.log('📁 Base de datos cerrada');
            }
        });
    }
}

// Ejecutar la migración
ejecutarMigracion();