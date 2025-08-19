// Script para verificar la lista de diputados en la base de datos
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('\n===== LISTA DE DIPUTADOS EN LA BASE DE DATOS =====\n');

db.all(
    `SELECT id, username, nombre_completo, partido 
     FROM usuarios 
     WHERE role = 'diputado' AND activo = 1 
     ORDER BY id`,
    [],
    (err, rows) => {
        if (err) {
            console.error('Error:', err);
            return;
        }
        
        console.log('Total de diputados activos:', rows.length);
        console.log('\nLista completa:\n');
        
        rows.forEach((row, index) => {
            console.log(`${index + 1}. [ID: ${row.id}] ${row.username} - ${row.nombre_completo} (${row.partido})`);
        });
        
        // Verificar duplicados
        const usernames = rows.map(r => r.username);
        const duplicados = usernames.filter((item, index) => usernames.indexOf(item) !== index);
        
        if (duplicados.length > 0) {
            console.log('\n⚠️  DUPLICADOS ENCONTRADOS:', duplicados);
        } else {
            console.log('\n✅ No hay duplicados');
        }
        
        db.close();
    }
);