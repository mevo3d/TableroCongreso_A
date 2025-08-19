const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'src/db/votacion.db'));

console.log('🔧 Agregando usuario de Servicios Legislativos...\n');

// Primero actualizar el constraint de la tabla (esto puede fallar si ya existe, lo cual está bien)
db.run(`
    CREATE TABLE IF NOT EXISTS usuarios_temp AS SELECT * FROM usuarios;
`, (err) => {
    if (err) {
        console.log('⚠️ No se pudo crear tabla temporal (posiblemente ya existe el rol)');
    }
    
    // Crear el hash de la contraseña
    const defaultPassword = bcrypt.hashSync('123456', 10);
    
    // Insertar el usuario de servicios legislativos
    db.run(`
        INSERT OR REPLACE INTO usuarios (username, password, role, nombre_completo, activo) 
        VALUES ('servicios', ?, 'servicios_legislativos', 'Servicios Legislativos', 1)
    `, [defaultPassword], function(err) {
        if (err) {
            console.error('❌ Error agregando usuario:', err.message);
        } else {
            console.log('✅ Usuario de Servicios Legislativos agregado/actualizado exitosamente');
            console.log('\n📋 Credenciales de acceso:');
            console.log('   Usuario: servicios');
            console.log('   Contraseña: 123456');
            console.log('   Rol: servicios_legislativos');
        }
        
        // Verificar que se creó correctamente
        db.get(`SELECT username, role, nombre_completo FROM usuarios WHERE username = 'servicios'`, (err, row) => {
            if (row) {
                console.log('\n✔️ Verificación exitosa:', row);
            }
            db.close();
        });
    });
});