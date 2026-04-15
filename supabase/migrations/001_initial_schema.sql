-- ══════════════════════════════════════════════════════════════════
-- MIGRACIÓN 001 — Schema inicial del sistema de cotización
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════════════════════════════
-- TABLA: ferreterias
-- Cada registro es un tenant (ferretería) con su dueño
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE ferreterias (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nombre                TEXT NOT NULL,
  direccion             TEXT,
  telefono_whatsapp     TEXT UNIQUE NOT NULL,
  horario_apertura      TIME,
  horario_cierre        TIME,
  -- Días de atención: ['lunes','martes','miercoles','jueves','viernes','sabado','domingo']
  dias_atencion         TEXT[] DEFAULT '{}',
  formas_pago           TEXT[] DEFAULT '{}',
  mensaje_bienvenida    TEXT DEFAULT '¡Hola! Bienvenido a nuestra ferretería. ¿En qué le puedo ayudar?',
  mensaje_fuera_horario TEXT DEFAULT 'Gracias por escribirnos. En este momento estamos fuera de horario de atención. Le responderemos en cuanto abramos.',
  onboarding_completo   BOOLEAN DEFAULT FALSE,
  activo                BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════
-- TABLA: zonas_delivery
-- Zonas de reparto configuradas por la ferretería
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE zonas_delivery (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id         UUID REFERENCES ferreterias(id) ON DELETE CASCADE NOT NULL,
  nombre                TEXT NOT NULL,
  tiempo_estimado_min   INTEGER NOT NULL DEFAULT 60,
  activo                BOOLEAN DEFAULT TRUE
);

-- ══════════════════════════════════════════════════════════════════
-- TABLA: categorias
-- Categorías de productos por ferretería
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE categorias (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id UUID REFERENCES ferreterias(id) ON DELETE CASCADE NOT NULL,
  nombre        TEXT NOT NULL,
  orden         INTEGER DEFAULT 0
);

-- ══════════════════════════════════════════════════════════════════
-- TABLA: productos
-- Catálogo de productos de cada ferretería
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE productos (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id               UUID REFERENCES ferreterias(id) ON DELETE CASCADE NOT NULL,
  categoria_id                UUID REFERENCES categorias(id) ON DELETE SET NULL,
  nombre                      TEXT NOT NULL,
  descripcion                 TEXT,
  precio_base                 NUMERIC(10,2) NOT NULL CHECK (precio_base >= 0),
  unidad                      TEXT NOT NULL DEFAULT 'unidad',
  stock                       INTEGER DEFAULT 0 CHECK (stock >= 0),
  -- Modo negociación: el bot avisa al cliente que hay precio especial para volúmenes altos
  modo_negociacion            BOOLEAN DEFAULT FALSE,
  -- A partir de esta cantidad se activa la negociación para este producto
  umbral_negociacion_cantidad INTEGER,
  activo                      BOOLEAN DEFAULT TRUE,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════
-- TABLA: reglas_descuento
-- Price tiers por producto. Ej: 10-49 unid → S/10.50 c/u
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE reglas_descuento (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id     UUID REFERENCES productos(id) ON DELETE CASCADE NOT NULL,
  cantidad_min    INTEGER NOT NULL CHECK (cantidad_min > 0),
  cantidad_max    INTEGER CHECK (cantidad_max IS NULL OR cantidad_max >= cantidad_min),
  precio_unitario NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
  -- 'automatico': el bot aplica el precio directo
  -- 'consultar_dueno': el bot avisa y espera aprobación del dueño
  modo            TEXT NOT NULL DEFAULT 'automatico' CHECK (modo IN ('automatico', 'consultar_dueno'))
);

-- ══════════════════════════════════════════════════════════════════
-- TABLA: configuracion_bot
-- Parámetros globales del bot por ferretería
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE configuracion_bot (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id               UUID REFERENCES ferreterias(id) ON DELETE CASCADE NOT NULL UNIQUE,
  -- Minutos de inactividad del cliente para cerrar sesión del bot
  timeout_sesion_minutos      INTEGER DEFAULT 60,
  -- Cuántos mensajes previos enviar a DeepSeek como contexto
  max_mensajes_contexto       INTEGER DEFAULT 10,
  -- Si el carrito supera este monto → negociación global
  umbral_monto_negociacion    NUMERIC(10,2),
  -- Modo global de negociación cuando se supera el umbral
  modo_negociacion_global     TEXT DEFAULT 'consultar_dueno' CHECK (modo_negociacion_global IN ('automatico', 'consultar_dueno')),
  -- Minutos de inactividad del dueño en un chat para que el bot retome control
  timeout_intervencion_dueno  INTEGER DEFAULT 15
);

-- ══════════════════════════════════════════════════════════════════
-- TABLA: clientes
-- Clientes identificados por su teléfono WhatsApp
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE clientes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id UUID REFERENCES ferreterias(id) ON DELETE CASCADE NOT NULL,
  telefono      TEXT NOT NULL,
  nombre        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ferreteria_id, telefono)
);

