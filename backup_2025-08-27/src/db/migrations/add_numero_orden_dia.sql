-- Agregar campo numero_orden_dia a las tablas de iniciativas
-- Este campo guarda el número original del orden del día

-- Tabla iniciativas (sesiones activas)
ALTER TABLE iniciativas 
ADD COLUMN numero_orden_dia INTEGER;

-- Tabla iniciativas_precargadas (sesiones preparadas)
ALTER TABLE iniciativas_precargadas 
ADD COLUMN numero_orden_dia INTEGER;

-- Actualizar registros existentes con el mismo número que tienen actualmente
UPDATE iniciativas SET numero_orden_dia = numero WHERE numero_orden_dia IS NULL;
UPDATE iniciativas_precargadas SET numero_orden_dia = numero WHERE numero_orden_dia IS NULL;