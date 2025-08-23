const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('Verificando estructura de tabla usuarios...\n');

db.all("PRAGMA table_info(usuarios)", (err, columns) => {
    if (err) {
        console.error('Error:', err);
        db.close();
        return;
    }
    
    console.log('Columnas de la tabla usuarios:');
    columns.forEach(col => {
        console.log(`- ${col.name} (${col.type})`);
    });
    
    // Verificar si existe columna para contraseña en texto plano
    const hasPlainPassword = columns.some(col => 
        col.name === 'password_plain' || col.name === 'contraseña_texto'
    );
    
    if (!hasPlainPassword) {
        console.log('\n❌ No existe columna para contraseña en texto plano');
        console.log('Agregando columna password_plain...');
        
        db.run("ALTER TABLE usuarios ADD COLUMN password_plain TEXT", (err) => {
            if (err) {
                if (err.message.includes('duplicate column')) {
                    console.log('La columna ya existe');
                } else {
                    console.error('Error agregando columna:', err);
                }
            } else {
                console.log('✅ Columna password_plain agregada exitosamente');
            }
            db.close();
        });
    } else {
        console.log('\n✅ Ya existe columna para contraseña en texto plano');
        db.close();
    }
});