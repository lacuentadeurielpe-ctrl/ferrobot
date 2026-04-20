-- F2: Memoria del cliente (perfil) + compaction de historial largo
--
-- Perfil JSONB: solo datos que el cliente dice explícitamente o que se
-- infieren de su historial real de pedidos. Nunca se inventan.
--
-- Resumen contexto: cuando una conversación supera N mensajes, se guarda
-- aquí un resumen de los mensajes viejos para ahorrar tokens sin perder
-- memoria larga.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS perfil JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN clientes.perfil IS
  'Perfil del cliente construido desde su historial real y datos explícitos. ' ||
  'Claves esperadas: compras_frecuentes (array), modalidad_preferida (string), ' ||
  'zona_habitual (string), tipo_cliente (string), obra_actual (string). ' ||
  'FERRETERÍA AISLADA: hereda del cliente, nunca se cruza entre tenants.';

ALTER TABLE conversaciones
  ADD COLUMN IF NOT EXISTS resumen_contexto TEXT NULL,
  ADD COLUMN IF NOT EXISTS resumen_actualizado_hasta TIMESTAMPTZ NULL;

COMMENT ON COLUMN conversaciones.resumen_contexto IS
  'Resumen de los mensajes viejos de la conversación (compaction). ' ||
  'Se regenera cuando el historial supera un umbral.';
