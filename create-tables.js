const sqlite3 = require('sqlite3').verbose();

// Conectar a la base de datos
const db = new sqlite3.Database('./votacion.db', (err) => {
    if (err) {
        console.error('Error conectando a la base de datos:', err);
        process.exit(1);
    }
    console.log('Conectado a la base de datos');
});

// Ejecutar en modo serializado
db.serialize(() => {
    // Crear tabla sesiones_precargadas
    db.run(`
        CREATE TABLE IF NOT EXISTS sesiones_precargadas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo_sesion TEXT NOT NULL UNIQUE,
            nombre_sesion TEXT NOT NULL,
            descripcion TEXT,
            fecha_sesion DATETIME,
            fecha_propuesta DATETIME,
            estado TEXT DEFAULT 'borrador',
            creado_por INTEGER REFERENCES usuarios(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            cargada_por INTEGER REFERENCES usuarios(id),
            fecha_carga DATETIME,
            fecha_envio DATETIME,
            usado_por INTEGER REFERENCES usuarios(id),
            fecha_uso DATETIME,
            sesion_id_generada INTEGER REFERENCES sesiones(id),
            archivo_origen TEXT,
            metodo_carga TEXT
        )
    `, (err) => {
        if (err) {
            console.error('Error creando tabla sesiones_precargadas:', err);
        } else {
            console.log('✓ Tabla sesiones_precargadas creada');
        }
    });
    
    // Crear tabla iniciativas_precargadas
    db.run(`
        CREATE TABLE IF NOT EXISTS iniciativas_precargadas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sesion_precargada_id INTEGER NOT NULL REFERENCES sesiones_precargadas(id) ON DELETE CASCADE,
            numero TEXT NOT NULL,
            titulo TEXT NOT NULL,
            descripcion TEXT,
            presentador TEXT,
            partido_presentador TEXT,
            tipo_mayoria TEXT DEFAULT 'simple',
            tipo_iniciativa TEXT DEFAULT 'ordinaria',
            comision TEXT,
            turno TEXT,
            observaciones TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Error creando tabla iniciativas_precargadas:', err);
        } else {
            console.log('✓ Tabla iniciativas_precargadas creada');
        }
    });
    
    // Crear índices
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_sesiones_precargadas_estado 
        ON sesiones_precargadas(estado)
    `, (err) => {
        if (err) {
            console.error('Error creando índice idx_sesiones_precargadas_estado:', err);
        } else {
            console.log('✓ Índice idx_sesiones_precargadas_estado creado');
        }
    });
    
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_sesiones_precargadas_creado_por 
        ON sesiones_precargadas(creado_por)
    `, (err) => {
        if (err) {
            console.error('Error creando índice idx_sesiones_precargadas_creado_por:', err);
        } else {
            console.log('✓ Índice idx_sesiones_precargadas_creado_por creado');
        }
    });
    
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_iniciativas_precargadas_sesion 
        ON iniciativas_precargadas(sesion_precargada_id)
    `, (err) => {
        if (err) {
            console.error('Error creando índice idx_iniciativas_precargadas_sesion:', err);
        } else {
            console.log('✓ Índice idx_iniciativas_precargadas_sesion creado');
        }
    });
    
    // Verificar las tablas creadas
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%precargadas%'", (err, tables) => {
        if (err) {
            console.error('Error verificando tablas:', err);
        } else {
            console.log('\nTablas en la base de datos:');
            tables.forEach(t => console.log(`  - ${t.name}`));
        }
        
        // Cerrar la conexión
        db.close((err) => {
            if (err) {
                console.error('Error cerrando la base de datos:', err);
            } else {
                console.log('\n✅ Proceso completado');
            }
        });
    });
});