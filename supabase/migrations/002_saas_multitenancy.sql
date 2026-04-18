-- ═══════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 002 — Arquitectura SaaS Multi-Tenant
-- Superadmin, planes, créditos IA, YCloud por tenant, Mercado Pago OAuth
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. SUPERADMINS ──────────────────────────────────────────────────────────
-- Operadores de la plataforma. Completamente separados de los dueños de ferreterías.
CREATE TABLE IF NOT EXISTS superadmins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  nombre        TEXT NOT NULL,
  email         TEXT NOT NULL,
  nivel         TEXT NOT NULL DEFAULT 'soporte' CHECK (nivel IN ('admin', 'soporte')),
  -- 'admin' → acceso total | 'soporte' → solo lectura
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. PLANES ────────────────────────────────────────────────────────────────
-- Catálogo de planes de la plataforma. Filas insertadas manualmente.
CREATE TABLE IF NOT EXISTS planes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           TEXT NOT NULL,                    -- 'Básico', 'Estándar', 'Pro'
  creditos_mes     INT NOT NULL CHECK (creditos_mes > 0),
  precio_mensual   NUMERIC(10,2) NOT NULL DEFAULT 0,
  precio_exceso    NUMERIC(10,4) NOT NULL DEFAULT 0, -- S/ por crédito adicional
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insertar planes base
INSERT INTO planes (nombre, creditos_mes, precio_mensual, precio_exceso) VALUES
  ('Básico',    500,   99.00,  0.10),
  ('Estándar', 2000,  199.00,  0.08),
  ('Pro',      5000,  349.00,  0.06)
ON CONFLICT DO NOTHING;

