const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

db.run(`DROP TABLE IF EXISTS sesiones_precargadas_nueva`, (err) => {
    if (err) {
        console.error('Error:', err);
    } else {
        console.log('✅ Tabla temporal eliminada');
    }
    db.close();
});