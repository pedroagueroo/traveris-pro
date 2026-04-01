-- ============================================================
-- MIGRACIÓN FASE 1: Columnas faltantes + fix editar reserva
-- Ejecutar contra Neon.tech PostgreSQL
-- ============================================================

-- 1. Agregar hora_salida y hora_llegada a servicios de vuelo
--    Causa raíz del error 500 al editar reservas con vuelos
ALTER TABLE reserva_servicios_detallados 
  ADD COLUMN IF NOT EXISTS hora_salida VARCHAR(10),
  ADD COLUMN IF NOT EXISTS hora_llegada VARCHAR(10);

-- 2. Agregar fecha_llegada para el requerimiento de servicio vuelos
ALTER TABLE reserva_servicios_detallados 
  ADD COLUMN IF NOT EXISTS fecha_llegada DATE;

-- 3. Agregar campos operador/expediente/observaciones a nivel servicio
--    (Estos se mueven del nivel reserva al nivel servicio en Fase 2)
ALTER TABLE reserva_servicios_detallados
  ADD COLUMN IF NOT EXISTS operador_mayorista VARCHAR(200),
  ADD COLUMN IF NOT EXISTS nro_expediente VARCHAR(100),
  ADD COLUMN IF NOT EXISTS observaciones_servicio TEXT;

-- 4. Verificación
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'reserva_servicios_detallados' 
ORDER BY ordinal_position;
