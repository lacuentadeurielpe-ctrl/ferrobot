-- Libros contables mensuales: ventas (y futuro: compras)
-- FERRETERÍA AISLADA: RLS + filtro explícito por ferreteria_id en todo el código

CREATE TABLE libros_contables (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id        UUID NOT NULL REFERENCES ferreterias(id) ON DELETE CASCADE,
  periodo              CHAR(6) NOT NULL,        -- YYYYMM ej: '202604'
  tipo_libro           TEXT NOT NULL,           -- 'ventas' | 'compras' | 'inventario'
  estado               TEXT NOT NULL DEFAULT 'borrador', -- 'borrador' | 'cerrado'

  -- Totales del periodo (pre-calculados al generar)
  total_registros      INTEGER       NOT NULL DEFAULT 0,
  total_ventas         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_igv            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_base_imponible NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_boletas        INTEGER       NOT NULL DEFAULT 0,
  total_facturas       INTEGER       NOT NULL DEFAULT 0,

  -- Contenido PLE generado (texto listo para subir a SUNAT)
  contenido_ple        TEXT,

  -- Auditoría
  generado_at          TIMESTAMPTZ DEFAULT NOW(),
  cerrado_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (ferreteria_id, periodo, tipo_libro)
);

ALTER TABLE libros_contables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "libros_tenant_isolation" ON libros_contables
  FOR ALL USING (ferreteria_id = mi_ferreteria_id());

CREATE INDEX idx_libros_ferreteria_periodo
  ON libros_contables(ferreteria_id, periodo DESC);
