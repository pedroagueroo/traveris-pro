-- FASE 3: Sistema de Pagos - Migraciones

-- 1. Tabla tarjetas guardadas por empresa
CREATE TABLE IF NOT EXISTS tarjetas_guardadas (
  id SERIAL PRIMARY KEY,
  empresa_nombre VARCHAR(200) NOT NULL,
  alias VARCHAR(100),
  ultimos_4 VARCHAR(4),
  tipo_tarjeta VARCHAR(50),
  banco VARCHAR(100),
  vencimiento VARCHAR(7),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Campos operativos a nivel servicio (si no existen ya)
ALTER TABLE reserva_servicios_detallados
  ADD COLUMN IF NOT EXISTS operador_mayorista VARCHAR(200),
  ADD COLUMN IF NOT EXISTS nro_expediente VARCHAR(100),
  ADD COLUMN IF NOT EXISTS observaciones_servicio TEXT;

-- 3. Ampliar movimientos_caja con referencia a tarjeta
ALTER TABLE movimientos_caja
  ADD COLUMN IF NOT EXISTS id_tarjeta_guardada INTEGER REFERENCES tarjetas_guardadas(id),
  ADD COLUMN IF NOT EXISTS tarjeta_cuotas INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tarjeta_interes NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarjeta_monto_total NUMERIC(14,2);
