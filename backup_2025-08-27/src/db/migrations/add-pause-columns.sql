-- Migración para agregar columnas de pausa a la tabla sesiones
-- Estas columnas son necesarias para el manejo de pausas durante la sesión

-- Agregar columna tiempo_pausa_hasta si no existe
ALTER TABLE sesiones ADD COLUMN tiempo_pausa_hasta DATETIME;

-- Agregar columna pausada_por si no existe
ALTER TABLE sesiones ADD COLUMN pausada_por INTEGER;

-- Agregar columna pausada_en si no existe
ALTER TABLE sesiones ADD COLUMN pausada_en DATETIME;