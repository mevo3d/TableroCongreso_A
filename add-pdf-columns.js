// Script para agregar columnas archivo_pdf a las tablas
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Agregando columnas archivo_pdf a las tablas...');

db.serialize(() => {
    // Agregar columna a tabla sesiones
    db.run("ALTER TABLE sesiones ADD COLUMN archivo_pdf TEXT", (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log('✅ Columna archivo_pdf ya existe en sesiones');
            } else {
                console.error('Error agregando columna a sesiones:', err);
            }
        } else {
            console.log('✅ Columna archivo_pdf agregada a sesiones');
        }
    });
    
    // Agregar columna a tabla sesiones_precargadas
    db.run("ALTER TABLE sesiones_precargadas ADD COLUMN archivo_pdf TEXT", (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log('✅ Columna archivo_pdf ya existe en sesiones_precargadas');
            } else {
                console.error('Error agregando columna a sesiones_precargadas:', err);
            }
        } else {
            console.log('✅ Columna archivo_pdf agregada a sesiones_precargadas');
        }
        
        console.log('✅ Proceso completado');
        db.close();
    });
});