-- F4: Debounce de mensajes + ventana de gracia post-confirmación
--
-- Debounce: cuando un cliente envía varios mensajes seguidos, el bot espera
-- N segundos desde el último mensaje antes de responder. Todos los mensajes
-- del cliente acumulados se procesan como una sola conversación.
--
-- Ventana de gracia: si el cliente quiere agregar items a un pedido recién
-- confirmado (≤30 min, aún no despachado, aún no pagado con comprobante
-- tributario), se agregan al pedido existente y se regenera la nota de venta.

-- ════════════════════════════════════════════════════════════════════
-- TABLA: debounce_pendiente
-- Acumula mensajes entrantes de un cliente durante la ventana de debounce.
-- El cron /api/debounce/flush procesa los vencidos.
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE debounce_pendiente (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id    UUID NOT NULL REFERENCES ferreterias(id) ON DELETE CASCADE,
  telefono_cliente TEXT NOT NULL,
  -- Mensajes acumulados: [{texto, ycloud_message_id, recibido_at}, ...]
  mensajes         JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Cuándo vence la espera y se debe procesar
  vence_at         TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Un solo registro activo por (tenant, cliente)
  UNIQUE (ferreteria_id, telefono_cliente)
);

CREATE INDEX idx_debounce_vence ON debounce_pendiente (vence_at);
CREATE INDEX idx_debounce_ferreteria ON debounce_pendiente (ferreteria_id);

-- RLS: el admin client (webhook + cron) es el único que toca esta tabla
ALTER TABLE debounce_pendiente ENABLE ROW LEVEL SECURITY;
-- Sin policy pública → solo service_role puede acceder.

-- ════════════════════════════════════════════════════════════════════
-- Configuración por tenant
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE configuracion_bot
  ADD COLUMN IF NOT EXISTS debounce_segundos INTEGER NOT NULL DEFAULT 8
    CHECK (debounce_segundos BETWEEN 0 AND 30),
  ADD COLUMN IF NOT EXISTS ventana_gracia_minutos INTEGER NOT NULL DEFAULT 30
    CHECK (ventana_gracia_minutos BETWEEN 0 AND 120);

COMMENT ON COLUMN configuracion_bot.debounce_segundos IS
  'Segundos que el bot espera antes de responder tras un mensaje del cliente. ' ||
  'Si llega otro mensaje del mismo cliente, el timer se resetea. 0 = desactivado.';

COMMENT ON COLUMN configuracion_bot.ventana_gracia_minutos IS
  'Ventana en minutos tras confirmación en la que el cliente puede agregar items ' ||
  'al pedido sin crear uno nuevo. Se respetan criterios estrictos (estado, pago).';

-- ════════════════════════════════════════════════════════════════════
-- Flag de modificación post-confirmación
-- Sirve para mostrar badge en el dashboard y auditar ediciones tardías
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS modificado_post_confirmacion_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS modificaciones_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN pedidos.modificado_post_confirmacion_at IS
  'Timestamp de la última vez que el cliente agregó items después de confirmar.';
COMMENT ON COLUMN pedidos.modificaciones_count IS
  'Contador de modificaciones del cliente en la ventana de gracia.';
