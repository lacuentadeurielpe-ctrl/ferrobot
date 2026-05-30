import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer'
import { format } from 'date-fns'

Font.register({
  family: 'Roboto',
  fonts: [
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf', fontWeight: 'normal' },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 'bold' }
  ]
})

// ── Colores de la paleta ────────────────────────────────────────────────────
const COLORS = {
  primary: '#1e3a5f',      // Azul oscuro elegante
  primaryLight: '#2c5282', // Azul medio
  accent: '#e67e22',       // Naranja ferretero
  bg: '#f8fafc',           // Fondo sutil
  bgStripe: '#edf2f7',     // Fila alternada
  border: '#cbd5e0',       // Bordes sutiles
  text: '#1a202c',         // Texto principal
  textMuted: '#718096',    // Texto secundario
  white: '#ffffff',
  success: '#38a169',
}

// ── Estilos profesionales A4 ────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Roboto',
    fontSize: 9,
    color: COLORS.text,
    backgroundColor: COLORS.white,
    padding: 0,
  },

  // ── HEADER con franja de color ──
  headerBand: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 40,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    backgroundColor: COLORS.white,
    borderRadius: 6,
    padding: 12,
    alignItems: 'center',
    minWidth: 180,
  },
  empresaNombre: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 2,
  },
  empresaRazon: {
    fontSize: 9,
    color: '#94b8db',
    marginBottom: 1,
  },
  empresaInfo: {
    fontSize: 8,
    color: '#a0aec0',
  },
  tipoDocLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 4,
    textAlign: 'center',
  },
  rucBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 2,
    textAlign: 'center',
  },
  numComprobante: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.accent,
    textAlign: 'center',
  },

  // ── Acento naranja debajo del header ──
  accentBar: {
    height: 4,
    backgroundColor: COLORS.accent,
  },

  // ── Cuerpo ──
  body: {
    paddingHorizontal: 40,
    paddingTop: 18,
    paddingBottom: 20,
    flex: 1,
  },

  // ── Info del cliente ──
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    backgroundColor: COLORS.bg,
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoColumn: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 7,
    color: COLORS.textMuted,
    textTransform: 'uppercase' as any,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 6,
  },

  // ── Tabla de items ──
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  tableHeaderText: {
    color: COLORS.white,
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase' as any,
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
  },
  tableRowAlt: {
    backgroundColor: COLORS.bgStripe,
  },
  colNum: { width: '6%', textAlign: 'center' },
  colCant: { width: '10%', textAlign: 'center' },
  colDesc: { width: '44%' },
  colPrecio: { width: '18%', textAlign: 'right' },
  colSubtotal: { width: '22%', textAlign: 'right' },

  // ── Totales ──
  totalesContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  totalesBox: {
    width: 220,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  totalesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
  },
  totalFinalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: COLORS.primary,
  },
  totalFinalLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  totalFinalValue: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.white,
  },

  // ── QR y Footer ──
  footerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  qrContainer: {
    alignItems: 'center',
  },
  qrImage: {
    width: 80,
    height: 80,
  },
  hashText: {
    fontSize: 6,
    color: COLORS.textMuted,
    marginTop: 2,
    maxWidth: 120,
    textAlign: 'center',
  },
  legalBox: {
    flex: 1,
    alignItems: 'flex-end',
    paddingLeft: 20,
  },
  legalText: {
    fontSize: 7,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginBottom: 1,
  },

  // ── Bottom band ──
  bottomBand: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 40,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  bottomText: {
    fontSize: 7,
    color: '#94b8db',
    textAlign: 'center',
  },
})

// ── Tipos de datos ──────────────────────────────────────────────────────────
export interface BoletaFacturaData {
  ferreteria: {
    razon_social: string
    nombre_comercial: string
    ruc: string
    direccion: string
    logo_url?: string | null
  }
  comprobante: {
    numero_completo: string
    tipo: 'boleta' | 'factura' | 'nota_credito'
    fecha: string
    cliente_nombre: string
    cliente_doc: string
    subtotal: number
    igv: number
    total: number
    hash: string
    qr_data_uri: string
  }
  items: Array<{
    cantidad: number
    descripcion: string
    precio_unitario: number
    subtotal: number
  }>
}

