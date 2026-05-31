import { createClient } from '@/lib/supabase/server'
import { formatPEN, formatFechaHoraLima } from '@/lib/utils'
import { notFound } from 'next/navigation'
import { Printer } from 'lucide-react'

// Renderiza un ticket de 80mm
export default async function PrintTicketPage({ 
  params,
  searchParams
}: { 
  params: Promise<{ id: string }>
  searchParams: Promise<{ comprobanteId?: string }>
}) {
  const { id } = await params
  const { comprobanteId } = await searchParams
  const supabase = await createClient()

  // Obtener pedido con items y ferreteria
  const { data: pedido, error } = await supabase
    .from('pedidos')
    .select(`
      *,
      items_pedido ( *, productos (facturable) ),
      ferreterias ( nombre, telefono_whatsapp, direccion, ruc )
    `)
    .eq('id', id)
    .single()

  if (error || !pedido) {
    return notFound()
  }

  const ferreteria = pedido.ferreterias as any

  let itemsAImprimir = pedido.items_pedido || []
  let tituloComprobante = 'TICKET DE PEDIDO'
  let numeroComprobante = pedido.numero_pedido
  let esSunat = false
  let hashSunat = ''
  let montoTotal = pedido.total

  if (comprobanteId) {
    const { data: comp } = await supabase
      .from('comprobantes')
      .select('*')
      .eq('id', comprobanteId)
      .single()

    if (comp) {
      numeroComprobante = comp.numero_completo || numeroComprobante
      montoTotal = comp.total

      if (comp.tipo === 'nota_venta' || comp.tipo === 'nota_venta_interna') {
        tituloComprobante = comp.tipo === 'nota_venta_interna' ? 'NOTA DE VENTA' : 'NOTA DE VENTA - INTERNO'
        itemsAImprimir = comp.datos_json?.items || (comp.tipo === 'nota_venta_interna' ? itemsAImprimir : itemsAImprimir.filter((i: any) => i.productos?.facturable === false))
      } else {
        tituloComprobante = comp.tipo === 'factura' ? 'FACTURA ELECTRÓNICA' : 'BOLETA ELECTRÓNICA'
        esSunat = true
        // Nubefact guarda el hash y enlace en datos_json a veces, o en campos específicos si los hay
        // Asumimos que los items enviados a SUNAT son los formales
        itemsAImprimir = itemsAImprimir.filter((i: any) => i.productos?.facturable !== false)
      }
    }
  }

  return (
    <div className="font-mono bg-white min-h-screen text-black print:bg-white" style={{ maxWidth: '80mm', margin: '0 auto', padding: '10px' }}>
      
      {/* Botón flotante para imprimir, oculto en print */}
      <div className="print:hidden flex justify-center mb-4 pt-4">
        <button 
          id="btn-imprimir"
          className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg font-sans text-sm font-semibold hover:bg-zinc-800 transition shadow-lg"
        >
          <Printer className="w-4 h-4" /> Imprimir Ticket
        </button>
        <script dangerouslySetInnerHTML={{ __html: `
          document.getElementById('btn-imprimir').onclick = function() { window.print() }
        `}} />
      </div>

      <div id="ticket-content" className="text-xs leading-tight">
        {/* Encabezado */}
        <div className="text-center mb-4">
          <h1 className="text-lg font-bold uppercase mb-1">{ferreteria?.nombre || 'Ferretería'}</h1>
          {ferreteria?.ruc && <p>RUC: {ferreteria.ruc}</p>}
          {ferreteria?.direccion && <p className="truncate">{ferreteria.direccion}</p>}
          {ferreteria?.telefono_whatsapp && <p>WhatsApp: {ferreteria.telefono_whatsapp}</p>}
          
          <div className="border-t border-dashed border-black my-2"></div>
          
          <h2 className="text-sm font-bold mt-1">{tituloComprobante}</h2>
          <h3 className="text-lg font-bold">{numeroComprobante}</h3>
          <p className="mt-1">{formatFechaHoraLima(pedido.created_at)}</p>
        </div>

        <div className="border-t border-dashed border-black mb-2"></div>

        {/* Cliente */}
        <div className="mb-2">
          <p><strong>Cliente:</strong> {pedido.nombre_cliente}</p>
          <p><strong>Teléfono:</strong> {pedido.telefono_cliente}</p>
          <p><strong>Modalidad:</strong> {pedido.modalidad === 'delivery' ? 'DELIVERY' : 'RECOJO'}</p>
          {pedido.modalidad === 'delivery' && pedido.direccion_entrega && (
            <p><strong>Dir:</strong> {pedido.direccion_entrega}</p>
          )}
          {pedido.metodo_pago && (
            <p><strong>Pago:</strong> {pedido.metodo_pago.toUpperCase()}</p>
          )}
        </div>

        <div className="border-t border-dashed border-black mb-2"></div>

        {/* Items */}
        <table className="w-full text-left mb-2">
          <thead>
            <tr className="border-b border-dashed border-black">
              <th className="pb-1">CANT</th>
              <th className="pb-1">DESCRIPCION</th>
              <th className="text-right pb-1">IMP</th>
            </tr>
          </thead>
          <tbody>
            {itemsAImprimir.map((item: any) => (
              <tr key={item.id || item.nombre_producto}>
                <td className="align-top pt-1 w-8">{item.cantidad}</td>
                <td className="align-top pt-1 pr-1">{item.nombre_producto}</td>
                <td className="align-top pt-1 text-right">{formatPEN(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-dashed border-black mb-2"></div>

        {/* Totales */}
        <div className="text-right font-bold text-sm">
          TOTAL: {formatPEN(montoTotal)}
        </div>

        <div className="border-t border-dashed border-black my-4"></div>

        {/* QR Inyectado (Legal / Interno) */}
        <div className="flex flex-col items-center justify-center">
          <img 
            src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(ferreteria?.ruc + '|' + numeroComprobante + '|' + montoTotal)}`} 
            alt="QR Code" 
            className="w-24 h-24 mb-2"
          />
          {esSunat ? (
            <>
              <p className="text-center font-bold text-[10px]">Representación impresa de la</p>
              <p className="text-center font-bold text-[10px]">{tituloComprobante}</p>
              <p className="text-center text-[9px] mt-1">Autorizado mediante resolución de SUNAT</p>
            </>
          ) : (
            <>
              <p className="text-center font-bold">¡GRACIAS POR SU COMPRA!</p>
              <p className="text-center text-[10px] mt-1">Documento de control interno sin validez tributaria</p>
            </>
          )}
        </div>
        
        {/* Margen final para el corte de papel */}
        <div className="h-8"></div>
      </div>
    </div>
  )
}