-- ══════════════════════════════════════════════════════════════════
-- TABLA: conversaciones
-- Cada sesión de chat entre un cliente y la ferretería
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE conversaciones (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id    UUID REFERENCES ferreterias(id) ON DELETE CASCADE NOT NULL,
  cliente_id       UUID REFERENCES clientes(id) ON DELETE CASCADE NOT NULL,
  -- 'activa' | 'intervenida_dueno' | 'cerrada'
  estado           TEXT DEFAULT 'activa' CHECK (estado IN ('activa', 'intervenida_dueno', 'cerrada')),
  -- TRUE cuando el dueño está escribiendo; el bot no responde
  bot_pausado      BOOLEAN DEFAULT FALSE,
  -- Timestamp de la última vez que el dueño escribió (para retomar bot)
  dueno_activo_at  TIMESTAMPTZ,
  ultima_actividad TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════
-- TABLA: mensajes
-- Historial de mensajes por conversación
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE mensajes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id   UUID REFERENCES conversaciones(id) ON DELETE CASCADE NOT NULL,
  -- 'cliente' | 'bot' | 'dueno'
  role              TEXT NOT NULL CHECK (role IN ('cliente', 'bot', 'dueno')),
  contenido         TEXT NOT NULL,
  -- 'texto' | 'imagen' | 'documento' | 'audio' | 'otro'
  tipo              TEXT DEFAULT 'texto',
  -- ID del mensaje en YCloud (para deduplicación)
  ycloud_message_id TEXT UNIQUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════
-- TABLA: cotizaciones
-- Cotizaciones generadas por el bot o el dueño
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE cotizaciones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id       UUID REFERENCES ferreterias(id) ON DELETE CASCADE NOT NULL,
  conversacion_id     UUID REFERENCES conversaciones(id) ON DELETE SET NULL,
  cliente_id          UUID REFERENCES clientes(id) ON DELETE SET NULL,
  -- 'borrador' | 'pendiente_aprobacion' | 'aprobada' | 'enviada' | 'confirmada' | 'rechazada'
  estado              TEXT DEFAULT 'borrador' CHECK (estado IN ('borrador','pendiente_aprobacion','aprobada','enviada','confirmada','rechazada')),
  total               NUMERIC(10,2) DEFAULT 0,
  -- TRUE si necesita que el dueño revise/apruebe antes de enviar al cliente
  requiere_aprobacion BOOLEAN DEFAULT FALSE,
  notas_dueno         TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  aprobada_at         TIMESTAMPTZ
);

-- ══════════════════════════════════════════════════════════════════
-- TABLA: items_cotizacion
-- Líneas de detalle de una cotización
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE items_cotizacion (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id    UUID REFERENCES cotizaciones(id) ON DELETE CASCADE NOT NULL,
  -- NULL si el producto fue pedido pero no existe en catálogo
  producto_id      UUID REFERENCES productos(id) ON DELETE SET NULL,
  -- Snapshot del nombre para que no cambie si el producto cambia
  nombre_producto  TEXT NOT NULL,
  unidad           TEXT NOT NULL DEFAULT 'unidad',
  cantidad         INTEGER NOT NULL CHECK (cantidad > 0),
  -- Precio aplicado (puede ser editado por el dueño)
  precio_unitario  NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
  -- Precio base al momento de la cotización (para referencia)
  precio_original  NUMERIC(10,2) NOT NULL,
  subtotal         NUMERIC(10,2) NOT NULL,
  -- TRUE si el producto no estaba disponible
  no_disponible    BOOLEAN DEFAULT FALSE,
  -- Mensaje de disponibilidad (ej: "Solo hay 5 en stock")
  nota_disponibilidad TEXT
);

