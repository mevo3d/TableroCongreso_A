-- Migración para agregar columnas fecha_inicio y hora_inicio a la tabla sesiones
-- Estas columnas son necesarias para rastrear cuándo el presidente inicia la sesión

-- Agregar columna fecha_inicio si no existe
ALTER TABLE sesiones ADD COLUMN fecha_inicio DATETIME;

-- Agregar columna hora_inicio si no existe  
ALTER TABLE sesiones ADD COLUMN hora_inicio DATETIME;

-- Agregar columna pausada si no existe
ALTER TABLE sesiones ADD COLUMN pausada INTEGER DEFAULT 0;

-- Agregar columna pase_lista_activo si no existe
ALTER TABLE sesiones ADD COLUMN pase_lista_activo INTEGER DEFAULT 0;

-- Actualizar sesiones activas existentes para marcarlas como iniciadas
UPDATE sesiones 
SET fecha_inicio = fecha,
    hora_inicio = fecha
WHERE activa = 1 AND fecha_inicio IS NULL;