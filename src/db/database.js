const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'votacion.db'));

// Inicializar base de datos
db.serialize(() => {
    // Tabla de usuarios
    db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('superadmin', 'operador', 'secretario', 'diputado', 'servicios_legislativos')),
            nombre_completo TEXT NOT NULL,
            cargo_mesa_directiva TEXT DEFAULT '',
            cargo_coordinador TEXT DEFAULT '',
            partido TEXT DEFAULT '',
            comision TEXT DEFAULT '',
            cargo_legislativo TEXT DEFAULT '',
            foto_url TEXT DEFAULT '',
            activo INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabla de sesiones
    db.run(`
        CREATE TABLE IF NOT EXISTS sesiones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo_sesion TEXT UNIQUE,
            nombre TEXT NOT NULL,
            tipo_sesion TEXT DEFAULT 'ordinaria',
            activa INTEGER DEFAULT 0,
            estado TEXT DEFAULT 'preparada',
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
            fecha_clausura DATETIME,
            fecha_programada DATETIME,
            iniciada_por INTEGER,
            clausurada_por INTEGER,
            ejecutar_inmediato BOOLEAN DEFAULT 0,
            notas TEXT,
            FOREIGN KEY (iniciada_por) REFERENCES usuarios(id),
            FOREIGN KEY (clausurada_por) REFERENCES usuarios(id)
        )
    `);

    // Tabla de iniciativas
    db.run(`
        CREATE TABLE IF NOT EXISTS iniciativas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sesion_id INTEGER NOT NULL,
            numero INTEGER NOT NULL,
            numero_orden_dia INTEGER,
            titulo TEXT NOT NULL,
            descripcion TEXT,
            tipo_mayoria TEXT DEFAULT 'simple',
            presentador TEXT,
            partido_presentador TEXT,
            activa INTEGER DEFAULT 0,
            cerrada INTEGER DEFAULT 0,
            resultado TEXT,
            votos_favor INTEGER DEFAULT 0,
            votos_contra INTEGER DEFAULT 0,
            votos_abstencion INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sesion_id) REFERENCES sesiones (id)
        )
    `);

    // Tabla de votos
    db.run(`
        CREATE TABLE IF NOT EXISTS votos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            iniciativa_id INTEGER NOT NULL,
            usuario_id INTEGER NOT NULL,
            voto TEXT NOT NULL CHECK(voto IN ('favor', 'contra', 'abstencion')),
            fecha_voto DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (iniciativa_id) REFERENCES iniciativas (id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
            UNIQUE(iniciativa_id, usuario_id)
        )
    `);

    // Tabla de configuración del sistema
    db.run(`
        CREATE TABLE IF NOT EXISTS configuracion_sistema (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            logo_congreso TEXT DEFAULT '',
            logo_secundario TEXT DEFAULT '',
            nombre_congreso TEXT DEFAULT 'Congreso del Estado',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Tabla de partidos políticos
    db.run(`
        CREATE TABLE IF NOT EXISTS partidos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT UNIQUE NOT NULL,
            siglas TEXT UNIQUE NOT NULL,
            color_primario TEXT DEFAULT '#666666',
            logo_url TEXT DEFAULT '',
            activo INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Insertar configuración por defecto
    db.run(`INSERT OR IGNORE INTO configuracion_sistema (id, nombre_congreso) VALUES (1, 'Congreso del Estado')`);
    
    // Tabla de pase de lista
    db.run(`CREATE TABLE IF NOT EXISTS pase_lista (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sesion_id INTEGER,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        realizado_por INTEGER,
        finalizado BOOLEAN DEFAULT 0,
        confirmado BOOLEAN DEFAULT 0,
        total_presentes INTEGER DEFAULT 0,
        total_ausentes INTEGER DEFAULT 0,
        hora_finalizacion DATETIME,
        hora_confirmacion DATETIME,
        visible_pantalla BOOLEAN DEFAULT 0,
        FOREIGN KEY (sesion_id) REFERENCES sesiones(id),
        FOREIGN KEY (realizado_por) REFERENCES usuarios(id)
    )`);
    
    // Tabla de historial de sesiones
    db.run(`CREATE TABLE IF NOT EXISTS historial_sesiones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sesion_id INTEGER,
        fecha_evento DATETIME DEFAULT CURRENT_TIMESTAMP,
        tipo_evento TEXT,
        descripcion TEXT,
        usuario_id INTEGER,
        FOREIGN KEY (sesion_id) REFERENCES sesiones(id),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )`);
    
    // Tabla de documentos precargados
    db.run(`CREATE TABLE IF NOT EXISTS documentos_sesion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sesion_id INTEGER,
        nombre_archivo TEXT,
        fecha_carga DATETIME DEFAULT CURRENT_TIMESTAMP,
        cargado_por INTEGER,
        estado TEXT DEFAULT 'pendiente',
        FOREIGN KEY (sesion_id) REFERENCES sesiones(id),
        FOREIGN KEY (cargado_por) REFERENCES usuarios(id)
    )`);
    
    // Tabla de asistencias
    db.run(`CREATE TABLE IF NOT EXISTS asistencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pase_lista_id INTEGER,
        diputado_id INTEGER,
        asistencia TEXT CHECK(asistencia IN ('presente', 'ausente')),
        hora DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pase_lista_id) REFERENCES pase_lista(id),
        FOREIGN KEY (diputado_id) REFERENCES usuarios(id),
        UNIQUE(pase_lista_id, diputado_id)
    )`);
    
    // Tabla de sesiones precargadas
    db.run(`
        CREATE TABLE IF NOT EXISTS sesiones_precargadas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre_sesion TEXT NOT NULL,
            fecha_sesion DATE,
            descripcion TEXT,
            estado TEXT DEFAULT 'disponible' CHECK(estado IN ('disponible', 'importada', 'archivada')),
            creado_por INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (creado_por) REFERENCES usuarios(id)
        )
    `);

    // Tabla de iniciativas precargadas
    db.run(`
        CREATE TABLE IF NOT EXISTS iniciativas_precargadas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sesion_precargada_id INTEGER NOT NULL,
            numero INTEGER NOT NULL,
            numero_orden_dia INTEGER,
            titulo TEXT NOT NULL,
            descripcion TEXT,
            tipo_mayoria TEXT DEFAULT 'simple' CHECK(tipo_mayoria IN ('simple', 'calificada', 'especial')),
            presentador TEXT,
            partido_presentador TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sesion_precargada_id) REFERENCES sesiones_precargadas(id) ON DELETE CASCADE
        )
    `);
    
    // Tabla de documentos originales (PDF importados)
    db.run(`
        CREATE TABLE IF NOT EXISTS documentos_originales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sesion_id INTEGER NOT NULL,
            texto_original TEXT,
            fecha_carga DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sesion_id) REFERENCES sesiones(id) ON DELETE CASCADE
        )
    `);
    
    // Insertar partidos políticos por defecto
    const partidos = [
        { nombre: 'Morena', siglas: 'MORENA', color: '#8B1B1B' },
        { nombre: 'Partido Acción Nacional', siglas: 'PAN', color: '#1B4788' },
        { nombre: 'Movimiento Ciudadano', siglas: 'MC', color: '#FF6B00' },
        { nombre: 'Partido del Trabajo', siglas: 'PT', color: '#E31E24' },
        { nombre: 'Partido Verde Ecologista de México', siglas: 'PVEM', color: '#00A550' },
        { nombre: 'Partido Revolucionario Institucional', siglas: 'PRI', color: '#CD1C22' },
        { nombre: 'Nueva Alianza', siglas: 'NUEVA ALIANZA', color: '#00B8B2' }
    ];
    
    partidos.forEach(partido => {
        db.run(`INSERT OR IGNORE INTO partidos (nombre, siglas, color_primario) VALUES (?, ?, ?)`,
            [partido.nombre, partido.siglas, partido.color]);
    });

    // Crear usuarios por defecto
    const defaultPassword = bcrypt.hashSync('123456', 10);
    
    // Superadmin
    db.run(`INSERT OR IGNORE INTO usuarios (username, password, role, nombre_completo) 
            VALUES ('superadmin', ?, 'superadmin', 'Super Administrador')`, [defaultPassword]);
    
    // Operador
    db.run(`INSERT OR IGNORE INTO usuarios (username, password, role, nombre_completo) 
            VALUES ('operador', ?, 'operador', 'Operador del Sistema')`, [defaultPassword]);
    
    // Secretario
    db.run(`INSERT OR IGNORE INTO usuarios (username, password, role, nombre_completo) 
            VALUES ('secretario', ?, 'secretario', 'Secretario Legislativo')`, [defaultPassword]);
    
    // Servicios Legislativos
    db.run(`INSERT OR IGNORE INTO usuarios (username, password, role, nombre_completo) 
            VALUES ('servicios', ?, 'servicios_legislativos', 'Servicios Legislativos')`, [defaultPassword]);
    
    // Diputados reales del Congreso de Morelos
    const diputados = [
        // Diputados por Distrito
        {
            username: 'daniel.martinez',
            nombre: 'Daniel Martínez Terrazas',
            partido: 'PAN',
            comision: 'Comisión de Transporte, Movilidad y Vialidad',
            cargo_comision: 'Presidente',
            cargo_mesa: ''
        },
        {
            username: 'andrea.gordillo',
            nombre: 'Andrea Valentina Gordillo Vega',
            partido: 'PAN',
            comision: 'Comisión de Salud',
            cargo_comision: 'Presidente',
            cargo_mesa: ''
        },
        {
            username: 'sergio.livera',
            nombre: 'Sergio Omar Livera Chavarría',
            partido: 'MORENA',
            comision: 'Comisión de Derechos Humanos',
            cargo_comision: 'Presidente',
            cargo_mesa: ''
        },
        {
            username: 'guillermina.maya',
            nombre: 'Guillermina Maya Rendón',
            partido: 'MORENA',
            comision: 'Comisión de Puntos Constitucionales y Legislación',
            cargo_comision: 'Presidente',
            cargo_mesa: 'secretario1'
        },
        {
            username: 'jazmin.solano',
            nombre: 'Jazmín Juana Solano López',
            partido: 'MORENA',
            comision: 'Comisión de la Juventud',
            cargo_comision: 'Presidente',
            cargo_mesa: '',
            cargo_coordinador: 'Coordinadora Grupo Parlamentario MORENA'
        },
        {
            username: 'rafael.reyes',
            nombre: 'Rafael Reyes Reyes',
            partido: 'MORENA',
            comision: 'Comisión de Desarrollo Económico',
            cargo_comision: 'Presidente',
            cargo_mesa: ''
        },
        {
            username: 'nayla.ruiz',
            nombre: 'Nayla Carolina Ruiz Rodríguez',
            partido: 'MORENA',
            comision: 'Comisión de Seguridad Pública y Protección Civil',
            cargo_comision: 'Presidente',
            cargo_mesa: ''
        },
        {
            username: 'alfredo.dominguez',
            nombre: 'Alfredo Domínguez Mandujano',
            partido: 'MORENA',
            comision: 'Comisión del Deporte',
            cargo_comision: 'Presidente',
            cargo_mesa: ''
        },
        {
            username: 'erik.sanchez',
            nombre: 'Francisco Erik Sánchez Zavala',
            partido: 'PAN',
            comision: 'Comisión de Turismo',
            cargo_comision: 'Presidente',
            cargo_mesa: '',
            cargo_coordinador: 'Coordinador Grupo Parlamentario PAN'
        },
        {
            username: 'alfonso.sotelo',
            nombre: 'Alfonso de Jesús Sotelo Martínez',
            partido: 'MORENA',
            comision: 'Comisión de Gobernación y Gran Jurado',
            cargo_comision: 'Presidente',
            cargo_mesa: ''
        },
        {
            username: 'melissa.montes',
            nombre: 'Melissa Montes de Oca Montoya',
            partido: 'MORENA',
            comision: 'Comisión de Educación y Cultura',
            cargo_comision: 'Presidente',
            cargo_mesa: ''
        },
        // Diputados Plurinominales
        {
            username: 'isaac.pimentel',
            nombre: 'Isaac Pimentel Mejía',
            partido: 'MORENA',
            comision: 'Comisión de Reglamentos, Investigación, Prácticas y Relaciones Parlamentarias',
            cargo_comision: 'Integrante',
            cargo_mesa: 'presidente'
        },
        {
            username: 'brenda.espinoza',
            nombre: 'Brenda Espinoza López',
            partido: 'MORENA',
            comision: 'Comisión de Igualdad de Género',
            cargo_comision: 'Presidente',
            cargo_mesa: ''
        },
        {
            username: 'gerardo.abarca',
            nombre: 'Gerardo Abarca Peña',
            partido: 'PAN',
            comision: 'Comisión de Hacienda, Presupuesto y Cuenta Pública',
            cargo_comision: 'Presidente',
            cargo_mesa: ''
        },
        {
            username: 'luz.quevedo',
            nombre: 'Luz Dary Quevedo Maldonado',
            partido: 'MC',
            comision: 'Comisión de Desarrollo Agropecuario',
            cargo_comision: 'Presidente',
            cargo_mesa: '',
            cargo_coordinador: 'Coordinadora Grupo Parlamentario MC'
        },
        {
            username: 'tania.rodriguez',
            nombre: 'Tania Valentina Rodríguez Ruiz',
            partido: 'PT',
            comision: 'Comisión de Medio Ambiente, Recursos Naturales y Agua',
            cargo_comision: 'Presidente',
            cargo_mesa: '',
            cargo_coordinador: 'Coordinadora Grupo Parlamentario PT'
        },
        {
            username: 'luis.pedrero',
            nombre: 'Luis Eduardo Pedrero González',
            partido: 'PVEM',
            comision: 'Comisión de Ciencia, Tecnología e Innovación',
            cargo_comision: 'Presidente',
            cargo_mesa: '',
            cargo_coordinador: 'Coordinador Grupo Parlamentario PVEM'
        },
        {
            username: 'eleonor.martinez',
            nombre: 'Eleonor Martínez Gómez',
            partido: 'PRI',
            comision: 'Comisión de Desarrollo Social',
            cargo_comision: 'Presidente',
            cargo_mesa: 'vicepresidente',
            cargo_coordinador: 'Coordinadora Grupo Parlamentario PRI'
        },
        {
            username: 'ruth.rodriguez',
            nombre: 'Ruth Cleotilde Rodríguez López',
            partido: 'NUEVA ALIANZA',
            comision: 'Comisión del Trabajo, Previsión y Seguridad Social',
            cargo_comision: 'Presidente',
            cargo_mesa: '',
            cargo_coordinador: 'Coordinadora Grupo Parlamentario Nueva Alianza'
        },
        {
            username: 'alberto.sanchez',
            nombre: 'Alberto Sánchez Ortega',
            partido: 'MORENA',
            comision: 'Comisión de Desarrollo Urbano y Obras Públicas',
            cargo_comision: 'Integrante',
            cargo_mesa: 'secretario2'
        }
    ];
    
    // Crear cada diputado
    diputados.forEach(diputado => {
        const cargoLegislativo = diputado.cargo_comision ? 
            `${diputado.cargo_comision} - ${diputado.comision}` : 
            diputado.comision;
            
        db.run(`INSERT OR IGNORE INTO usuarios 
                (username, password, role, nombre_completo, partido, cargo_mesa_directiva, 
                 cargo_coordinador, comision, cargo_legislativo, activo) 
                VALUES (?, ?, 'diputado', ?, ?, ?, ?, ?, ?, ?)`, 
                [
                    diputado.username, 
                    defaultPassword, 
                    diputado.nombre,
                    diputado.partido,
                    diputado.cargo_mesa || '',
                    diputado.cargo_coordinador || '',
                    diputado.comision,
                    cargoLegislativo,
                    diputado.cargo_mesa ? 1 : 1  // Todos activos por defecto
                ]);
    });
    
    console.log('✅ Base de datos inicializada');
});

module.exports = db;