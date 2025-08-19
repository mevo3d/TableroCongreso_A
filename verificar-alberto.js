const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('\n===== VERIFICACIÓN DE ALBERTO SÁNCHEZ =====\n');

db.get(
    `SELECT * FROM usuarios WHERE username = 'alberto.sanchez'`,
    [],
    (err, row) => {
        if (err) {
            console.error('Error:', err);
            db.close();
            return;
        }
        
        if (row) {
            console.log('Datos de Alberto Sánchez:');
            console.log('ID:', row.id);
            console.log('Username:', row.username);
            console.log('Nombre completo:', row.nombre_completo);
            console.log('Rol:', row.role);
            console.log('Partido:', row.partido);
            console.log('Cargo Mesa Directiva:', row.cargo_mesa_directiva);
            console.log('Cargo Coordinador:', row.cargo_coordinador);
            console.log('Comisión:', row.comision);
        } else {
            console.log('No se encontró el usuario alberto.sanchez');
        }
        
        db.close();
    }
);