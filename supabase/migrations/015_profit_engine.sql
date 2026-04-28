-- Fase 5: Modo respuesta + Profit Engine
-- cierre_cotizacion_activo: agrega frase de cierre natural post-cotización
-- umbral_upsell_soles:      mínimo de S/ en cotización para activar sugerencias de upsell
ALTER TABLE configuracion_bot
  ADD COLUMN IF NOT EXISTS cierre_cotizacion_activo BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS umbral_upsell_soles      INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN configuracion_bot.cierre_cotizacion_activo IS
  'Si true, el bot agrega una frase de cierre natural después de cada cotización (ej: "¿Lo armamos?").';
COMMENT ON COLUMN configuracion_bot.umbral_upsell_soles IS
  'Monto mínimo en S/ de la cotización para que se activen sugerencias de upsell. 0 = siempre.';
