import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEstadoMP, mpConfigurado } from '@/lib/mercadopago'
import SettingsForm from '@/components/settings/SettingsForm'
import EmpleadosSection from '@/components/settings/EmpleadosSection'
import RepartidoresSection from '@/components/settings/RepartidoresSection'
import MercadoPagoConnect from '@/components/settings/MercadoPagoConnect'
import YCloudConnect from '@/components/settings/YCloudConnect'
import FacturacionTab from '@/components/settings/FacturacionTab'
import ComplementariosSection from '@/components/settings/ComplementariosSection'
import PerfilBotSection from '@/components/settings/PerfilBotSection'
import AuditoriaTab from '@/components/settings/AuditoriaTab'
import { Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// ── Grupos de ajustes ────────────────────────────────────────────────────────
const TAB_GROUPS = [
  {
    label: 'Negocio',
    tabs: [
      { id: 'general',     label: 'General'      },
      { id: 'facturacion', label: 'Facturación'  },
      { id: 'pagos',       label: 'Pagos'        },
    ],
  },
  {
    label: 'Bot',
    tabs: [
      { id: 'whatsapp',        label: 'WhatsApp'        },
      { id: 'perfil_bot',      label: 'Perfil'          },
      { id: 'complementarios', label: 'Complementarios' },
    ],
  },
  {
    label: 'Equipo',
    tabs: [
      { id: 'equipo',       label: 'Empleados'    },
      { id: 'repartidores', label: 'Repartidores' },
      { id: 'historial',    label: 'Historial'    },
    ],
  },
]

const ALL_TABS = TAB_GROUPS.flatMap((g) => g.tabs)

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ mp_ok?: string; mp_error?: string; tab?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!ferreteria) return null

  const params = await searchParams
  const tabActivo = ALL_TABS.some((t) => t.id === params.tab) ? (params.tab ?? 'general') : 'general'

  const admin = createAdminClient()
  const [{ data: zonas }, { data: configBot }, estadoMP, { data: ycloudConfig }, { data: productosActivos }] = await Promise.all([
    supabase
      .from('zonas_delivery')
      .select('id, nombre, tiempo_estimado_min')
      .eq('ferreteria_id', ferreteria.id)
      .order('nombre'),
    supabase
      .from('configuracion_bot')
      .select('margen_minimo_porcentaje, debounce_segundos, ventana_gracia_minutos, perfil_bot')
      .eq('ferreteria_id', ferreteria.id)
      .single(),
    getEstadoMP(ferreteria.id),
    admin
      .from('configuracion_ycloud')
      .select('numero_whatsapp, estado_conexion, ultimo_mensaje_at, ultimo_error')
      .eq('ferreteria_id', ferreteria.id)
      .single(),
    supabase
      .from('productos')
      .select('id, nombre, unidad')
      .eq('ferreteria_id', ferreteria.id)
      .eq('activo', true)
      .order('nombre'),
  ])

  const nubefactConfig = {
    configurado: !!ferreteria.nubefact_token_enc && !!ferreteria.nubefact_ruta,
    modo:        ferreteria.nubefact_modo  ?? 'prueba',
    ruta:        ferreteria.nubefact_ruta  ?? null,
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-zinc-100 border border-zinc-200 rounded-2xl flex items-center justify-center">
          <Settings className="w-4 h-4 text-zinc-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-950 tracking-tight">Ajustes</h1>
          <p className="text-xs text-zinc-400">Configura tu negocio, el bot y tu equipo</p>
        </div>
      </div>

      {/* Nav de pestañas agrupadas */}
      <div className="mb-6 border-b border-zinc-200">
        <div className="flex gap-6 overflow-x-auto pb-0">
          {TAB_GROUPS.map((group, gi) => (
            <div key={group.label} className="flex items-start gap-0">
              {/* Separador entre grupos */}
              {gi > 0 && (
                <div className="w-px bg-zinc-200 self-stretch mx-3 mt-1 mb-0" />
              )}
              <div>
                {/* Etiqueta del grupo */}
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-1 mb-1 select-none">
                  {group.label}
                </p>
                {/* Tabs del grupo */}
                <div className="flex gap-0.5">
                  {group.tabs.map((tab) => (
                    <a
                      key={tab.id}
                      href={`/dashboard/settings?tab=${tab.id}`}
                      className={cn(
                        'px-3 py-1.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                        tabActivo === tab.id
                          ? 'border-zinc-950 text-zinc-950'
                          : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
                      )}
                    >
                      {tab.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── General ─────────────────────────────────────────────────── */}
      {tabActivo === 'general' && (
        <SettingsForm
          ferreteria={{
            nombre: ferreteria.nombre,
            direccion: ferreteria.direccion,
            telefono_whatsapp: ferreteria.telefono_whatsapp,
            horario_apertura: ferreteria.horario_apertura,
            horario_cierre: ferreteria.horario_cierre,
            dias_atencion: ferreteria.dias_atencion ?? [],
            formas_pago: ferreteria.formas_pago ?? [],
            mensaje_bienvenida: ferreteria.mensaje_bienvenida,
            mensaje_fuera_horario: ferreteria.mensaje_fuera_horario,
            timeout_intervencion_dueno: ferreteria.timeout_intervencion_dueno ?? 30,
            logo_url: ferreteria.logo_url ?? null,
            color_comprobante: ferreteria.color_comprobante ?? '#1e40af',
            mensaje_comprobante: ferreteria.mensaje_comprobante ?? null,
            telefono_dueno: ferreteria.telefono_dueno ?? null,
            resumen_diario_activo: ferreteria.resumen_diario_activo ?? false,
            datos_yape: ferreteria.datos_yape ?? null,
            datos_plin: ferreteria.datos_plin ?? null,
            datos_transferencia: ferreteria.datos_transferencia ?? null,
            metodos_pago_activos: ferreteria.metodos_pago_activos ?? null,
            tolerancia_dias_pago: ferreteria.tolerancia_dias_pago ?? 30,
          }}
          zonas={zonas ?? []}
          margenMinimo={configBot?.margen_minimo_porcentaje ?? 10}
          debounceSegundos={(configBot as { debounce_segundos?: number } | null)?.debounce_segundos ?? 8}
          ventanaGraciaMinutos={(configBot as { ventana_gracia_minutos?: number } | null)?.ventana_gracia_minutos ?? 30}
          toleranciaDiasPago={(ferreteria as unknown as { tolerancia_dias_pago?: number }).tolerancia_dias_pago ?? 30}
        />
      )}

      {/* ── Facturación ─────────────────────────────────────────────── */}
      {tabActivo === 'facturacion' && (
        <FacturacionTab
          inicial={{
            tipo_ruc:                   ferreteria.tipo_ruc ?? 'sin_ruc',
            ruc:                        ferreteria.ruc ?? null,
            razon_social:               ferreteria.razon_social ?? null,
            nombre_comercial:           ferreteria.nombre_comercial ?? null,
            regimen_tributario:         ferreteria.regimen_tributario ?? null,
            serie_boletas:              ferreteria.serie_boletas ?? 'B001',
            serie_facturas:             ferreteria.serie_facturas ?? 'F001',
            igv_incluido_en_precios:    ferreteria.igv_incluido_en_precios ?? false,
            representante_legal_nombre: ferreteria.representante_legal_nombre ?? null,
            representante_legal_dni:    ferreteria.representante_legal_dni ?? null,
            representante_legal_cargo:  ferreteria.representante_legal_cargo ?? null,
          }}
          nubefactConfig={nubefactConfig}
        />
      )}

      {/* ── WhatsApp ────────────────────────────────────────────────── */}
      {tabActivo === 'whatsapp' && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Conexión WhatsApp</h2>
          <YCloudConnect
            configurado={!!ycloudConfig}
            numeroWhatsapp={ycloudConfig?.numero_whatsapp ?? null}
            estadoConexion={ycloudConfig?.estado_conexion ?? null}
            ultimoMensajeAt={ycloudConfig?.ultimo_mensaje_at ?? null}
            ultimoError={ycloudConfig?.ultimo_error ?? null}
          />
        </div>
      )}

      {/* ── Pagos ───────────────────────────────────────────────────── */}
      {tabActivo === 'pagos' && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Pagos online</h2>
          <MercadoPagoConnect
            estado={estadoMP.estado}
            mpEmail={estadoMP.mp_email}
            mpUserId={estadoMP.mp_user_id}
            conectadoAt={estadoMP.conectado_at}
            mpConfigurado={mpConfigurado()}
            mpOk={params.mp_ok === '1'}
            mpError={params.mp_error ?? null}
          />
        </div>
      )}

      {/* ── Empleados ───────────────────────────────────────────────── */}
      {tabActivo === 'equipo' && <EmpleadosSection />}

      {/* ── Repartidores ────────────────────────────────────────────── */}
      {tabActivo === 'repartidores' && (
        <RepartidoresSection modoInicial={ferreteria.modo_asignacion_delivery ?? 'manual'} />
      )}

      {/* ── Perfil del bot ──────────────────────────────────────────── */}
      {tabActivo === 'perfil_bot' && (
        <PerfilBotSection
          inicial={(configBot as unknown as { perfil_bot?: Record<string, string> } | null)?.perfil_bot ?? {}}
        />
      )}

      {/* ── Complementarios ─────────────────────────────────────────── */}
      {tabActivo === 'complementarios' && (
        <ComplementariosSection productos={productosActivos ?? []} />
      )}

      {/* ── Historial de auditoría ──────────────────────────────────── */}
      {tabActivo === 'historial' && <AuditoriaTab />}
    </div>
  )
}
