const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('\n===== VERIFICACIÓN DE USUARIOS SECRETARIO =====\n');

db.all(`
    SELECT id, username, nombre_completo, role, cargo_mesa_directiva
    FROM usuarios 
    WHERE role = 'secretario' 
       OR cargo_mesa_directiva IN ('secretario1', 'secretario2')
       OR username LIKE '%secretario%'
    ORDER BY role, username
`, [], (err, rows) => {
    if (err) {
        console.error('Error:', err);
        db.close();
        return;
    }
    
    console.log('Usuarios encontrados con rol o cargo de secretario:');
    console.log('--------------------------------------------');
    rows.forEach(row => {
        console.log(`ID: ${row.id}`);
        console.log(`Username: ${row.username}`);
        console.log(`Nombre: ${row.nombre_completo}`);
        console.log(`Role: ${row.role}`);
        console.log(`Cargo Mesa: ${row.cargo_mesa_directiva || 'N/A'}`);
        console.log('--------------------------------------------');
    });
    
    if (rows.length === 0) {
        console.log('No se encontraron usuarios con rol de secretario');
    }
    
    db.close();
});