export default function PlantillaBoletaFactura({ data }: { data: BoletaFacturaData }) {
  const isFactura = data.comprobante.tipo === 'factura'
  const isNotaCredito = data.comprobante.tipo === 'nota_credito'

  const tipoLabel = isNotaCredito
    ? 'NOTA DE CREDITO ELECTRONICA'
    : isFactura
    ? 'FACTURA ELECTRONICA'
    : 'BOLETA DE VENTA ELECTRONICA'

  const docLabel = isFactura ? 'RUC' : 'DNI/Doc.'

  let fechaFormateada = ''
  try {
    fechaFormateada = format(new Date(data.comprobante.fecha), 'dd/MM/yyyy')
  } catch {
    fechaFormateada = data.comprobante.fecha
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── HEADER ── */}
        <View style={styles.headerBand}>
          <View style={styles.headerLeft}>
            <Text style={styles.empresaNombre}>{data.ferreteria.nombre_comercial}</Text>
            <Text style={styles.empresaRazon}>{data.ferreteria.razon_social}</Text>
            <Text style={styles.empresaInfo}>{data.ferreteria.direccion}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.rucBadge}>RUC: {data.ferreteria.ruc}</Text>
            <Text style={styles.tipoDocLabel}>{tipoLabel}</Text>
            <Text style={styles.numComprobante}>{data.comprobante.numero_completo}</Text>
          </View>
        </View>
        <View style={styles.accentBar} />

        {/* ── BODY ── */}
        <View style={styles.body}>
          {/* ── Info del cliente ── */}
          <View style={styles.infoSection}>
            <View style={styles.infoColumn}>
              <Text style={styles.infoLabel}>Cliente</Text>
              <Text style={styles.infoValue}>{data.comprobante.cliente_nombre}</Text>
              <Text style={styles.infoLabel}>{docLabel}</Text>
              <Text style={styles.infoValue}>{data.comprobante.cliente_doc || 'Sin documento'}</Text>
            </View>
            <View style={styles.infoColumn}>
              <Text style={styles.infoLabel}>Fecha de emision</Text>
              <Text style={styles.infoValue}>{fechaFormateada}</Text>
              <Text style={styles.infoLabel}>Moneda</Text>
              <Text style={styles.infoValue}>SOLES (PEN)</Text>
            </View>
          </View>

          {/* ── Tabla de items ── */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colNum]}>#</Text>
            <Text style={[styles.tableHeaderText, styles.colCant]}>CANT.</Text>
            <Text style={[styles.tableHeaderText, styles.colDesc]}>DESCRIPCION</Text>
            <Text style={[styles.tableHeaderText, styles.colPrecio]}>P. UNIT.</Text>
            <Text style={[styles.tableHeaderText, styles.colSubtotal]}>IMPORTE</Text>
          </View>

          {data.items.map((item, i) => (
            <View
              key={i}
              style={[styles.tableRow, i % 2 !== 0 ? styles.tableRowAlt : {}]}
            >
              <Text style={styles.colNum}>{i + 1}</Text>
              <Text style={styles.colCant}>{item.cantidad}</Text>
              <Text style={styles.colDesc}>{item.descripcion}</Text>
              <Text style={styles.colPrecio}>S/ {item.precio_unitario.toFixed(2)}</Text>
              <Text style={styles.colSubtotal}>S/ {item.subtotal.toFixed(2)}</Text>
            </View>
          ))}

          {/* ── Totales ── */}
          <View style={styles.totalesContainer}>
            <View style={styles.totalesBox}>
              <View style={styles.totalesRow}>
                <Text>Op. Gravada</Text>
                <Text>S/ {data.comprobante.subtotal.toFixed(2)}</Text>
              </View>
              <View style={styles.totalesRow}>
                <Text>IGV (18%)</Text>
                <Text>S/ {data.comprobante.igv.toFixed(2)}</Text>
              </View>
              <View style={styles.totalFinalRow}>
                <Text style={styles.totalFinalLabel}>TOTAL</Text>
                <Text style={styles.totalFinalValue}>S/ {data.comprobante.total.toFixed(2)}</Text>
              </View>
            </View>
          </View>

          {/* ── Footer QR + Legal ── */}
          <View style={styles.footerSection}>
            <View style={styles.qrContainer}>
              {data.comprobante.qr_data_uri ? (
                <Image src={data.comprobante.qr_data_uri} style={styles.qrImage} />
              ) : null}
              {data.comprobante.hash ? (
                <Text style={styles.hashText}>Hash: {data.comprobante.hash}</Text>
              ) : null}
            </View>
            <View style={styles.legalBox}>
              <Text style={styles.legalText}>Representacion impresa del comprobante electronico.</Text>
              <Text style={styles.legalText}>Consulte su documento en www.sunat.gob.pe</Text>
              <Text style={[styles.legalText, { marginTop: 6, fontWeight: 'bold', color: COLORS.text }]}>
                Gracias por su preferencia
              </Text>
            </View>
          </View>
        </View>

        {/* ── Bottom band ── */}
        <View style={styles.bottomBand}>
          <Text style={styles.bottomText}>
            {data.ferreteria.nombre_comercial}  |  RUC {data.ferreteria.ruc}  |  {data.ferreteria.direccion}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
