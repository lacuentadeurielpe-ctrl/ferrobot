-- F5: Pagos registrados desde capturas de WhatsApp
--
-- El bot detecta comprobantes de pago (Yape, Plin, transferencia) enviados
-- por el cliente. Extrae datos con Vision, valida contra config del dueño
-- y auto-confirma si todo cuadra. Si hay duda, escala al dueño.
--
-- FERRETERÍA AISLADA: ferreteria_id en cada tabla + RLS + índices.

-- ════════════════════════════════════════════════════════════════════
-- TABLA: pagos_registrados
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE pagos_registrados (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id    UUID NOT NULL REFERENCES ferreterias(id) ON DELETE CASCADE,
  cliente_id       UUID REFERENCES clientes(id),
  pedido_id        UUID REFERENCES pedidos(id),

  -- Datos del pago
  metodo           TEXT NOT NULL
                   CHECK (metodo IN ('yape', 'plin', 'transferencia', 'efectivo', 'otro')),
  monto            NUMERIC(10,2) NOT NULL,
  moneda           TEXT NOT NULL DEFAULT 'PEN',

  -- Datos extraídos de la captura (lo que Vision pudo leer)
  numero_operacion TEXT,                -- para dedup
  nombre_pagador   TEXT,
  ultimos_digitos  TEXT,                -- últimos dígitos del destinatario visible
  codigo_seguridad TEXT,                -- código de 3 dígitos de Yape
  fecha_pago       TIMESTAMPTZ,         -- fecha dentro del comprobante
  banco_origen     TEXT,                -- BCP, BBVA, Interbank, etc.

  -- Estado del pago
  estado           TEXT NOT NULL DEFAULT 'pendiente_revision'
                   CHECK (estado IN (
                     'confirmado_auto',    -- bot validó y auto-confirmó
                     'pendiente_revision', -- necesita revisión manual del dueño
                     'rechazado',          -- dueño rechazó o duplicado
                     'a_favor'             -- pago sin pedido asociado (crédito)
                   )),

  -- Metadata
  url_captura      TEXT,                -- URL de la imagen en storage (opcional)
  datos_extraidos  JSONB,               -- JSON completo devuelto por Vision
  confianza_extraccion NUMERIC(3,2),    -- 0.00 a 1.00
  notas            TEXT,                -- razón de derivación al dueño

  registrado_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Dedup: mismo N° operación no se registra dos veces por tenant
  -- (permite que el cliente reuse el mismo comprobante por error → rechaza silencioso)
  CONSTRAINT uq_pago_operacion UNIQUE (ferreteria_id, numero_operacion)
);

CREATE INDEX idx_pagos_ferreteria   ON pagos_registrados (ferreteria_id);
CREATE INDEX idx_pagos_cliente      ON pagos_registrados (cliente_id);
CREATE INDEX idx_pagos_pedido       ON pagos_registrados (pedido_id);
CREATE INDEX idx_pagos_estado       ON pagos_registrados (ferreteria_id, estado);
CREATE INDEX idx_pagos_registrado   ON pagos_registrados (ferreteria_id, registrado_at DESC);

ALTER TABLE pagos_registrados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_pagos" ON pagos_registrados
  USING (ferreteria_id = mi_ferreteria_id());

-- ════════════════════════════════════════════════════════════════════
-- Nuevas columnas en pedidos
-- ════════════════════════════════════════════════════════════════════
-- monto_pagado: permite llevar el control de pagos parciales
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS monto_pagado NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN pedidos.monto_pagado IS
  'Suma de pagos confirmados contra este pedido. monto_pagado >= total → pagado completo.';

-- ════════════════════════════════════════════════════════════════════
-- Nuevas columnas en ferreterias
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE ferreterias
  ADD COLUMN IF NOT EXISTS datos_plin JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tolerancia_dias_pago INTEGER NOT NULL DEFAULT 30
    CHECK (tolerancia_dias_pago BETWEEN 0 AND 365);

COMMENT ON COLUMN ferreterias.datos_plin IS
  'Configuración Plin: { numero: "987654321", nombre: "Juan Perez" }';
COMMENT ON COLUMN ferreterias.tolerancia_dias_pago IS
  'Días hacia atrás para buscar pedidos sin pagar al recibir un comprobante. 0 = solo hoy.';
