// Script para corregir la estructura de la tabla sesiones_precargadas
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Iniciando corrección de tabla sesiones_precargadas...');

db.serialize(() => {
    // Verificar columnas existentes
    db.all("PRAGMA table_info(sesiones_precargadas)", (err, columns) => {
        if (err) {
            console.error('Error verificando estructura:', err);
            return;
        }
        
        const columnNames = columns.map(col => col.name);
        console.log('Columnas actuales:', columnNames);
        
        // Agregar columnas faltantes
        const alterStatements = [];
        
        if (!columnNames.includes('codigo_sesion')) {
            alterStatements.push("ALTER TABLE sesiones_precargadas ADD COLUMN codigo_sesion TEXT");
        }
        
        if (!columnNames.includes('cargada_por')) {
            alterStatements.push("ALTER TABLE sesiones_precargadas ADD COLUMN cargada_por INTEGER REFERENCES usuarios(id)");
        }
        
        if (!columnNames.includes('fecha_carga')) {
            alterStatements.push("ALTER TABLE sesiones_precargadas ADD COLUMN fecha_carga DATETIME");
        }
        
        if (!columnNames.includes('fecha_propuesta')) {
            alterStatements.push("ALTER TABLE sesiones_precargadas ADD COLUMN fecha_propuesta DATETIME");
        }
        
        if (!columnNames.includes('archivo_origen')) {
            alterStatements.push("ALTER TABLE sesiones_precargadas ADD COLUMN archivo_origen TEXT");
        }
        
        if (!columnNames.includes('fecha_sesion')) {
            alterStatements.push("ALTER TABLE sesiones_precargadas ADD COLUMN fecha_sesion DATETIME");
        }
        
        // Ejecutar las alteraciones necesarias
        let completed = 0;
        if (alterStatements.length === 0) {
            console.log('✅ La tabla ya tiene todas las columnas necesarias');
            
            // Actualizar códigos de sesión faltantes
            db.run(`
                UPDATE sesiones_precargadas 
                SET codigo_sesion = 'SL-' || strftime('%Y%m%d', created_at) || '-' || id
                WHERE codigo_sesion IS NULL OR codigo_sesion = ''
            `, (err) => {
                if (err) {
                    console.error('Error actualizando códigos:', err);
                } else {
                    console.log('✅ Códigos de sesión actualizados');
                }
                db.close();
            });
        } else {
            alterStatements.forEach(statement => {
                console.log('Ejecutando:', statement);
                db.run(statement, (err) => {
                    if (err) {
                        console.error('Error ejecutando:', statement, err);
                    } else {
                        console.log('✅', statement);
                    }
                    
                    completed++;
                    if (completed === alterStatements.length) {
                        // Generar códigos de sesión para registros existentes
                        db.run(`
                            UPDATE sesiones_precargadas 
                            SET codigo_sesion = 'SL-' || strftime('%Y%m%d', COALESCE(created_at, datetime('now'))) || '-' || id,
                                fecha_carga = COALESCE(fecha_carga, created_at, datetime('now')),
                                fecha_propuesta = COALESCE(fecha_propuesta, fecha_sesion, datetime('now')),
                                fecha_sesion = COALESCE(fecha_sesion, fecha_propuesta, datetime('now'))
                            WHERE codigo_sesion IS NULL OR codigo_sesion = ''
                        `, (err) => {
                            if (err) {
                                console.error('Error actualizando registros:', err);
                            } else {
                                console.log('✅ Registros actualizados con códigos de sesión');
                            }
                            
                            // Verificar la estructura final
                            db.all("PRAGMA table_info(sesiones_precargadas)", (err, columns) => {
                                if (!err) {
                                    console.log('\n📋 Estructura final de la tabla:');
                                    columns.forEach(col => {
                                        console.log(`  - ${col.name}: ${col.type}`);
                                    });
                                }
                                
                                console.log('\n✅ Corrección completada');
                                db.close();
                            });
                        });
                    }
                });
            });
        }
    });
});