-- ══════════════════════════════════════════════════════════════════
-- TABLA: pedidos
-- Pedidos confirmados por el cliente
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE pedidos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id     UUID REFERENCES ferreterias(id) ON DELETE CASCADE NOT NULL,
  cotizacion_id     UUID REFERENCES cotizaciones(id) ON DELETE SET NULL,
  cliente_id        UUID REFERENCES clientes(id) ON DELETE SET NULL,
  -- Número legible: generado como 'FER-0001', 'FER-0002', etc.
  numero_pedido     TEXT UNIQUE NOT NULL,
  nombre_cliente    TEXT NOT NULL,
  telefono_cliente  TEXT NOT NULL,
  direccion_entrega TEXT,
  zona_delivery_id  UUID REFERENCES zonas_delivery(id) ON DELETE SET NULL,
  -- 'delivery' | 'recojo'
  modalidad         TEXT NOT NULL CHECK (modalidad IN ('delivery', 'recojo')),
  -- 'pendiente' | 'confirmado' | 'en_preparacion' | 'enviado' | 'entregado' | 'cancelado'
  estado            TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','confirmado','en_preparacion','enviado','entregado','cancelado')),
  total             NUMERIC(10,2) NOT NULL,
  notas             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════
-- TABLA: items_pedido
-- Líneas de detalle de un pedido
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE items_pedido (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id       UUID REFERENCES pedidos(id) ON DELETE CASCADE NOT NULL,
  producto_id     UUID REFERENCES productos(id) ON DELETE SET NULL,
  nombre_producto TEXT NOT NULL,
  unidad          TEXT NOT NULL DEFAULT 'unidad',
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(10,2) NOT NULL,
  subtotal        NUMERIC(10,2) NOT NULL
);

