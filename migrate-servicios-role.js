const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'src/db/votacion.db'));

console.log('🔧 Migrando base de datos para agregar rol servicios_legislativos...\n');

db.serialize(() => {
    // Iniciar transacción
    db.run('BEGIN TRANSACTION');
    
    // 1. Crear tabla temporal con el nuevo esquema
    db.run(`
        CREATE TABLE IF NOT EXISTS usuarios_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('superadmin', 'operador', 'secretario', 'diputado', 'servicios_legislativos')),
            nombre_completo TEXT NOT NULL,
            cargo_mesa_directiva TEXT DEFAULT '',
            cargo_coordinador TEXT DEFAULT '',
            partido TEXT DEFAULT '',
            comision TEXT DEFAULT '',
            cargo_legislativo TEXT DEFAULT '',
            foto_url TEXT DEFAULT '',
            activo INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('❌ Error creando tabla nueva:', err);
            db.run('ROLLBACK');
            return;
        }
        console.log('✅ Tabla temporal creada');
        
        // 2. Copiar datos existentes
        db.run(`
            INSERT INTO usuarios_new 
            SELECT id, username, password, role, nombre_completo, cargo_mesa_directiva, 
                   cargo_coordinador, partido, comision, cargo_legislativo, foto_url, activo, created_at
            FROM usuarios
        `, (err) => {
            if (err) {
                console.error('❌ Error copiando datos:', err);
                db.run('ROLLBACK');
                return;
            }
            console.log('✅ Datos copiados a tabla temporal');
            
            // 3. Eliminar tabla antigua
            db.run('DROP TABLE usuarios', (err) => {
                if (err) {
                    console.error('❌ Error eliminando tabla antigua:', err);
                    db.run('ROLLBACK');
                    return;
                }
                console.log('✅ Tabla antigua eliminada');
                
                // 4. Renombrar tabla nueva
                db.run('ALTER TABLE usuarios_new RENAME TO usuarios', (err) => {
                    if (err) {
                        console.error('❌ Error renombrando tabla:', err);
                        db.run('ROLLBACK');
                        return;
                    }
                    console.log('✅ Tabla renombrada exitosamente');
                    
                    // 5. Agregar usuario de servicios legislativos
                    const defaultPassword = bcrypt.hashSync('123456', 10);
                    
                    db.run(`
                        INSERT OR REPLACE INTO usuarios (username, password, role, nombre_completo, activo) 
                        VALUES ('servicios', ?, 'servicios_legislativos', 'Servicios Legislativos', 1)
                    `, [defaultPassword], function(err) {
                        if (err) {
                            console.error('❌ Error agregando usuario:', err);
                            db.run('ROLLBACK');
                            return;
                        }
                        
                        // Confirmar transacción
                        db.run('COMMIT', (err) => {
                            if (err) {
                                console.error('❌ Error confirmando transacción:', err);
                                return;
                            }
                            
                            console.log('\n✅ Migración completada exitosamente');
                            console.log('✅ Usuario de Servicios Legislativos agregado');
                            console.log('\n📋 Credenciales de acceso:');
                            console.log('   Usuario: servicios');
                            console.log('   Contraseña: 123456');
                            console.log('   Rol: servicios_legislativos');
                            
                            // Verificar
                            db.get(`SELECT username, role, nombre_completo FROM usuarios WHERE username = 'servicios'`, (err, row) => {
                                if (row) {
                                    console.log('\n✔️ Verificación exitosa:', row);
                                }
                                db.close();
                            });
                        });
                    });
                });
            });
        });
    });
});