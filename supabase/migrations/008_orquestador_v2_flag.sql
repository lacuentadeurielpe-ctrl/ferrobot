-- F1: Feature flag para activar el orquestador v2 (tool-calling) por tenant.
-- Default false: cada ferretería sigue con el flujo clásico hasta que el
-- superadmin lo habilite explícitamente.

ALTER TABLE configuracion_bot
  ADD COLUMN IF NOT EXISTS usar_orquestador_v2 BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN configuracion_bot.usar_orquestador_v2 IS
  'Si true, el webhook usa el orquestador con tool-calling (F1) en lugar del flujo de intents clásico.';
