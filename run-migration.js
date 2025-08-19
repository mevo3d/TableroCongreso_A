const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Conectar a la base de datos
const db = new sqlite3.Database('./votacion.db', (err) => {
    if (err) {
        console.error('Error conectando a la base de datos:', err);
        process.exit(1);
    }
    console.log('Conectado a la base de datos');
});

// Leer el archivo de migración
const migrationPath = path.join(__dirname, 'src/db/migrations/004_sesiones_precargadas.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

// Separar las sentencias SQL
const statements = migrationSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

// Ejecutar cada sentencia
let completed = 0;
const total = statements.length;

statements.forEach((statement, index) => {
    db.run(statement + ';', (err) => {
        if (err) {
            console.error(`Error ejecutando sentencia ${index + 1}:`, err.message);
            console.error('SQL:', statement.substring(0, 100) + '...');
        } else {
            console.log(`✓ Sentencia ${index + 1}/${total} ejecutada`);
        }
        
        completed++;
        if (completed === total) {
            // Verificar que las tablas se crearon
            db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%precargadas%'", (err, tables) => {
                if (err) {
                    console.error('Error verificando tablas:', err);
                } else {
                    console.log('\nTablas creadas:');
                    tables.forEach(t => console.log(`  - ${t.name}`));
                }
                
                // Cerrar la conexión
                db.close((err) => {
                    if (err) {
                        console.error('Error cerrando la base de datos:', err);
                    } else {
                        console.log('\n✅ Migración completada exitosamente');
                    }
                });
            });
        }
    });
});