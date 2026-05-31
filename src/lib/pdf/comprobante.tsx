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
  ruc_ferreteria?: string // Opcional, para simular la caja de RUC

  // Comprobante
  numero_comprobante: string    // CP-000001
  fecha_emision: string         // ISO string
  esProforma?: boolean          // true = documento pendiente de confirmación

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

function formatFecha(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

// ── Estilos (Estilo SUNAT / Nubefact A4) ──────────────────────────────────────

function crearEstilos(color: string) {
  return StyleSheet.create({
    page: {
      fontFamily: 'Helvetica',
      fontSize: 8,
      color: '#000000',
      backgroundColor: '#ffffff',
      paddingTop: 40,
      paddingBottom: 40,
      paddingHorizontal: 40,
    },

    // ── Cabecera: 2 Columnas ──
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 20,
    },
    headerLeft: {
      flex: 1,
      paddingRight: 20,
      flexDirection: 'row',
    },
    logoBox: {
      width: 70,
      height: 70,
      backgroundColor: '#f3f4f6',
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 15,
      flexShrink: 0,
    },
    logoImg: {
      width: 70,
      height: 70,
      borderRadius: 4,
      objectFit: 'contain',
    },
    logoIniciales: {
      color: '#9ca3af',
      fontSize: 20,
      fontFamily: 'Helvetica-Bold',
    },
    empresaInfo: {
      flex: 1,
      justifyContent: 'center',
    },
    empresaNombre: {
      fontSize: 14,
      fontFamily: 'Helvetica-Bold',
      marginBottom: 4,
      color: '#000000',
      textTransform: 'uppercase',
    },
    empresaTexto: {
      fontSize: 8,
      color: '#333333',
      marginBottom: 2,
    },

    // ── Caja RUC Derecha (Estilo SUNAT) ──
    cajaRuc: {
      width: 180,
      borderWidth: 1.5,
      borderColor: color, // Usa el color principal de la ferretería
      borderRadius: 8,
      alignItems: 'center',
      paddingVertical: 12,
    },
    cajaRucTexto: {
      fontSize: 12,
      fontFamily: 'Helvetica-Bold',
      marginBottom: 4,
    },
    cajaRucTitulo: {
      fontSize: 11,
      fontFamily: 'Helvetica-Bold',
      color: '#ffffff',
      backgroundColor: color,
      width: '100%',
      textAlign: 'center',
      paddingVertical: 6,
      marginBottom: 4,
    },
    cajaRucNumero: {
      fontSize: 12,
      fontFamily: 'Helvetica-Bold',
    },

    // ── Datos del Cliente (Recuadro) ──
    clienteBox: {
      borderWidth: 1,
      borderColor: '#000000',
      borderRadius: 4,
      padding: 8,
      marginBottom: 15,
    },
    clienteRow: {
      flexDirection: 'row',
      marginBottom: 4,
    },
    clienteLabel: {
      width: 70,
      fontFamily: 'Helvetica-Bold',
      fontSize: 8,
    },
    clienteValor: {
      flex: 1,
      fontSize: 8,
    },
    clienteLabelCorto: {
      width: 80,
      fontFamily: 'Helvetica-Bold',
      fontSize: 8,
    },

    // ── Tabla de Ítems ──
    tabla: {
      width: '100%',
      borderWidth: 1,
      borderColor: '#000000',
      borderBottomWidth: 0,
      borderRightWidth: 0,
    },
    tablaRow: {
      flexDirection: 'row',
    },
    tablaHeader: {
      backgroundColor: '#f0f0f0',
      fontFamily: 'Helvetica-Bold',
      textAlign: 'center',
      fontSize: 8,
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderColor: '#000000',
    },
    tablaCell: {
      fontSize: 8,
      paddingVertical: 4,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderRightWidth: 1,
      borderColor: '#000000',
    },
    // Anchos de columnas
    colCant: { width: '10%', textAlign: 'center' },
    colUnid: { width: '10%', textAlign: 'center' },
    colDesc: { width: '50%' },
    colPUnit: { width: '15%', textAlign: 'right' },
    colTotal: { width: '15%', textAlign: 'right' },

    // ── Resumen / Totales ──
    resumenRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 15,
    },
    resumenIzquierda: {
      flex: 1,
      paddingRight: 20,
    },
    resumenDerecha: {
      width: 180,
    },
    totalFila: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: '#e5e7eb',
      paddingVertical: 4,
    },
    totalLabel: {
      flex: 1,
      fontFamily: 'Helvetica-Bold',
      fontSize: 8,
      textAlign: 'right',
      paddingRight: 10,
    },
    totalValor: {
      width: 70,
      fontSize: 8,
      textAlign: 'right',
    },
    totalFinalFila: {
      flexDirection: 'row',
      paddingVertical: 5,
      marginTop: 2,
    },
    totalFinalLabel: {
      flex: 1,
      fontFamily: 'Helvetica-Bold',
      fontSize: 10,
      textAlign: 'right',
      paddingRight: 10,
    },
    totalFinalValor: {
      width: 70,
      fontFamily: 'Helvetica-Bold',
      fontSize: 10,
      textAlign: 'right',
    },

    // ── Pie ──
    pie: {
      marginTop: 'auto',
      borderTopWidth: 1,
      borderTopColor: '#000000',
      paddingTop: 10,
      alignItems: 'center',
    },
    pieMensaje: {
      fontSize: 9,
      fontFamily: 'Helvetica-Bold',
      marginBottom: 4,
    },
    pieDisclaimer: {
      fontSize: 7,
      color: '#666666',
      textAlign: 'center',
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
    : 'Efectivo / A convenir'

  // El RUC de la ferretería usualmente viene en la DB, pero si no está usamos ceros.
  // Como no pasamos el RUC actualmente en datos, ponemos un placeholder genérico.
  const rucFerreteria = datos.ruc_ferreteria || '00000000000'

  return (
    <Document
      title={`Comprobante ${datos.numero_comprobante} — ${datos.nombre_ferreteria}`}
      author={datos.nombre_ferreteria}
    >
      <Page size="A4" style={S.page}>
        
        {/* ── CABECERA ── */}
        <View style={S.headerRow}>
          <View style={S.headerLeft}>
            <View style={S.logoBox}>
              {datos.logo_url ? (
                <Image src={datos.logo_url} style={S.logoImg} />
              ) : (
                <Text style={S.logoIniciales}>{iniciales(datos.nombre_ferreteria)}</Text>
              )}
            </View>
            <View style={S.empresaInfo}>
              <Text style={S.empresaNombre}>{datos.nombre_ferreteria}</Text>
              {datos.direccion_ferreteria && (
                <Text style={S.empresaTexto}>{datos.direccion_ferreteria}</Text>
              )}
              <Text style={S.empresaTexto}>Telf: {datos.telefono_ferreteria}</Text>
            </View>
          </View>

          <View style={S.cajaRuc}>
            <Text style={S.cajaRucTexto}>R.U.C. N° {rucFerreteria}</Text>
            <Text style={S.cajaRucTitulo}>
              {datos.esProforma ? 'COTIZACIÓN' : 'NOTA DE VENTA'}
            </Text>
            <Text style={S.cajaRucNumero}>N° {datos.numero_comprobante}</Text>
          </View>
        </View>

        {/* ── DATOS DEL CLIENTE ── */}
        <View style={S.clienteBox}>
          <View style={S.clienteRow}>
            <Text style={S.clienteLabel}>SEÑOR(ES):</Text>
            <Text style={S.clienteValor}>{datos.nombre_cliente}</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <Text style={S.clienteLabel}>MODALIDAD:</Text>
              <Text style={S.clienteValor}>
                {datos.modalidad === 'delivery' ? 'Delivery' : 'Recojo en tienda'}
              </Text>
            </View>
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <Text style={S.clienteLabelCorto}>FECHA EMISIÓN:</Text>
              <Text style={S.clienteValor}>{formatFecha(datos.fecha_emision)}</Text>
            </View>
          </View>
          {datos.modalidad === 'delivery' && datos.direccion_entrega && (
            <View style={[S.clienteRow, { marginTop: 4 }]}>
              <Text style={S.clienteLabel}>DIRECCIÓN:</Text>
              <Text style={S.clienteValor}>{datos.direccion_entrega}</Text>
            </View>
          )}
          <View style={[S.clienteRow, { marginTop: 4 }]}>
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <Text style={S.clienteLabel}>FORMA PAGO:</Text>
              <Text style={S.clienteValor}>{formasPagoTexto}</Text>
            </View>
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <Text style={S.clienteLabelCorto}>N° PEDIDO:</Text>
              <Text style={S.clienteValor}>{datos.numero_pedido}</Text>
            </View>
          </View>
        </View>

        {/* ── TABLA DE PRODUCTOS ── */}
        <View style={S.tabla}>
          {/* Header */}
          <View style={[S.tablaRow, S.tablaHeader]}>
            <Text style={[S.tablaCell, S.colCant, { borderBottomWidth: 0 }]}>CANT.</Text>
            <Text style={[S.tablaCell, S.colUnid, { borderBottomWidth: 0 }]}>U.M.</Text>
            <Text style={[S.tablaCell, S.colDesc, { borderBottomWidth: 0 }]}>DESCRIPCIÓN</Text>
            <Text style={[S.tablaCell, S.colPUnit, { borderBottomWidth: 0 }]}>V/U</Text>
            <Text style={[S.tablaCell, S.colTotal, { borderBottomWidth: 0, borderRightWidth: 0 }]}>TOTAL</Text>
          </View>
          
          {/* Filas */}
          {datos.items.map((item, idx) => {
            const isLast = idx === datos.items.length - 1
            const bBottom = isLast ? 0 : 1
            return (
              <View key={idx} style={S.tablaRow}>
                <Text style={[S.tablaCell, S.colCant, { borderBottomWidth: bBottom }]}>{item.cantidad}</Text>
                <Text style={[S.tablaCell, S.colUnid, { borderBottomWidth: bBottom }]}>{item.unidad}</Text>
                <Text style={[S.tablaCell, S.colDesc, { borderBottomWidth: bBottom }]}>{item.nombre_producto}</Text>
                <Text style={[S.tablaCell, S.colPUnit, { borderBottomWidth: bBottom }]}>{formatPEN(item.precio_unitario)}</Text>
                <Text style={[S.tablaCell, S.colTotal, { borderBottomWidth: bBottom, borderRightWidth: 0 }]}>{formatPEN(item.subtotal)}</Text>
              </View>
            )
          })}
        </View>

        {/* ── TOTALES ── */}
        <View style={S.resumenRow}>
          <View style={S.resumenIzquierda}>
            {/* Espacio para observaciones, texto en letras, etc. típico de Nubefact */}
          </View>
          <View style={S.resumenDerecha}>
            {hayDescuento && (
              <>
                <View style={S.totalFila}>
                  <Text style={S.totalLabel}>Subtotal</Text>
                  <Text style={S.totalValor}>{formatPEN(subtotalItems)}</Text>
                </View>
                <View style={S.totalFila}>
                  <Text style={S.totalLabel}>Descuento</Text>
                  <Text style={S.totalValor}>− {formatPEN(subtotalItems - datos.total)}</Text>
                </View>
              </>
            )}
            <View style={S.totalFinalFila}>
              <Text style={S.totalFinalLabel}>TOTAL A PAGAR</Text>
              <Text style={S.totalFinalValor}>{formatPEN(datos.total)}</Text>
            </View>
          </View>
        </View>

        {/* ── PIE ── */}
        <View style={S.pie}>
          <Text style={S.pieMensaje}>
            {datos.esProforma ? '¡Gracias por su preferencia!' : '¡Gracias por su compra!'}
          </Text>
          {datos.mensaje_pie && (
            <Text style={[S.pieDisclaimer, { marginBottom: 4 }]}>{datos.mensaje_pie}</Text>
          )}
          <Text style={S.pieDisclaimer}>
            {datos.esProforma
              ? `Este documento es una PROFORMA generada por ${datos.nombre_ferreteria}. Carece de validez tributaria.`
              : `Este documento es un comprobante de control interno de ${datos.nombre_ferreteria}. No tiene validez tributaria.`}
          </Text>
          <Text style={[S.pieDisclaimer, { marginTop: 4, fontSize: 6 }]}>
            Representación impresa del Comprobante Interno
          </Text>
        </View>

      </Page>
    </Document>
  )
}
