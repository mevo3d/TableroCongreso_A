// Script para actualizar el orden y nombres correctos de los diputados
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Actualizando nombres y orden de diputados...');

// Lista oficial de diputados en orden alfabético
const diputadosOficiales = [
    { apellidos: 'Abarca Peña', nombre: 'Gerardo', nombre_completo: 'Gerardo Abarca Peña', partido: 'PAN' },
    { apellidos: 'Domínguez Mandujano', nombre: 'Alfredo', nombre_completo: 'Alfredo Domínguez Mandujano', partido: 'MORENA' },
    { apellidos: 'Espinoza López', nombre: 'Brenda', nombre_completo: 'Brenda Espinoza López', partido: 'MORENA' },
    { apellidos: 'Gordillo Vega', nombre: 'Andrea Valentina', nombre_completo: 'Andrea Valentina Gordillo Vega', partido: 'PAN' },
    { apellidos: 'Livera Chavarría', nombre: 'Sergio Omar', nombre_completo: 'Sergio Omar Livera Chavarría', partido: 'MORENA' },
    { apellidos: 'Martínez Gómez', nombre: 'Eleonor', nombre_completo: 'Eleonor Martínez Gómez', partido: 'PRI' },
    { apellidos: 'Martínez Terrazas', nombre: 'Daniel', nombre_completo: 'Daniel Martínez Terrazas', partido: 'PAN' },
    { apellidos: 'Maya Rendón', nombre: 'Guillermina', nombre_completo: 'Guillermina Maya Rendón', partido: 'MORENA' },
    { apellidos: 'Montes de Oca Montoya', nombre: 'Melissa', nombre_completo: 'Melissa Montes de Oca Montoya', partido: 'MORENA' },
    { apellidos: 'Pedrero González', nombre: 'Luis Eduardo', nombre_completo: 'Luis Eduardo Pedrero González', partido: 'PVEM' },
    { apellidos: 'Pimentel Mejía', nombre: 'Isaac', nombre_completo: 'Isaac Pimentel Mejía', partido: 'MORENA' },
    { apellidos: 'Quevedo Maldonado', nombre: 'Luz Dary', nombre_completo: 'Luz Dary Quevedo Maldonado', partido: 'MC' },
    { apellidos: 'Reyes Reyes', nombre: 'Rafael', nombre_completo: 'Rafael Reyes Reyes', partido: 'MORENA' },
    { apellidos: 'Rodríguez López', nombre: 'Ruth Cleotilde', nombre_completo: 'Ruth Cleotilde Rodríguez López', partido: 'NUEVA ALIANZA' },
    { apellidos: 'Rodríguez Ruiz', nombre: 'Tania Valentina', nombre_completo: 'Tania Valentina Rodríguez Ruiz', partido: 'PT' },
    { apellidos: 'Ruiz Rodríguez', nombre: 'Nayla Carolina', nombre_completo: 'Nayla Carolina Ruiz Rodríguez', partido: 'MORENA' },
    { apellidos: 'Sánchez Ortega', nombre: 'Alberto', nombre_completo: 'Alberto Sánchez Ortega', partido: 'PT' },
    { apellidos: 'Sánchez Zavala', nombre: 'Francisco Erik', nombre_completo: 'Francisco Erik Sánchez Zavala', partido: 'PAN' },
    { apellidos: 'Solano López', nombre: 'Jazmín Juana', nombre_completo: 'Jazmín Juana Solano López', partido: 'MORENA' },
    { apellidos: 'Sotelo Martínez', nombre: 'Alfonso de Jesús', nombre_completo: 'Alfonso de Jesús Sotelo Martínez', partido: 'MORENA' }
];

db.serialize(() => {
    // Agregar columna apellidos si no existe
    db.run("ALTER TABLE usuarios ADD COLUMN apellidos TEXT", (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error agregando columna apellidos:', err);
        }
    });
    
    // Agregar columna orden_alfabetico si no existe
    db.run("ALTER TABLE usuarios ADD COLUMN orden_alfabetico INTEGER", (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error agregando columna orden_alfabetico:', err);
        }
        
        // Actualizar cada diputado
        let completados = 0;
        diputadosOficiales.forEach((diputado, index) => {
            // Buscar por nombre similar
            db.run(`
                UPDATE usuarios 
                SET apellidos = ?,
                    orden_alfabetico = ?,
                    partido = ?
                WHERE role = 'diputado' 
                AND (nombre_completo LIKE ? OR nombre_completo LIKE ?)
            `, [
                diputado.apellidos,
                index + 1,
                diputado.partido,
                '%' + diputado.nombre + '%',
                '%' + diputado.apellidos + '%'
            ], function(err) {
                if (err) {
                    console.error(`Error actualizando ${diputado.nombre_completo}:`, err);
                } else if (this.changes > 0) {
                    console.log(`✅ Actualizado: ${diputado.nombre_completo} (orden: ${index + 1})`);
                } else {
                    console.log(`⚠️ No encontrado: ${diputado.nombre_completo}`);
                }
                
                completados++;
                if (completados === diputadosOficiales.length) {
                    console.log('\n✅ Actualización completada');
                    
                    // Verificar resultados
                    db.all(`
                        SELECT nombre_completo, partido, orden_alfabetico 
                        FROM usuarios 
                        WHERE role = 'diputado' 
                        ORDER BY orden_alfabetico
                    `, (err, rows) => {
                        if (!err) {
                            console.log('\n📋 Diputados ordenados:');
                            rows.forEach(row => {
                                console.log(`${row.orden_alfabetico}. ${row.nombre_completo} (${row.partido})`);
                            });
                        }
                        db.close();
                    });
                }
            });
        });
    });
});