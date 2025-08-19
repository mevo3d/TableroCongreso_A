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

db.serialize(() => {
    // Tabla para sesiones precargadas por Servicios Legislativos
    db.run(`
        CREATE TABLE IF NOT EXISTS sesiones_precargadas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            descripcion TEXT,
            fecha_propuesta DATETIME,
            fecha_carga DATETIME DEFAULT CURRENT_TIMESTAMP,
            estado TEXT DEFAULT 'borrador', -- borrador, enviada, procesada
            cargada_por INTEGER,
            enviada_al_operador DATETIME,
            procesada_por_operador DATETIME,
            tipo_carga TEXT, -- excel, pdf, manual
            archivo_original TEXT,
            notas TEXT,
            FOREIGN KEY (cargada_por) REFERENCES usuarios(id)
        )
    `, (err) => {
        if (err) {
            console.error('Error creando tabla sesiones_precargadas:', err);
        } else {
            console.log('✅ Tabla sesiones_precargadas creada/verificada');
        }
    });
    
    // Tabla para iniciativas precargadas
    db.run(`
        CREATE TABLE IF NOT EXISTS iniciativas_precargadas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sesion_precargada_id INTEGER NOT NULL,
            numero INTEGER NOT NULL,
            titulo TEXT NOT NULL,
            descripcion TEXT,
            presentador TEXT,
            partido_presentador TEXT,
            tipo_mayoria TEXT DEFAULT 'simple',
            archivo_adjunto TEXT,
            observaciones TEXT,
            orden INTEGER,
            FOREIGN KEY (sesion_precargada_id) REFERENCES sesiones_precargadas(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('Error creando tabla iniciativas_precargadas:', err);
        } else {
            console.log('✅ Tabla iniciativas_precargadas creada/verificada');
        }
    });
    
    // Índices para mejor rendimiento
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_sesiones_precargadas_estado 
        ON sesiones_precargadas(estado)
    `, (err) => {
        if (err && !err.message.includes('already exists')) {
            console.error('Error creando índice:', err);
        } else {
            console.log('✅ Índice idx_sesiones_precargadas_estado creado');
        }
    });
    
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_iniciativas_precargadas_sesion 
        ON iniciativas_precargadas(sesion_precargada_id)
    `, (err) => {
        if (err && !err.message.includes('already exists')) {
            console.error('Error creando índice:', err);
        } else {
            console.log('✅ Índice idx_iniciativas_precargadas_sesion creado');
        }
    });
    
    // Verificar estructura
    console.log('\n📋 Verificando estructura de tablas...');
    
    db.all(`PRAGMA table_info(sesiones_precargadas)`, (err, rows) => {
        if (err) {
            console.error('Error verificando estructura:', err);
        } else if (rows.length > 0) {
            console.log('\n✅ Tabla sesiones_precargadas:');
            rows.forEach(row => {
                console.log(`  - ${row.name}: ${row.type}`);
            });
        }
    });
    
    db.all(`PRAGMA table_info(iniciativas_precargadas)`, (err, rows) => {
        if (err) {
            console.error('Error verificando estructura:', err);
        } else if (rows.length > 0) {
            console.log('\n✅ Tabla iniciativas_precargadas:');
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
            console.log('\n✅ Migración de Servicios Legislativos completada exitosamente');
        }
    });
}, 2000);