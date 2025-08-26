const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Conectar a la base de datos
const db = new sqlite3.Database(path.join(__dirname, 'src/db/votacion.db'));

// Array con las actualizaciones
const actualizaciones = [
    {
        username: 'daniel.martinez',
        comision: 'Comisión de la Juventud',
        cargo_legislativo: 'Presidente - Comisión de la Juventud'
    },
    {
        username: 'andrea.gordillo',
        comision: 'Comisión de Hacienda, Presupuesto y Cuenta Pública',
        cargo_legislativo: 'Presidente - Comisión de Hacienda, Presupuesto y Cuenta Pública'
    },
    {
        username: 'sergio.livera',
        comision: 'Comisión de Gobernación y Gran Jurado / Comisión de Movilidad, Tránsito, Transporte y Vías de Comunicación',
        cargo_legislativo: 'Presidente - Comisión de Gobernación y Gran Jurado / Comisión de Movilidad, Tránsito, Transporte y Vías de Comunicación'
    },
    {
        username: 'guillermina.maya',
        comision: 'Comisión de Fortalecimiento Municipal, Desarrollo Regional y Pueblos Indígenas',
        cargo_legislativo: 'Presidente - Comisión de Fortalecimiento Municipal, Desarrollo Regional y Pueblos Indígenas'
    },
    {
        username: 'jazmin.solano',
        comision: '',
        cargo_legislativo: '',
        cargo_coordinador: ''
    },
    {
        username: 'rafael.reyes',
        comision: '',
        cargo_legislativo: '',
        cargo_coordinador: 'Coordinador Grupo Parlamentario MORENA'
    },
    {
        username: 'nayla.ruiz',
        comision: 'Comisión para la Reconstrucción del Estado de Morelos',
        cargo_legislativo: 'Presidente - Comisión para la Reconstrucción del Estado de Morelos'
    },
    {
        username: 'alfredo.dominguez',
        comision: 'Comisión de Desarrollo Agropecuario / Comisión de Desarrollo y Conflictos Agrarios',
        cargo_legislativo: 'Presidente - Comisión de Desarrollo Agropecuario / Comisión de Desarrollo y Conflictos Agrarios'
    },
    {
        username: 'erik.sanchez',
        comision: 'Comisión de Ciencia e Innovación Tecnológica / Comisión de Turismo',
        cargo_legislativo: 'Presidente - Comisión de Ciencia e Innovación Tecnológica / Comisión de Turismo'
    },
    {
        username: 'alfonso.sotelo',
        comision: 'Comisión de Seguridad Pública y Protección Civil / Comisión de Planeación para Desarrollo Social, Metropolitano, Zonas Conurbadas y Asentamientos Humanos',
        cargo_legislativo: 'Presidente - Comisión de Seguridad Pública y Protección Civil / Comisión de Planeación para Desarrollo Social, Metropolitano, Zonas Conurbadas y Asentamientos Humanos'
    },
    {
        username: 'melissa.montes',
        comision: 'Comisión de Puntos Constitucionales y Legislación / Comisión de Igualdad de Género',
        cargo_legislativo: 'Presidente - Comisión de Puntos Constitucionales y Legislación / Comisión de Igualdad de Género'
    },
    {
        username: 'isaac.pimentel',
        comision: '',
        cargo_legislativo: '',
        cargo_mesa_directiva: 'presidente'
    },
    {
        username: 'brenda.espinoza',
        comision: 'Comisión de Atención a la Diversidad Sexual / Comisión de Desarrollo y Conflictos Agrarios',
        cargo_legislativo: 'Presidente - Comisión de Atención a la Diversidad Sexual / Comisión de Desarrollo y Conflictos Agrarios'
    },
    {
        username: 'gerardo.abarca',
        comision: 'Comisión de Desarrollo Económico / Comisión para el Seguimiento al Cumplimiento de la Agenda 2030',
        cargo_legislativo: 'Presidente - Comisión de Desarrollo Económico / Comisión para el Seguimiento al Cumplimiento de la Agenda 2030'
    },
    {
        username: 'luz.quevedo',
        comision: 'Comisión de Deporte',
        cargo_legislativo: 'Presidente - Comisión de Deporte'
    },
    {
        username: 'tania.rodriguez',
        comision: 'Comisión de Trabajo, Previsión y Seguridad Social',
        cargo_legislativo: 'Presidente - Comisión de Trabajo, Previsión y Seguridad Social'
    },
    {
        username: 'luis.pedrero',
        comision: 'Comisión de Justicia, Derechos Humanos y Atención a Víctimas / Comisión de Medio Ambiente, Recursos Naturales y Agua',
        cargo_legislativo: 'Presidente - Comisión de Justicia, Derechos Humanos y Atención a Víctimas / Comisión de Medio Ambiente, Recursos Naturales y Agua'
    },
    {
        username: 'eleonor.martinez',
        comision: 'Comisión de Salud / Comisión de Energía',
        cargo_legislativo: 'Presidente - Comisión de Salud / Comisión de Energía'
    },
    {
        username: 'ruth.rodriguez',
        comision: 'Comisión de Educación y Cultura / Comisión de Familia y Derechos de la Niñez',
        cargo_legislativo: 'Presidente - Comisión de Educación y Cultura / Comisión de Familia y Derechos de la Niñez'
    },
    {
        username: 'alberto.sanchez',
        comision: 'Comisión de Atención a Grupos Vulnerables, Migrantes y Personas con Discapacidad / Comisión de Transparencia, Protección de Datos Personales y Anticorrupción / Comisión de Ética Legislativa',
        cargo_legislativo: 'Presidente - Comisión de Atención a Grupos Vulnerables, Migrantes y Personas con Discapacidad / Comisión de Transparencia, Protección de Datos Personales y Anticorrupción / Comisión de Ética Legislativa',
        partido: 'PT'
    }
];

