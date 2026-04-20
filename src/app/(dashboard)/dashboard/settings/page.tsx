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
import { Settings } from 'lucide-react'

export const dynamic = 'force-dynamic'

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
  const tabActivo = params.tab ?? 'general'

  const admin = createAdminClient()
  const [{ data: zonas }, { data: configBot }, estadoMP, { data: ycloudConfig }, { data: productosActivos }] = await Promise.all([
    supabase
      .from('zonas_delivery')
      .select('id, nombre, tiempo_estimado_min')
      .eq('ferreteria_id', ferreteria.id)
      .order('nombre'),
    supabase
      .from('configuracion_bot')
      .select('margen_minimo_porcentaje')
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

  // Nubefact: configurado, modo y ruta (la ruta no es secreta); el token NUNCA
  const nubefactConfig = {
    configurado: !!ferreteria.nubefact_token_enc && !!ferreteria.nubefact_ruta,
    modo:        ferreteria.nubefact_modo  ?? 'prueba',
    ruta:        ferreteria.nubefact_ruta  ?? null,
  }

  const TABS = [
    { id: 'general',        label: 'General' },
    { id: 'facturacion',    label: '🧾 Facturación' },
    { id: 'whatsapp',       label: 'WhatsApp' },
    { id: 'pagos',          label: 'Pagos' },
    { id: 'equipo',         label: 'Equipo' },
    { id: 'repartidores',   label: 'Repartidores' },
    { id: 'complementarios', label: '🔗 Complementarios' },
  ]

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center">
          <Settings className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Configuración</h1>
          <p className="text-xs text-gray-500">Ajusta los datos de tu ferretería y el comportamiento del bot</p>
        </div>
      </div>

      {/* Nav de pestañas */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <a
            key={tab.id}
            href={`/dashboard/settings?tab=${tab.id}`}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tabActivo === tab.id
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </a>
        ))}
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
            datos_transferencia: ferreteria.datos_transferencia ?? null,
            metodos_pago_activos: ferreteria.metodos_pago_activos ?? null,
          }}
          zonas={zonas ?? []}
          margenMinimo={configBot?.margen_minimo_porcentaje ?? 10}
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

      {/* ── Equipo ──────────────────────────────────────────────────── */}
      {tabActivo === 'equipo' && <EmpleadosSection />}

      {/* ── Repartidores ────────────────────────────────────────────── */}
      {tabActivo === 'repartidores' && (
        <RepartidoresSection modoInicial={ferreteria.modo_asignacion_delivery ?? 'manual'} />
      )}

      {/* ── Complementarios ─────────────────────────────────────────── */}
      {tabActivo === 'complementarios' && (
        <ComplementariosSection productos={productosActivos ?? []} />
      )}
    </div>
  )
}
