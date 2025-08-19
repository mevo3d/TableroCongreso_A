// Script para verificar la lista de diputados en la base de datos correcta
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('\n===== VERIFICACIÓN DE DIPUTADOS EN LA BASE DE DATOS =====\n');
console.log('Base de datos:', dbPath);

db.all(
    `SELECT id, username, nombre_completo, partido 
     FROM usuarios 
     WHERE role = 'diputado' AND activo = 1 
     ORDER BY id`,
    [],
    (err, rows) => {
        if (err) {
            console.error('Error:', err);
            db.close();
            return;
        }
        
        console.log('\nTotal de diputados activos:', rows.length);
        console.log('\n========= LISTA COMPLETA =========\n');
        
        rows.forEach((row, index) => {
            console.log(`${(index + 1).toString().padStart(2, '0')}. [ID: ${row.id.toString().padStart(2, ' ')}] ${row.username.padEnd(20)} - ${row.nombre_completo} (${row.partido})`);
        });
        
        // Verificar duplicados por username
        const usernames = rows.map(r => r.username);
        const duplicadosUsername = usernames.filter((item, index) => usernames.indexOf(item) !== index);
        
        // Verificar duplicados por nombre completo
        const nombres = rows.map(r => r.nombre_completo);
        const duplicadosNombre = nombres.filter((item, index) => nombres.indexOf(item) !== index);
        
        console.log('\n========= VERIFICACIÓN DE DUPLICADOS =========\n');
        
        if (duplicadosUsername.length > 0) {
            console.log('⚠️  DUPLICADOS POR USERNAME:', duplicadosUsername);
        } else {
            console.log('✅ No hay duplicados por username');
        }
        
        if (duplicadosNombre.length > 0) {
            console.log('⚠️  DUPLICADOS POR NOMBRE:', duplicadosNombre);
        } else {
            console.log('✅ No hay duplicados por nombre');
        }
        
        // Verificar que tenemos exactamente 20 diputados
        console.log('\n========= CONTEO =========\n');
        if (rows.length === 20) {
            console.log('✅ Cantidad correcta: 20 diputados');
        } else {
            console.log(`⚠️  Cantidad incorrecta: ${rows.length} diputados (esperados: 20)`);
        }
        
        db.close();
    }
);