console.log('🔄 Actualizando comisiones de diputados...\n');

let actualizados = 0;
let errores = 0;

// Función para actualizar cada diputado
function actualizarDiputado(diputado) {
    return new Promise((resolve, reject) => {
        let updateQuery = 'UPDATE usuarios SET ';
        const params = [];
        const updates = [];

        if (diputado.comision !== undefined) {
            updates.push('comision = ?');
            params.push(diputado.comision);
        }
        
        if (diputado.cargo_legislativo !== undefined) {
            updates.push('cargo_legislativo = ?');
            params.push(diputado.cargo_legislativo);
        }
        
        if (diputado.cargo_coordinador !== undefined) {
            updates.push('cargo_coordinador = ?');
            params.push(diputado.cargo_coordinador);
        }
        
        if (diputado.cargo_mesa_directiva !== undefined) {
            updates.push('cargo_mesa_directiva = ?');
            params.push(diputado.cargo_mesa_directiva);
        }
        
        if (diputado.partido !== undefined) {
            updates.push('partido = ?');
            params.push(diputado.partido);
        }

        updateQuery += updates.join(', ');
        updateQuery += ' WHERE username = ?';
        params.push(diputado.username);

        db.run(updateQuery, params, function(err) {
            if (err) {
                console.error(`❌ Error actualizando ${diputado.username}:`, err.message);
                errores++;
                reject(err);
            } else if (this.changes === 0) {
                console.log(`⚠️  Usuario ${diputado.username} no encontrado`);
                reject(new Error('Usuario no encontrado'));
            } else {
                console.log(`✅ ${diputado.username} actualizado correctamente`);
                actualizados++;
                resolve();
            }
        });
    });
}

// Ejecutar todas las actualizaciones
async function ejecutarActualizaciones() {
    for (const diputado of actualizaciones) {
        try {
            await actualizarDiputado(diputado);
        } catch (error) {
            // Continuar con el siguiente
        }
    }
    
    console.log('\n📊 Resumen:');
    console.log(`   ✅ Actualizados: ${actualizados}`);
    console.log(`   ❌ Errores: ${errores}`);
    console.log(`   📝 Total procesados: ${actualizaciones.length}`);
    
    db.close();
}

// Ejecutar
ejecutarActualizaciones();