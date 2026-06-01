-- Migración para añadir soporte de productos informales (sin factura)
-- Todos los productos existentes se consideran facturables por defecto

ALTER TABLE productos 
ADD COLUMN IF NOT EXISTS facturable BOOLEAN DEFAULT true;

-- Asegurar que los productos existentes tengan true
UPDATE productos SET facturable = true WHERE facturable IS NULL;

-- Hacerlo not null para forzar integridad
ALTER TABLE productos
ALTER COLUMN facturable SET NOT NULL;
