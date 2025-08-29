-- Migración para agregar columna partido_presentador a la tabla iniciativas
-- Esta columna almacena el partido político del presentador de la iniciativa

-- Agregar columna partido_presentador si no existe
ALTER TABLE iniciativas ADD COLUMN partido_presentador TEXT;