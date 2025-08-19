const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'votacion.db');
const db = new sqlite3.Database(dbPath);

console.log('\n===== TEST DE PERMISOS PASE DE LISTA =====\n');

// Simular el usuario secretario (ID 3)
const userId = 3;

db.get('SELECT cargo_mesa_directiva, role FROM usuarios WHERE id = ?', [userId], (err, userData) => {
    if (err) {
        console.error('Error obteniendo usuario:', err);
        db.close();
        return;
    }
    
    console.log('Datos del usuario ID 3 (Secretario Legislativo):');
    console.log('Role:', userData.role);
    console.log('Cargo Mesa Directiva:', userData.cargo_mesa_directiva);
    
    // Verificar permisos
    const esSecretarioMesa = userData.cargo_mesa_directiva === 'secretario1' || 
                              userData.cargo_mesa_directiva === 'secretario2';
    const esSecretarioLegislativo = userData.role === 'secretario';
    
    console.log('\n¿Es Secretario de Mesa?:', esSecretarioMesa);
    console.log('¿Es Secretario Legislativo?:', esSecretarioLegislativo);
    console.log('¿Tiene permisos?:', esSecretarioMesa || esSecretarioLegislativo);
    
    if (!esSecretarioMesa && !esSecretarioLegislativo) {
        console.log('\n❌ NO TIENE PERMISOS para marcar asistencia');
    } else {
        console.log('\n✓ SÍ TIENE PERMISOS para marcar asistencia');
    }
    
    db.close();
});