-- ══════════════════════════════════════════════════════════════════
-- FUNCIÓN: Generar número de pedido legible por ferretería
-- Formato: prefijo de la ferretería + número secuencial con ceros
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION generar_numero_pedido(p_ferreteria_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_contador INTEGER;
  v_prefijo TEXT;
BEGIN
  -- Obtener nombre corto de la ferretería como prefijo (primeras 3 letras, mayúsculas)
  SELECT UPPER(LEFT(REGEXP_REPLACE(nombre, '[^a-zA-Z]', '', 'g'), 3))
  INTO v_prefijo
  FROM ferreterias
  WHERE id = p_ferreteria_id;

  -- Contar pedidos existentes de esta ferretería
  SELECT COUNT(*) + 1
  INTO v_contador
  FROM pedidos
  WHERE ferreteria_id = p_ferreteria_id;

  RETURN v_prefijo || '-' || LPAD(v_contador::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════════════════
-- FUNCIÓN: Trigger para actualizar updated_at automáticamente
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ferreterias_updated_at
  BEFORE UPDATE ON ferreterias
  FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

CREATE TRIGGER trigger_productos_updated_at
  BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

CREATE TRIGGER trigger_pedidos_updated_at
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

CREATE TRIGGER trigger_clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

-- ══════════════════════════════════════════════════════════════════
-- FUNCIÓN: Crear configuración de bot por defecto al crear ferretería
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION crear_config_bot_default()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO configuracion_bot (ferreteria_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_crear_config_bot
  AFTER INSERT ON ferreterias
  FOR EACH ROW EXECUTE FUNCTION crear_config_bot_default();

-- ══════════════════════════════════════════════════════════════════
-- ÍNDICES para performance en queries frecuentes
-- ══════════════════════════════════════════════════════════════════
CREATE INDEX idx_ferreterias_owner ON ferreterias(owner_id);
CREATE INDEX idx_ferreterias_whatsapp ON ferreterias(telefono_whatsapp);
CREATE INDEX idx_productos_ferreteria ON productos(ferreteria_id);
CREATE INDEX idx_productos_activo ON productos(ferreteria_id, activo);
CREATE INDEX idx_clientes_telefono ON clientes(ferreteria_id, telefono);
CREATE INDEX idx_conversaciones_ferreteria ON conversaciones(ferreteria_id);
CREATE INDEX idx_conversaciones_cliente ON conversaciones(cliente_id);
CREATE INDEX idx_mensajes_conversacion ON mensajes(conversacion_id, created_at);
CREATE INDEX idx_cotizaciones_ferreteria ON cotizaciones(ferreteria_id, created_at DESC);
CREATE INDEX idx_pedidos_ferreteria ON pedidos(ferreteria_id, created_at DESC);
CREATE INDEX idx_pedidos_estado ON pedidos(ferreteria_id, estado);

-- ══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Cada dueño solo puede ver y modificar datos de SU ferretería
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE ferreterias        ENABLE ROW LEVEL SECURITY;
ALTER TABLE zonas_delivery     ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias         ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reglas_descuento   ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_bot  ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversaciones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotizaciones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_cotizacion   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_pedido       ENABLE ROW LEVEL SECURITY;

-- Helper: obtener el id de la ferretería del usuario autenticado
CREATE OR REPLACE FUNCTION mi_ferreteria_id()
RETURNS UUID AS $$
  SELECT id FROM ferreterias WHERE owner_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- FERRETERIAS: el dueño solo ve la suya
CREATE POLICY "dueno_ve_su_ferreteria" ON ferreterias
  FOR ALL USING (owner_id = auth.uid());

-- Helper macro para tablas con ferreteria_id
-- Cada tabla hija hereda acceso si la ferretería es del usuario autenticado

CREATE POLICY "acceso_por_ferreteria" ON zonas_delivery
  FOR ALL USING (ferreteria_id = mi_ferreteria_id());

CREATE POLICY "acceso_por_ferreteria" ON categorias
  FOR ALL USING (ferreteria_id = mi_ferreteria_id());

CREATE POLICY "acceso_por_ferreteria" ON productos
  FOR ALL USING (ferreteria_id = mi_ferreteria_id());

CREATE POLICY "acceso_por_ferreteria" ON configuracion_bot
  FOR ALL USING (ferreteria_id = mi_ferreteria_id());

CREATE POLICY "acceso_por_ferreteria" ON clientes
  FOR ALL USING (ferreteria_id = mi_ferreteria_id());

CREATE POLICY "acceso_por_ferreteria" ON conversaciones
  FOR ALL USING (ferreteria_id = mi_ferreteria_id());

CREATE POLICY "acceso_por_ferreteria" ON cotizaciones
  FOR ALL USING (ferreteria_id = mi_ferreteria_id());

CREATE POLICY "acceso_por_ferreteria" ON pedidos
  FOR ALL USING (ferreteria_id = mi_ferreteria_id());

-- reglas_descuento: acceso a través del producto
CREATE POLICY "acceso_reglas_descuento" ON reglas_descuento
  FOR ALL USING (
    producto_id IN (
      SELECT id FROM productos WHERE ferreteria_id = mi_ferreteria_id()
    )
  );

-- mensajes: acceso a través de la conversación
CREATE POLICY "acceso_mensajes" ON mensajes
  FOR ALL USING (
    conversacion_id IN (
      SELECT id FROM conversaciones WHERE ferreteria_id = mi_ferreteria_id()
    )
  );

-- items_cotizacion: acceso a través de la cotización
CREATE POLICY "acceso_items_cotizacion" ON items_cotizacion
  FOR ALL USING (
    cotizacion_id IN (
      SELECT id FROM cotizaciones WHERE ferreteria_id = mi_ferreteria_id()
    )
  );

-- items_pedido: acceso a través del pedido
CREATE POLICY "acceso_items_pedido" ON items_pedido
  FOR ALL USING (
    pedido_id IN (
      SELECT id FROM pedidos WHERE ferreteria_id = mi_ferreteria_id()
    )
  );
