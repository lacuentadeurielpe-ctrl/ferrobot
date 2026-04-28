-- 016_pin_repartidores.sql
-- PIN de seguridad para empleados (miembros_ferreteria) y repartidores
-- pin_hash guarda el hash PBKDF2 del PIN de 4 dígitos
-- IF NOT EXISTS → seguro aplicar aunque la columna ya exista

ALTER TABLE miembros_ferreteria
  ADD COLUMN IF NOT EXISTS pin_hash TEXT;

ALTER TABLE repartidores
  ADD COLUMN IF NOT EXISTS pin_hash TEXT;

COMMENT ON COLUMN miembros_ferreteria.pin_hash IS
  'Hash PBKDF2 del PIN de 4 dígitos del empleado. NULL = sin PIN configurado.';

COMMENT ON COLUMN repartidores.pin_hash IS
  'Hash PBKDF2 del PIN de 4 dígitos del repartidor. NULL = sin PIN configurado.';
