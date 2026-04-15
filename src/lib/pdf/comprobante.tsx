// Componente React PDF para comprobante de pago interno
// Usa @react-pdf/renderer — corre solo server-side

import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface ItemComprobante {
  nombre_producto: string
  unidad: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export interface DatosComprobante {
  // Ferretería
  nombre_ferreteria: string
  direccion_ferreteria: string | null
  telefono_ferreteria: string
  logo_url: string | null
  color: string          // hex — default '#1e40af'
  mensaje_pie: string | null

  // Comprobante
  numero_comprobante: string    // CP-000001
  fecha_emision: string         // ISO string

  // Pedido
  numero_pedido: string
  nombre_cliente: string
  modalidad: 'delivery' | 'recojo'
  direccion_entrega: string | null
  formas_pago: string[]

  // Items
  items: ItemComprobante[]
  total: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPEN(n: number): string {
  return `S/ ${n.toFixed(2)}`
}

function formatFechaHora(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

// ── Estilos ───────────────────────────────────────────────────────────────────

function crearEstilos(color: string) {
  return StyleSheet.create({
    page: {
      fontFamily: 'Helvetica',
      fontSize: 9,
      color: '#1f2937',
      backgroundColor: '#ffffff',
      paddingTop: 32,
      paddingBottom: 40,
      paddingHorizontal: 36,
    },

    // ── Cabecera ──
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 16,
      paddingBottom: 16,
      borderBottomWidth: 2,
      borderBottomColor: color,
    },
    logoBox: {
      width: 56,
      height: 56,
      backgroundColor: color,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
      flexShrink: 0,
    },
    logoImg: {
      width: 56,
      height: 56,
      borderRadius: 6,
      objectFit: 'cover',
    },
    logoIniciales: {
      color: '#ffffff',
      fontSize: 18,
      fontFamily: 'Helvetica-Bold',
    },
    headerInfo: {
      flex: 1,
    },
    nombreFerreteria: {
      fontSize: 16,
      fontFamily: 'Helvetica-Bold',
      color: color,
      marginBottom: 3,
    },
    headerMeta: {
      fontSize: 8,
      color: '#6b7280',
      marginBottom: 1,
    },

    // ── Banda COMPROBANTE DE PAGO ──
    bandaTitulo: {
      backgroundColor: color,
      paddingVertical: 8,
      paddingHorizontal: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
      borderRadius: 4,
    },
    bandaTituloTexto: {
      color: '#ffffff',
      fontSize: 12,
      fontFamily: 'Helvetica-Bold',
      letterSpacing: 1,
    },
    bandaNumero: {
      color: '#ffffff',
      fontSize: 10,
      fontFamily: 'Helvetica-Bold',
    },
    bandaFecha: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 8,
      textAlign: 'right',
      marginTop: 2,
    },

    // ── Sección ──
    seccion: {
      marginBottom: 12,
    },
    seccionTitulo: {
      fontSize: 7,
      fontFamily: 'Helvetica-Bold',
      color: color,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 5,
      borderBottomWidth: 1,
      borderBottomColor: '#e5e7eb',
      paddingBottom: 3,
    },
    filaInfo: {
      flexDirection: 'row',
      marginBottom: 2,
    },
    infoLabel: {
      width: 100,
      fontSize: 8,
      color: '#6b7280',
      fontFamily: 'Helvetica-Bold',
    },
    infoValor: {
      flex: 1,
      fontSize: 8,
      color: '#1f2937',
    },

    // ── Tabla de items ──
    tabla: {
      marginBottom: 10,
    },
    tablaHeader: {
      flexDirection: 'row',
      backgroundColor: color,
      paddingVertical: 5,
      paddingHorizontal: 6,
      borderRadius: 3,
      marginBottom: 1,
    },
    tablaFila: {
      flexDirection: 'row',
      paddingVertical: 5,
      paddingHorizontal: 6,
      borderBottomWidth: 1,
      borderBottomColor: '#f3f4f6',
    },
    tablaFilaAlterna: {
      backgroundColor: '#f9fafb',
    },
    thCant:    { width: 36,  color: '#ffffff', fontSize: 7, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
    thDesc:    { flex: 1,    color: '#ffffff', fontSize: 7, fontFamily: 'Helvetica-Bold' },
    thUnidad:  { width: 50,  color: '#ffffff', fontSize: 7, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
    thPrecio:  { width: 56,  color: '#ffffff', fontSize: 7, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
    thSubtot:  { width: 60,  color: '#ffffff', fontSize: 7, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
    tdCant:    { width: 36,  fontSize: 8, textAlign: 'center', color: '#374151' },
    tdDesc:    { flex: 1,    fontSize: 8, color: '#1f2937' },
    tdUnidad:  { width: 50,  fontSize: 8, textAlign: 'center', color: '#6b7280' },
    tdPrecio:  { width: 56,  fontSize: 8, textAlign: 'right', color: '#374151' },
    tdSubtot:  { width: 60,  fontSize: 8, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: '#1f2937' },

    // ── Totales ──
    totalesBox: {
      alignItems: 'flex-end',
      marginBottom: 14,
    },
    totalFilaBase: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginBottom: 2,
    },
    totalLabel: {
      fontSize: 8,
      color: '#6b7280',
      width: 100,
      textAlign: 'right',
      marginRight: 8,
    },
    totalValor: {
      fontSize: 8,
      color: '#374151',
      width: 70,
      textAlign: 'right',
    },
    totalFinalBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: color,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 4,
      marginTop: 4,
      minWidth: 220,
    },
    totalFinalLabel: {
      color: '#ffffff',
      fontSize: 11,
      fontFamily: 'Helvetica-Bold',
      marginRight: 24,
    },
    totalFinalValor: {
      color: '#ffffff',
      fontSize: 13,
      fontFamily: 'Helvetica-Bold',
    },

    // ── Pie ──
    pie: {
      marginTop: 'auto',
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: '#e5e7eb',
      alignItems: 'center',
    },
    pieGracias: {
      fontSize: 11,
      fontFamily: 'Helvetica-Bold',
      color: color,
      marginBottom: 4,
    },
    pieMensaje: {
      fontSize: 8,
      color: '#374151',
      textAlign: 'center',
      marginBottom: 8,
    },
    pieDisclaimer: {
      fontSize: 6.5,
      color: '#9ca3af',
      textAlign: 'center',
      maxWidth: 380,
    },
  })
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ComprobantePDF({ datos }: { datos: DatosComprobante }) {
  const S = crearEstilos(datos.color)

  const subtotalItems = datos.items.reduce((s, i) => s + i.subtotal, 0)
  const hayDescuento = Math.abs(subtotalItems - datos.total) > 0.005

  const formasPagoTexto = datos.formas_pago.length > 0
    ? datos.formas_pago.join(', ')
    : 'A convenir'

  return (
    <Document
      title={`Comprobante ${datos.numero_comprobante} — ${datos.nombre_ferreteria}`}
      author={datos.nombre_ferreteria}
    >
      <Page size="A4" style={S.page}>

        {/* ── CABECERA ── */}
        <View style={S.header}>
          <View style={S.logoBox}>
            {datos.logo_url ? (
              <Image src={datos.logo_url} style={S.logoImg} />
            ) : (
              <Text style={S.logoIniciales}>{iniciales(datos.nombre_ferreteria)}</Text>
            )}
          </View>
          <View style={S.headerInfo}>
            <Text style={S.nombreFerreteria}>{datos.nombre_ferreteria}</Text>
            {datos.direccion_ferreteria && (
              <Text style={S.headerMeta}>Dir.: {datos.direccion_ferreteria}</Text>
            )}
            <Text style={S.headerMeta}>WhatsApp: {datos.telefono_ferreteria}</Text>
          </View>
        </View>

        {/* ── BANDA: COMPROBANTE DE PAGO ── */}
        <View style={S.bandaTitulo}>
          <Text style={S.bandaTituloTexto}>COMPROBANTE DE PAGO</Text>
          <View>
            <Text style={S.bandaNumero}>N° {datos.numero_comprobante}</Text>
            <Text style={S.bandaFecha}>{formatFechaHora(datos.fecha_emision)}</Text>
          </View>
        </View>

        {/* ── DATOS DEL CLIENTE ── */}
        <View style={S.seccion}>
          <Text style={S.seccionTitulo}>Datos del cliente</Text>
          <View style={S.filaInfo}>
            <Text style={S.infoLabel}>Cliente:</Text>
            <Text style={S.infoValor}>{datos.nombre_cliente}</Text>
          </View>
          <View style={S.filaInfo}>
            <Text style={S.infoLabel}>Pedido N°:</Text>
            <Text style={S.infoValor}>{datos.numero_pedido}</Text>
          </View>
          <View style={S.filaInfo}>
            <Text style={S.infoLabel}>Modalidad:</Text>
            <Text style={S.infoValor}>
              {datos.modalidad === 'delivery' ? 'Delivery' : 'Recojo en tienda'}
            </Text>
          </View>
          {datos.modalidad === 'delivery' && datos.direccion_entrega && (
            <View style={S.filaInfo}>
              <Text style={S.infoLabel}>Dirección entrega:</Text>
              <Text style={S.infoValor}>{datos.direccion_entrega}</Text>
            </View>
          )}
        </View>

        {/* ── TABLA DE PRODUCTOS ── */}
        <View style={S.seccion}>
          <Text style={S.seccionTitulo}>Detalle del pedido</Text>
          <View style={S.tabla}>
            {/* Header */}
            <View style={S.tablaHeader}>
              <Text style={S.thCant}>Cant.</Text>
              <Text style={S.thDesc}>Descripción</Text>
              <Text style={S.thUnidad}>Unidad</Text>
              <Text style={S.thPrecio}>P. Unit.</Text>
              <Text style={S.thSubtot}>Subtotal</Text>
            </View>
            {/* Filas */}
            {datos.items.map((item, idx) => (
              <View
                key={idx}
                style={[S.tablaFila, idx % 2 === 1 ? S.tablaFilaAlterna : {}]}
              >
                <Text style={S.tdCant}>{item.cantidad}</Text>
                <Text style={S.tdDesc}>{item.nombre_producto}</Text>
                <Text style={S.tdUnidad}>{item.unidad}</Text>
                <Text style={S.tdPrecio}>{formatPEN(item.precio_unitario)}</Text>
                <Text style={S.tdSubtot}>{formatPEN(item.subtotal)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── TOTALES ── */}
        <View style={S.totalesBox}>
          {hayDescuento && (
            <>
              <View style={S.totalFilaBase}>
                <Text style={S.totalLabel}>Subtotal:</Text>
                <Text style={S.totalValor}>{formatPEN(subtotalItems)}</Text>
              </View>
              <View style={S.totalFilaBase}>
                <Text style={S.totalLabel}>Descuento:</Text>
                <Text style={{ ...S.totalValor, color: '#16a34a' }}>
                  − {formatPEN(subtotalItems - datos.total)}
                </Text>
              </View>
            </>
          )}
          <View style={S.totalFilaBase}>
            <Text style={S.totalLabel}>Forma de pago:</Text>
            <Text style={S.totalValor}>{formasPagoTexto}</Text>
          </View>
          <View style={S.totalFinalBox}>
            <Text style={S.totalFinalLabel}>TOTAL</Text>
            <Text style={S.totalFinalValor}>{formatPEN(datos.total)}</Text>
          </View>
        </View>

        {/* ── PIE ── */}
        <View style={S.pie}>
          <Text style={S.pieGracias}>¡Gracias por su compra!</Text>
          {datos.mensaje_pie && (
            <Text style={S.pieMensaje}>{datos.mensaje_pie}</Text>
          )}
          <Text style={S.pieDisclaimer}>
            Este documento es un comprobante interno de pago emitido por {datos.nombre_ferreteria}.
            No tiene validez tributaria ante la SUNAT ni reemplaza una boleta o factura electrónica.
          </Text>
        </View>

      </Page>
    </Document>
  )
}
