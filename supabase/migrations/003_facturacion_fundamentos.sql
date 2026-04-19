-- ══════════════════════════════════════════════════════════════════
-- MIGRACIÓN 003 — Fundamentos de facturación / tipo RUC
-- F1 del módulo de comprobantes electrónicos
-- Aplicada en 3 partes vía Supabase MCP (2026-04-18)
-- ══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════
-- PARTE 1 — Columnas tributarias en ferreterias, productos, clientes
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE ferreterias
  ADD COLUMN IF NOT EXISTS tipo_ruc                   TEXT    NOT NULL DEFAULT 'sin_ruc'
                                                               CHECK (tipo_ruc IN ('sin_ruc','ruc10','ruc20')),
  ADD COLUMN IF NOT EXISTS ruc                        TEXT,
  ADD COLUMN IF NOT EXISTS razon_social               TEXT,
  ADD COLUMN IF NOT EXISTS nombre_comercial           TEXT,
  ADD COLUMN IF NOT EXISTS regimen_tributario         TEXT
                                                               CHECK (regimen_tributario IN ('rer','rmt','rus','general') OR regimen_tributario IS NULL),
  ADD COLUMN IF NOT EXISTS serie_boletas              TEXT    NOT NULL DEFAULT 'B001',
  ADD COLUMN IF NOT EXISTS serie_facturas             TEXT    NOT NULL DEFAULT 'F001',
  ADD COLUMN IF NOT EXISTS igv_incluido_en_precios    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS representante_legal_nombre TEXT,
  ADD COLUMN IF NOT EXISTS representante_legal_dni    TEXT,
  ADD COLUMN IF NOT EXISTS representante_legal_cargo  TEXT    DEFAULT 'Gerente General';

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS afecto_igv BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS ruc_cliente  TEXT,
  ADD COLUMN IF NOT EXISTS tipo_persona TEXT
                                         CHECK (tipo_persona IN ('natural','juridica') OR tipo_persona IS NULL);

-- ══════════════════════════════════════════════════════════════════
-- PARTE 2 — Ampliar tabla comprobantes
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE comprobantes ALTER COLUMN pedido_id DROP NOT NULL;

ALTER TABLE comprobantes
  ADD COLUMN IF NOT EXISTS tipo             TEXT    CHECK (tipo IN ('nota_venta','boleta','factura')),
  ADD COLUMN IF NOT EXISTS serie            TEXT,
  ADD COLUMN IF NOT EXISTS numero           INTEGER,
  ADD COLUMN IF NOT EXISTS numero_completo  TEXT,
  ADD COLUMN IF NOT EXISTS estado           TEXT    NOT NULL DEFAULT 'emitido'
                                                     CHECK (estado IN ('emitido','anulado','error')),
  ADD COLUMN IF NOT EXISTS subtotal         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS igv              NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total            NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS cliente_nombre   TEXT,
  ADD COLUMN IF NOT EXISTS cliente_ruc_dni  TEXT,
  ADD COLUMN IF NOT EXISTS nubefact_id      TEXT,
  ADD COLUMN IF NOT EXISTS nubefact_hash    TEXT,
  ADD COLUMN IF NOT EXISTS xml_url          TEXT,
  ADD COLUMN IF NOT EXISTS emitido_por      TEXT;

-- Backfill filas existentes (formato CP-000001)
UPDATE comprobantes
   SET tipo            = 'nota_venta',
       serie           = 'NV001',
       numero          = CAST(SUBSTRING(numero_comprobante FROM '[0-9]+$') AS INTEGER),
       numero_completo = numero_comprobante
 WHERE tipo IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'comprobantes'
      AND constraint_name = 'comprobantes_unique_correlativo'
  ) THEN
    ALTER TABLE comprobantes
      ADD CONSTRAINT comprobantes_unique_correlativo
        UNIQUE (ferreteria_id, tipo, serie, numero);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_comprobantes_ferreteria ON comprobantes (ferreteria_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_pedido     ON comprobantes (pedido_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_tipo_serie ON comprobantes (ferreteria_id, tipo, serie);

ALTER TABLE comprobantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comprobantes_tenant_select" ON comprobantes;
DROP POLICY IF EXISTS "comprobantes_tenant_insert" ON comprobantes;
DROP POLICY IF EXISTS "comprobantes_tenant_update" ON comprobantes;

CREATE POLICY "comprobantes_tenant_select" ON comprobantes
  FOR SELECT USING (ferreteria_id = mi_ferreteria_id());
CREATE POLICY "comprobantes_tenant_insert" ON comprobantes
  FOR INSERT WITH CHECK (ferreteria_id = mi_ferreteria_id());
CREATE POLICY "comprobantes_tenant_update" ON comprobantes
  FOR UPDATE USING (ferreteria_id = mi_ferreteria_id());

-- ══════════════════════════════════════════════════════════════════
-- PARTE 3 — Funciones de correlativo
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION generar_numero_comprobante(
  p_ferreteria_id UUID,
  p_tipo          TEXT,
  p_serie         TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_siguiente INTEGER;
  v_lock_key  BIGINT;
BEGIN
  v_lock_key := hashtext(p_ferreteria_id::text || p_tipo || p_serie);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(numero), 0) + 1
    INTO v_siguiente
    FROM comprobantes
   WHERE ferreteria_id = p_ferreteria_id
     AND tipo          = p_tipo
     AND serie         = p_serie;

  RETURN v_siguiente;
END;
$$;

CREATE OR REPLACE FUNCTION emitir_nota_venta(
  p_ferreteria_id  UUID,
  p_pedido_id      UUID,
  p_serie          TEXT,
  p_total          NUMERIC,
  p_cliente_nombre TEXT,
  p_emitido_por    TEXT DEFAULT 'dashboard'
)
RETURNS comprobantes
LANGUAGE plpgsql
AS $$
DECLARE
  v_numero   INTEGER;
  v_completo TEXT;
  v_row      comprobantes;
BEGIN
  v_numero   := generar_numero_comprobante(p_ferreteria_id, 'nota_venta', p_serie);
  v_completo := 'NV-' || p_serie || '-' || lpad(v_numero::text, 6, '0');

  INSERT INTO comprobantes (
    ferreteria_id, pedido_id,
    tipo, serie, numero, numero_completo,
    subtotal, igv, total,
    cliente_nombre, emitido_por
  ) VALUES (
    p_ferreteria_id, p_pedido_id,
    'nota_venta', p_serie, v_numero, v_completo,
    p_total, 0, p_total,
    p_cliente_nombre, p_emitido_por
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
