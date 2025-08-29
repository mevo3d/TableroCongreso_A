-- Migración para crear tablas de sesiones precargadas
-- Ejecutar con: sqlite3 votacion.db < src/db/migrations/004_sesiones_precargadas.sql

-- Tabla de sesiones precargadas por Servicios Legislativos
CREATE TABLE IF NOT EXISTS sesiones_precargadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_sesion TEXT NOT NULL UNIQUE,
    nombre_sesion TEXT NOT NULL,
    descripcion TEXT,
    fecha_sesion DATETIME,
    fecha_propuesta DATETIME,
    estado TEXT DEFAULT 'borrador' CHECK(estado IN ('borrador', 'disponible', 'usada', 'cancelada')),
    creado_por INTEGER REFERENCES usuarios(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    cargada_por INTEGER REFERENCES usuarios(id),
    fecha_carga DATETIME,
    fecha_envio DATETIME,
    usado_por INTEGER REFERENCES usuarios(id),
    fecha_uso DATETIME,
    sesion_id_generada INTEGER REFERENCES sesiones(id),
    archivo_origen TEXT,
    metodo_carga TEXT CHECK(metodo_carga IN ('excel', 'pdf', 'manual'))
);

-- Tabla de iniciativas precargadas
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
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_sesiones_precargadas_estado ON sesiones_precargadas(estado);
CREATE INDEX IF NOT EXISTS idx_sesiones_precargadas_creado_por ON sesiones_precargadas(creado_por);
CREATE INDEX IF NOT EXISTS idx_iniciativas_precargadas_sesion ON iniciativas_precargadas(sesion_precargada_id);

-- Vista para facilitar consultas
CREATE VIEW IF NOT EXISTS vista_sesiones_precargadas AS
SELECT 
    sp.id,
    sp.codigo_sesion,
    sp.nombre_sesion,
    sp.descripcion,
    sp.fecha_sesion,
    sp.estado,
    sp.created_at,
    sp.fecha_envio,
    u1.nombre_completo as creado_por_nombre,
    u2.nombre_completo as usado_por_nombre,
    COUNT(ip.id) as total_iniciativas
FROM sesiones_precargadas sp
LEFT JOIN usuarios u1 ON sp.creado_por = u1.id
LEFT JOIN usuarios u2 ON sp.usado_por = u2.id
LEFT JOIN iniciativas_precargadas ip ON sp.id = ip.sesion_precargada_id
GROUP BY sp.id;