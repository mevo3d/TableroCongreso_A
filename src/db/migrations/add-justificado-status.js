const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'votacion.db');
const db = new Database(dbPath);

try {
    // Agregar columna justificacion_motivo para almacenar la razón de la justificación
    console.log('Agregando columna justificacion_motivo a la tabla asistencias...');
    db.exec(`
        ALTER TABLE asistencias 
        ADD COLUMN justificacion_motivo TEXT
    `);
    console.log('✓ Columna justificacion_motivo agregada');
    
    // Agregar columna hora_justificacion para registrar cuando se justificó
    console.log('Agregando columna hora_justificacion a la tabla asistencias...');
    db.exec(`
        ALTER TABLE asistencias 
        ADD COLUMN hora_justificacion DATETIME
    `);
    console.log('✓ Columna hora_justificacion agregada');
    
    // Agregar columna justificado_por para saber quién justificó la inasistencia
    console.log('Agregando columna justificado_por a la tabla asistencias...');
    db.exec(`
        ALTER TABLE asistencias 
        ADD COLUMN justificado_por INTEGER REFERENCES usuarios(id)
    `);
    console.log('✓ Columna justificado_por agregada');
    
    // Agregar columna hora_pase_lista_inicial a la tabla pase_lista
    console.log('Agregando columna hora_pase_lista_inicial a la tabla pase_lista...');
    db.exec(`
        ALTER TABLE pase_lista 
        ADD COLUMN hora_pase_lista_inicial DATETIME
    `);
    console.log('✓ Columna hora_pase_lista_inicial agregada');
    
    console.log('✅ Migración completada exitosamente');
} catch (error) {
    if (error.message.includes('duplicate column name')) {
        console.log('Las columnas ya existen, no se requiere migración');
    } else {
        console.error('Error en la migración:', error);
        process.exit(1);
    }
} finally {
    db.close();
}