// Script para agregar columna descripcion a tabla sesiones
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Agregando columna descripcion a tabla sesiones...');

db.serialize(() => {
    // Verificar columnas existentes en sesiones
    db.all("PRAGMA table_info(sesiones)", (err, columns) => {
        if (err) {
            console.error('Error verificando estructura:', err);
            return;
        }
        
        const columnNames = columns.map(col => col.name);
        console.log('Columnas actuales en sesiones:', columnNames);
        
        // Agregar columna descripcion si no existe
        if (!columnNames.includes('descripcion')) {
            db.run("ALTER TABLE sesiones ADD COLUMN descripcion TEXT", (err) => {
                if (err) {
                    console.error('Error agregando columna descripcion:', err);
                } else {
                    console.log('✅ Columna descripcion agregada a tabla sesiones');
                }
                db.close();
            });
        } else {
            console.log('✅ La columna descripcion ya existe en tabla sesiones');
            db.close();
        }
    });
});