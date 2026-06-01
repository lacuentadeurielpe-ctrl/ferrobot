-- Agregar soporte para códigos de barras en productos
ALTER TABLE productos
ADD COLUMN IF NOT EXISTS codigo_barras TEXT;

-- Crear un índice para búsquedas ultra-rápidas con el escáner (o pistola láser)
CREATE INDEX idx_productos_codigo_barras ON productos(codigo_barras);

-- El código debe ser único dentro de la misma ferretería
ALTER TABLE productos
ADD CONSTRAINT unique_codigo_barras_por_ferreteria UNIQUE (ferreteria_id, codigo_barras);
