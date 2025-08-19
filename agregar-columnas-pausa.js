const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Conectar a la base de datos
const db = new sqlite3.Database(path.join(__dirname, 'src', 'db', 'votacion.db'), (err) => {
    if (err) {
        console.error('Error conectando a la base de datos:', err);
        process.exit(1);
    }
    console.log('✅ Conectado a la base de datos');
});

// Agregar columnas para manejo de pausa
db.serialize(() => {
    // Columna para indicar si la sesión está pausada
    db.run(`
        ALTER TABLE sesiones 
        ADD COLUMN pausada INTEGER DEFAULT 0
    `, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error agregando columna pausada:', err);
        } else if (!err) {
            console.log('✅ Columna pausada agregada');
        } else {
            console.log('ℹ️ Columna pausada ya existe');
        }
    });
    
    // Columna para el tiempo hasta cuando está pausada
    db.run(`
        ALTER TABLE sesiones 
        ADD COLUMN tiempo_pausa_hasta DATETIME
    `, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error agregando columna tiempo_pausa_hasta:', err);
        } else if (!err) {
            console.log('✅ Columna tiempo_pausa_hasta agregada');
        } else {
            console.log('ℹ️ Columna tiempo_pausa_hasta ya existe');
        }
    });
    
    // Columna para registrar quién pausó
    db.run(`
        ALTER TABLE sesiones 
        ADD COLUMN pausada_por INTEGER
    `, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error agregando columna pausada_por:', err);
        } else if (!err) {
            console.log('✅ Columna pausada_por agregada');
        } else {
            console.log('ℹ️ Columna pausada_por ya existe');
        }
    });
    
    // Columna para cuándo se pausó
    db.run(`
        ALTER TABLE sesiones 
        ADD COLUMN pausada_en DATETIME
    `, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error agregando columna pausada_en:', err);
        } else if (!err) {
            console.log('✅ Columna pausada_en agregada');
        } else {
            console.log('ℹ️ Columna pausada_en ya existe');
        }
    });
    
    // Columna para quién reanudó
    db.run(`
        ALTER TABLE sesiones 
        ADD COLUMN reanudada_por INTEGER
    `, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error agregando columna reanudada_por:', err);
        } else if (!err) {
            console.log('✅ Columna reanudada_por agregada');
        } else {
            console.log('ℹ️ Columna reanudada_por ya existe');
        }
    });
    
    // Columna para cuándo se reanudó
    db.run(`
        ALTER TABLE sesiones 
        ADD COLUMN reanudada_en DATETIME
    `, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error agregando columna reanudada_en:', err);
        } else if (!err) {
            console.log('✅ Columna reanudada_en agregada');
        } else {
            console.log('ℹ️ Columna reanudada_en ya existe');
        }
    });
});

// Cerrar la base de datos después de las operaciones
setTimeout(() => {
    db.close((err) => {
        if (err) {
            console.error('Error cerrando la base de datos:', err);
        } else {
            console.log('\n✅ Migración de pausa completada exitosamente');
        }
    });
}, 2000);