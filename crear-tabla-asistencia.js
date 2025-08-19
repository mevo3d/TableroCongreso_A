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

// Crear tabla de asistencia de diputados si no existe
db.serialize(() => {
    // Tabla para detalles de asistencia por diputado
    db.run(`
        CREATE TABLE IF NOT EXISTS asistencia_diputados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pase_lista_id INTEGER NOT NULL,
            diputado_id INTEGER NOT NULL,
            presente INTEGER DEFAULT 0,
            hora_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
            observaciones TEXT,
            FOREIGN KEY (pase_lista_id) REFERENCES pase_lista(id),
            FOREIGN KEY (diputado_id) REFERENCES usuarios(id),
            UNIQUE(pase_lista_id, diputado_id)
        )
    `, (err) => {
        if (err) {
            console.error('Error creando tabla asistencia_diputados:', err);
        } else {
            console.log('✅ Tabla asistencia_diputados creada/verificada');
        }
    });
    
    // Agregar columna quorum_minimo a la tabla sesiones si no existe
    db.run(`
        ALTER TABLE sesiones 
        ADD COLUMN quorum_minimo INTEGER DEFAULT 11
    `, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error agregando columna quorum_minimo:', err);
        } else if (!err) {
            console.log('✅ Columna quorum_minimo agregada a sesiones');
        } else {
            console.log('ℹ️ Columna quorum_minimo ya existe');
        }
    });
    
    // Crear índices para mejor rendimiento
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_asistencia_pase_lista 
        ON asistencia_diputados(pase_lista_id)
    `, (err) => {
        if (err) {
            console.error('Error creando índice:', err);
        } else {
            console.log('✅ Índice idx_asistencia_pase_lista creado');
        }
    });
    
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_asistencia_diputado 
        ON asistencia_diputados(diputado_id)
    `, (err) => {
        if (err) {
            console.error('Error creando índice:', err);
        } else {
            console.log('✅ Índice idx_asistencia_diputado creado');
        }
    });
    
    // Verificar estructura
    console.log('\n📋 Verificando estructura de tablas...');
    
    db.all(`PRAGMA table_info(asistencia_diputados)`, (err, rows) => {
        if (err) {
            console.error('Error verificando estructura:', err);
        } else if (rows.length > 0) {
            console.log('\n✅ Tabla asistencia_diputados:');
            rows.forEach(row => {
                console.log(`  - ${row.name}: ${row.type}`);
            });
        }
    });
    
    db.all(`PRAGMA table_info(pase_lista)`, (err, rows) => {
        if (err) {
            console.error('Error verificando estructura:', err);
        } else if (rows.length > 0) {
            console.log('\n✅ Tabla pase_lista:');
            rows.forEach(row => {
                console.log(`  - ${row.name}: ${row.type}`);
            });
        }
    });
});

// Cerrar la base de datos después de las operaciones
setTimeout(() => {
    db.close((err) => {
        if (err) {
            console.error('Error cerrando la base de datos:', err);
        } else {
            console.log('\n✅ Migración completada exitosamente');
        }
    });
}, 2000);