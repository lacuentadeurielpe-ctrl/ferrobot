import { createClient } from '@/lib/supabase/server'
import SettingsForm from '@/components/settings/SettingsForm'
import EmpleadosSection from '@/components/settings/EmpleadosSection'
import RepartidoresSection from '@/components/settings/RepartidoresSection'
import { Settings } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!ferreteria) return null

  const [{ data: zonas }, { data: configBot }] = await Promise.all([
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
  ])

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

      <div className="mt-6">
        <EmpleadosSection />
      </div>

      <div className="mt-6">
        <RepartidoresSection modoInicial={ferreteria.modo_asignacion_delivery ?? 'manual'} />
      </div>
    </div>
  )
}
