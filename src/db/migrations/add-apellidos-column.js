const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'votacion.db');
const db = new Database(dbPath);

// Agregar columna apellidos a la tabla usuarios
try {
    // Verificar si la columna ya existe
    const tableInfo = db.prepare("PRAGMA table_info(usuarios)").all();
    const apellidosExists = tableInfo.some(col => col.name === 'apellidos');
    
    if (!apellidosExists) {
        // Agregar la columna apellidos
        db.prepare(`
            ALTER TABLE usuarios 
            ADD COLUMN apellidos TEXT
        `).run();
        
        console.log('✅ Columna apellidos agregada exitosamente');
        
        // Actualizar los apellidos basándose en el nombre_completo existente
        const diputadosApellidos = [
            { id: 18, apellidos: 'Abarca Peña' },
            { id: 12, apellidos: 'Domínguez Mandujano' },
            { id: 17, apellidos: 'Espinoza López' },
            { id: 6, apellidos: 'Gordillo Vega' },
            { id: 7, apellidos: 'Livera Chavarría' },
            { id: 22, apellidos: 'Martínez Gómez' },
            { id: 5, apellidos: 'Martínez Terrazas' },
            { id: 8, apellidos: 'Maya Rendón' },
            { id: 15, apellidos: 'Montes de Oca Montoya' },
            { id: 21, apellidos: 'Pedrero González' },
            { id: 16, apellidos: 'Pimentel Mejía' },
            { id: 19, apellidos: 'Quevedo Maldonado' },
            { id: 10, apellidos: 'Reyes Reyes' },
            { id: 23, apellidos: 'Rodríguez López' },
            { id: 20, apellidos: 'Rodríguez Ruíz' },
            { id: 11, apellidos: 'Ruíz Rodríguez' },
            { id: 24, apellidos: 'Sánchez Ortega' },
            { id: 13, apellidos: 'Sánchez Zavala' },
            { id: 9, apellidos: 'Solano López' },
            { id: 14, apellidos: 'Sotelo Martínez' }
        ];
        
        const updateStmt = db.prepare('UPDATE usuarios SET apellidos = ? WHERE id = ?');
        
        for (const diputado of diputadosApellidos) {
            updateStmt.run(diputado.apellidos, diputado.id);
            console.log(`Actualizado apellidos para ID ${diputado.id}: ${diputado.apellidos}`);
        }
        
        // También actualizar los nombres completos con el formato correcto
        const nombresActualizados = [
            { id: 18, nombre_completo: 'Abarca Peña Gerardo' },
            { id: 12, nombre_completo: 'Domínguez Mandujano Alfredo' },
            { id: 17, nombre_completo: 'Espinoza López Brenda' },
            { id: 6, nombre_completo: 'Gordillo Vega Andrea Valentina Guadalupe' },
            { id: 7, nombre_completo: 'Livera Chavarría Sergio Omar' },
            { id: 22, nombre_completo: 'Martínez Gómez Gonzala Eleonor' },
            { id: 5, nombre_completo: 'Martínez Terrazas Óscar Daniel' },
            { id: 8, nombre_completo: 'Maya Rendón Guillermina' },
            { id: 15, nombre_completo: 'Montes de Oca Montoya Martha Melissa' },
            { id: 21, nombre_completo: 'Pedrero González Luis Eduardo' },
            { id: 16, nombre_completo: 'Pimentel Mejía Isaac' },
            { id: 19, nombre_completo: 'Quevedo Maldonado Luz Dary' },
            { id: 10, nombre_completo: 'Reyes Reyes Rafael' },
            { id: 23, nombre_completo: 'Rodríguez López Ruth Cleotilde' },
            { id: 20, nombre_completo: 'Rodríguez Ruíz Tania Valentina' },
            { id: 11, nombre_completo: 'Ruíz Rodríguez Nayla Carolina' },
            { id: 24, nombre_completo: 'Sánchez Ortega Alberto' },
            { id: 13, nombre_completo: 'Sánchez Zavala Francisco Erik' },
            { id: 9, nombre_completo: 'Solano López Jazmín Juana' },
            { id: 14, nombre_completo: 'Sotelo Martínez Alfonso de Jesús' }
        ];
        
        const updateNombreStmt = db.prepare('UPDATE usuarios SET nombre_completo = ? WHERE id = ?');
        
        for (const diputado of nombresActualizados) {
            updateNombreStmt.run(diputado.nombre_completo, diputado.id);
            console.log(`Actualizado nombre para ID ${diputado.id}: ${diputado.nombre_completo}`);
        }
        
        console.log('✅ Apellidos y nombres actualizados exitosamente');
    } else {
        console.log('ℹ️ La columna apellidos ya existe');
    }
} catch (error) {
    console.error('❌ Error al agregar columna apellidos:', error);
} finally {
    db.close();
}