# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev        # start dev server (Next.js 16 with Turbopack)
npm run build      # production build — must pass before deploying
npm run lint       # ESLint
```

There are no automated tests. Validate changes by running `npm run build` locally — TypeScript errors and prerender failures surface here before Vercel does.

## Architecture Overview

**FerroBot** is a multi-tenant SaaS for Peruvian hardware stores (*ferreterías*). Each ferretería gets a WhatsApp bot that handles customer quoting, ordering, and delivery. The dashboard lets owners and staff manage everything.

### Multi-tenancy & Auth

Every DB query is scoped to `ferreteria_id`. The central auth utility is `src/lib/auth/roles.ts → getSessionInfo()`:

- Returns `{ userId, ferreteriaId, rol: 'dueno'|'vendedor', nombreFerreteria, onboardingCompleto }`
- Checks `ferreterias.owner_id` first (dueño), then `miembros_ferreteria` (vendedor)
- **Use this in every server component and API route** — never query `ferreterias.owner_id` directly

The middleware lives in `src/proxy.ts` (not `middleware.ts`). Public routes (webhook, delivery token pages, invite pages) must be added to `RUTAS_PUBLICAS` there.

### Supabase Client Tiers

| Import | When to use |
|--------|-------------|
| `@/lib/supabase/server` → `createClient()` | Server components, API routes with user session |
| `@/lib/supabase/admin` → `createAdminClient()` | Webhook handler, delivery token API, cron jobs — bypasses RLS |
| `@/lib/supabase/client` → `createClient()` | Client components only |

RLS policies use `mi_ferreteria_id()` (a `SECURITY DEFINER` function) to scope rows to the authenticated user's ferretería.

### WhatsApp Bot Flow

Inbound messages arrive at `POST /api/webhook/ycloud`:
1. HMAC signature verified against `YCLOUD_WEBHOOK_SECRET`
2. Media messages (audio/image/document) pre-processed: audio → Whisper transcription, images → GPT-4o Vision analysis. Both require `OPENAI_API_KEY`; gracefully degrade if absent.
3. The processed text is passed to `src/lib/bot/message-handler.ts → handleIncomingMessage()`
4. Message handler calls DeepSeek (`src/lib/ai/deepseek.ts`) which returns a structured JSON intent
5. Based on intent, the handler creates cotizaciones/pedidos in Supabase and sends replies via `src/lib/whatsapp/ycloud.ts → enviarMensaje()`

Key intents defined in `deepseek.ts`: `cotizacion`, `confirmar_pedido`, `orden_completa`, `rechazar_cotizacion`, `estado_pedido`, `pedir_humano`, etc.

When `pedir_humano` is detected or the dueño manually intervenes, `bot_pausado = true` is set on the conversación — the bot goes silent until the owner resumes it.

### Dashboard Pages

All under `src/app/(dashboard)/dashboard/`. The layout (`src/app/(dashboard)/layout.tsx`) calls `getSessionInfo()` and redirects accordingly. Role-gated UI: financial data and Configuración tab are hidden for `vendedor` role.

- `page.tsx` — KPI dashboard with period selector
- `orders/` — pedidos management, repartidor assignment
- `cotizaciones/` — quote management with PDF generation
- `conversations/` — WhatsApp thread viewer with manual reply
- `clientes/` — customer list + detail (pedidos/cotizaciones history)
- `catalog/` — product catalog with AI CSV/image extraction
- `settings/` — ferretería config, team members, repartidores

### Delivery System

Repartidores have no Supabase accounts. They're authenticated by URL token: `/delivery/[token]`. The corresponding API routes (`/api/delivery/[token]/*`) use `createAdminClient()` and bypass RLS. The `DeliveryView` client component handles entrega confirmation and incidencia reporting.

### Cron Jobs

`vercel.json` schedules `GET /api/cron/resumen-diario` at `0 1 * * *` (UTC) = 8pm Lima time. The route is protected by `Authorization: Bearer CRON_SECRET`. It sends a WhatsApp summary to `ferreterias.telefono_dueno` for stores with `resumen_diario_activo = true`.

### Key Conventions

- **`useSearchParams()` must always be inside a `<Suspense>` boundary** — Next.js 16 enforces this at build time and will fail the Vercel deploy otherwise.
- Phone numbers are stored without `+` (e.g. `51987654321`). `ycloud.ts → e164()` adds the `+` before sending.
- All times and business-hours logic use Lima timezone (`America/Lima`, UTC-5).
- `src/lib/utils.ts` exports shared formatters: `formatPEN`, `formatFecha`, `labelEstadoPedido`, `colorEstadoPedido`, `cn`.
- PDF comprobantes are generated with `@react-pdf/renderer` in `src/lib/pdf/generar-comprobante.ts` and stored in Supabase Storage.

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
YCLOUD_API_KEY
YCLOUD_WEBHOOK_SECRET
DEEPSEEK_API_KEY
OPENAI_API_KEY          # optional — enables Whisper + Vision
CRON_SECRET             # optional — protects /api/cron/* routes
NEXT_PUBLIC_APP_URL     # base URL used for invite links
```