-- ── 3. SUSCRIPCIONES ────────────────────────────────────────────────────────
-- Una por ferretería. Lleva el balance de créditos y estado del plan.
CREATE TABLE IF NOT EXISTS suscripciones (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id        UUID REFERENCES ferreterias(id) ON DELETE CASCADE UNIQUE NOT NULL,
  plan_id              UUID REFERENCES planes(id) NOT NULL,
  creditos_disponibles INT NOT NULL DEFAULT 0 CHECK (creditos_disponibles >= 0),
  creditos_del_mes     INT NOT NULL DEFAULT 0,  -- asignados en el ciclo actual
  creditos_extra       INT NOT NULL DEFAULT 0,  -- comprados adicionales
  ciclo_inicio         DATE,
  ciclo_fin            DATE,
  proximo_cobro        DATE,
  estado               TEXT NOT NULL DEFAULT 'trial'
                         CHECK (estado IN ('trial', 'activo', 'vencido', 'suspendido')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. MOVIMIENTOS DE CRÉDITOS ──────────────────────────────────────────────
-- Cada llamada a la IA descuenta aquí. Audit trail completo para el superadmin.
CREATE TABLE IF NOT EXISTS movimientos_creditos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id    UUID REFERENCES ferreterias(id) ON DELETE CASCADE NOT NULL,
  tipo_tarea       TEXT NOT NULL,
  -- 'respuesta_simple' | 'cotizacion' | 'pedido' | 'situacion_compleja'
  -- 'audio_whisper' | 'imagen_vision' | 'analisis_inventario' | 'reporte' | 'crm'
  modelo_usado     TEXT NOT NULL,
  -- 'deepseek-chat' | 'gpt-4o-mini' | 'claude-3-5-sonnet' | 'whisper-1'
  creditos_usados  INT NOT NULL CHECK (creditos_usados > 0),
  tokens_entrada   INT,          -- tokens reales consumidos
  tokens_salida    INT,
  costo_usd        NUMERIC(10,6), -- costo real en USD (para el superadmin)
  conversacion_id  UUID REFERENCES conversaciones(id) ON DELETE SET NULL,
  origen           TEXT NOT NULL DEFAULT 'bot'
                     CHECK (origen IN ('bot', 'inventario', 'reporte', 'crm', 'pago')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_movimientos_creditos_ferreteria
  ON movimientos_creditos(ferreteria_id, created_at DESC);

-- ── 5. RECARGAS DE CRÉDITOS ──────────────────────────────────────────────────
-- Historial de créditos agregados (renovación mensual, manual, compensación).
CREATE TABLE IF NOT EXISTS recargas_creditos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id    UUID REFERENCES ferreterias(id) ON DELETE CASCADE NOT NULL,
  creditos         INT NOT NULL CHECK (creditos > 0),
  motivo           TEXT NOT NULL DEFAULT 'plan_mensual',
  -- 'plan_mensual' | 'recarga_manual' | 'compensacion' | 'trial'
  monto_cobrado    NUMERIC(10,2) NOT NULL DEFAULT 0,
  agregado_por     UUID REFERENCES superadmins(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 6. CONFIGURACIÓN YCLOUD POR TENANT ──────────────────────────────────────
-- API Key y webhook secret de YCloud encriptados por ferretería.
CREATE TABLE IF NOT EXISTS configuracion_ycloud (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id     UUID REFERENCES ferreterias(id) ON DELETE CASCADE UNIQUE NOT NULL,
  api_key_enc       TEXT NOT NULL,        -- AES-256-GCM encriptado
  webhook_secret_enc TEXT,               -- AES-256-GCM encriptado (puede ser NULL)
  numero_whatsapp   TEXT NOT NULL,        -- número del negocio (sin +)
  estado_conexion   TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado_conexion IN ('activo', 'error', 'desconectado', 'pendiente')),
  ultimo_mensaje_at TIMESTAMPTZ,          -- último mensaje recibido correctamente
  ultimo_error      TEXT,
  ultimo_error_at   TIMESTAMPTZ,
  configurado_por   UUID REFERENCES superadmins(id) ON DELETE SET NULL,
  configurado_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 7. CONFIGURACIÓN MERCADO PAGO POR TENANT ─────────────────────────────────
-- Tokens OAuth de Mercado Pago encriptados. El ferretero conecta su cuenta.
CREATE TABLE IF NOT EXISTS configuracion_mercadopago (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id     UUID REFERENCES ferreterias(id) ON DELETE CASCADE UNIQUE NOT NULL,
  access_token_enc  TEXT,                 -- AES-256-GCM encriptado
  refresh_token_enc TEXT,                 -- AES-256-GCM encriptado
  mp_user_id        TEXT,                 -- ID de cuenta en Mercado Pago
  mp_email          TEXT,                 -- email del ferretero en MP
  expira_at         TIMESTAMPTZ,          -- cuando vence el access token
  estado            TEXT NOT NULL DEFAULT 'desconectado'
                      CHECK (estado IN ('conectado', 'expirado', 'error', 'desconectado')),
  conectado_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 8. INCIDENCIAS DEL SISTEMA ───────────────────────────────────────────────
-- Log de errores y eventos por tenant. Visible en el panel de superadmin.
CREATE TABLE IF NOT EXISTS incidencias_sistema (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id    UUID REFERENCES ferreterias(id) ON DELETE CASCADE,
  tipo             TEXT NOT NULL,
  -- 'ycloud_error' | 'ia_error' | 'mp_error' | 'webhook_caido'
  -- 'creditos_agotados' | 'creditos_bajos' | 'token_expirado'
  detalle          TEXT,
  resuelto         BOOLEAN NOT NULL DEFAULT FALSE,
  resuelto_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incidencias_ferreteria
  ON incidencias_sistema(ferreteria_id, created_at DESC);
CREATE INDEX idx_incidencias_no_resueltas
  ON incidencias_sistema(resuelto, created_at DESC) WHERE resuelto = FALSE;

-- ── 9. MODIFICAR FERRETERIAS ─────────────────────────────────────────────────
-- Agregar columnas de estado tenant y plan.
ALTER TABLE ferreterias
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES planes(id),
  ADD COLUMN IF NOT EXISTS estado_tenant TEXT NOT NULL DEFAULT 'trial'
    CHECK (estado_tenant IN ('trial', 'activo', 'suspendido', 'cancelado')),
  ADD COLUMN IF NOT EXISTS trial_hasta TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspendido_motivo TEXT,
  ADD COLUMN IF NOT EXISTS suspendido_at TIMESTAMPTZ;

-- ── 10. RLS POLICIES ────────────────────────────────────────────────────────

-- superadmins: solo el propio superadmin puede leer su fila
ALTER TABLE superadmins ENABLE ROW LEVEL SECURITY;
CREATE POLICY superadmins_self ON superadmins
  FOR SELECT USING (user_id = auth.uid());

-- suscripciones: dueño de la ferretería puede leer la suya
ALTER TABLE suscripciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY suscripciones_owner ON suscripciones
  FOR SELECT USING (
    ferreteria_id IN (
      SELECT id FROM ferreterias WHERE owner_id = auth.uid()
    )
  );

-- movimientos_creditos: dueño puede ver su consumo
ALTER TABLE movimientos_creditos ENABLE ROW LEVEL SECURITY;
CREATE POLICY movimientos_creditos_owner ON movimientos_creditos
  FOR SELECT USING (
    ferreteria_id IN (
      SELECT id FROM ferreterias WHERE owner_id = auth.uid()
    )
  );

-- configuracion_ycloud: dueño puede ver (no editar — solo superadmin edita)
ALTER TABLE configuracion_ycloud ENABLE ROW LEVEL SECURITY;
CREATE POLICY ycloud_config_owner ON configuracion_ycloud
  FOR SELECT USING (
    ferreteria_id IN (
      SELECT id FROM ferreterias WHERE owner_id = auth.uid()
    )
  );

-- configuracion_mercadopago: dueño puede leer y actualizar la suya
ALTER TABLE configuracion_mercadopago ENABLE ROW LEVEL SECURITY;
CREATE POLICY mp_config_owner ON configuracion_mercadopago
  FOR ALL USING (
    ferreteria_id IN (
      SELECT id FROM ferreterias WHERE owner_id = auth.uid()
    )
  );

-- incidencias_sistema: dueño puede ver las de su ferretería
ALTER TABLE incidencias_sistema ENABLE ROW LEVEL SECURITY;
CREATE POLICY incidencias_owner ON incidencias_sistema
  FOR SELECT USING (
    ferreteria_id IN (
      SELECT id FROM ferreterias WHERE owner_id = auth.uid()
    )
  );

-- ── 11. FUNCIONES ÚTILES ─────────────────────────────────────────────────────

-- Función para verificar si un tenant tiene créditos suficientes
CREATE OR REPLACE FUNCTION tiene_creditos(p_ferreteria_id UUID, p_creditos_necesarios INT)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT creditos_disponibles >= p_creditos_necesarios
     FROM suscripciones
     WHERE ferreteria_id = p_ferreteria_id),
    FALSE
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Función para descontar créditos de forma atómica
CREATE OR REPLACE FUNCTION descontar_creditos(p_ferreteria_id UUID, p_creditos INT)
RETURNS BOOLEAN AS $$
DECLARE
  v_actualizados INT;
BEGIN
  UPDATE suscripciones
  SET
    creditos_disponibles = creditos_disponibles - p_creditos,
    updated_at = now()
  WHERE
    ferreteria_id = p_ferreteria_id
    AND creditos_disponibles >= p_creditos;

  GET DIAGNOSTICS v_actualizados = ROW_COUNT;
  RETURN v_actualizados > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para agregar créditos
CREATE OR REPLACE FUNCTION agregar_creditos(p_ferreteria_id UUID, p_creditos INT)
RETURNS VOID AS $$
BEGIN
  UPDATE suscripciones
  SET
    creditos_disponibles = creditos_disponibles + p_creditos,
    updated_at = now()
  WHERE ferreteria_id = p_ferreteria_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
