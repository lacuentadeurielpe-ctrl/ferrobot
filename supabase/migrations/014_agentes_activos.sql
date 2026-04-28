-- Fase 4: Agentes configurables por tenant
-- Permite activar/desactivar grupos de tools del orquestador v2 desde la UI.
-- Semántica opt-out: ausencia de campo = activo (backward compatible).
ALTER TABLE configuracion_bot
  ADD COLUMN IF NOT EXISTS agentes_activos JSONB NOT NULL
    DEFAULT '{"ventas":true,"comprobantes":true,"upsell":true,"crm":true}'::jsonb;

COMMENT ON COLUMN configuracion_bot.agentes_activos IS
  'Agentes del bot habilitados: ventas, comprobantes, upsell, crm. Semántica opt-out (null = true).';
