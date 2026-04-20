-- F3: Upseller inteligente — tabla de productos complementarios
--
-- Almacena pares de productos que van bien juntos.
-- Dos orígenes:
--   'manual'  → el dueño los configuró explícitamente en Settings
--   'auto'    → detectados por el cron semanal a partir de co-compras reales
--
-- FERRETERÍA AISLADA: ferreteria_id en cada fila, RLS incluido.

CREATE TABLE productos_complementarios (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id      UUID REFERENCES ferreterias(id) ON DELETE CASCADE NOT NULL,

  -- El producto "base" que dispara la sugerencia
  producto_id        UUID REFERENCES productos(id) ON DELETE CASCADE NOT NULL,

  -- El producto que se va a sugerir
  complementario_id  UUID REFERENCES productos(id) ON DELETE CASCADE NOT NULL,

  -- 'manual' = dueño lo configuró; 'auto' = detectado por cron
  tipo               TEXT NOT NULL DEFAULT 'manual' CHECK (tipo IN ('manual', 'auto')),

  -- Frecuencia de co-compra (0.0–1.0). Solo relevante para tipo='auto'.
  -- Representa: "de cada 10 pedidos con producto_id, X también tienen complementario_id"
  frecuencia         NUMERIC(4,3) NOT NULL DEFAULT 1.0 CHECK (frecuencia BETWEEN 0 AND 1),

  -- Soft-delete: el dueño puede desactivar un par sin borrarlo
  activo             BOOLEAN NOT NULL DEFAULT true,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un par (producto → complementario) es único por ferretería
  UNIQUE (ferreteria_id, producto_id, complementario_id)
);

-- Índices
CREATE INDEX idx_comp_ferreteria      ON productos_complementarios (ferreteria_id);
CREATE INDEX idx_comp_producto_activo ON productos_complementarios (ferreteria_id, producto_id, activo);

-- RLS
ALTER TABLE productos_complementarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ferreteria_access_complementarios"
ON productos_complementarios
FOR ALL USING (ferreteria_id = mi_ferreteria_id());

-- Trigger updated_at
CREATE TRIGGER set_updated_at_complementarios
  BEFORE UPDATE ON productos_complementarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
