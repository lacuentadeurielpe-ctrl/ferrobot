import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer'
import { format } from 'date-fns'

// Configuración recomendada para impresoras térmicas (80mm)
const styles = StyleSheet.create({
  page: {
    width: '80mm',
    padding: '5mm',
    fontFamily: 'Helvetica', // Usamos Helvetica standard para evitar descargar fuentes si es posible, o podemos registrar una
    fontSize: 9,
    color: '#000',
    backgroundColor: '#fff',
  },
  header: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logo: {
    width: 60,
    marginBottom: 4,
  },
  title: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 9,
    textAlign: 'center',
    marginBottom: 1,
  },
  separator: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'dashed',
    marginVertical: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  colLeft: {
    flex: 1,
  },
  colRight: {
    textAlign: 'right',
  },
  itemsHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 2,
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  itemQty: {
    width: '15%',
  },
  itemDesc: {
    width: '60%',
  },
  itemTotal: {
    width: '25%',
    textAlign: 'right',
  },
  totalSection: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#000',
    paddingTop: 4,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 1,
  },
  totalLabel: {
    fontWeight: 'bold',
  },
  totalValue: {
    fontWeight: 'bold',
  },
  footer: {
    marginTop: 8,
    alignItems: 'center',
  },
  qrContainer: {
    alignItems: 'center',
    marginTop: 4,
  },
  qrImage: {
    width: 80,
    height: 80,
  },
  hashText: {
    fontSize: 7,
    marginTop: 2,
    textAlign: 'center',
    wordBreak: 'break-all',
  },
  legalText: {
    fontSize: 7,
    textAlign: 'center',
    marginTop: 4,
  }
})

export interface TicketData {
  ferreteria: {
    razon_social: string
    nombre_comercial: string
    ruc: string
    direccion: string
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

export default function PlantillaTicket({ data }: { data: TicketData }) {
  const isFactura = data.comprobante.tipo === 'factura'
  const isNotaCredito = data.comprobante.tipo === 'nota_credito'
  const title = isNotaCredito 
    ? 'NOTA DE CRÉDITO ELECTRÓNICA' 
    : isFactura ? 'FACTURA ELECTRÓNICA' : 'BOLETA ELECTRÓNICA'

  return (
    <Document>
      <Page style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{data.ferreteria.nombre_comercial}</Text>
          <Text style={styles.subtitle}>{data.ferreteria.razon_social}</Text>
          <Text style={styles.subtitle}>RUC: {data.ferreteria.ruc}</Text>
          <Text style={styles.subtitle}>{data.ferreteria.direccion}</Text>
        </View>

        <View style={styles.separator} />

        <View style={{ alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ fontWeight: 'bold' }}>{title}</Text>
          <Text>{data.comprobante.numero_completo}</Text>
        </View>

        <View style={styles.separator} />

        <View style={{ marginBottom: 4 }}>
          <Text>Fecha: {format(new Date(data.comprobante.fecha), 'dd/MM/yyyy HH:mm')}</Text>
          <Text>Cliente: {data.comprobante.cliente_nombre}</Text>
          <Text>{isFactura ? 'RUC' : 'DNI/Doc'}: {data.comprobante.cliente_doc || 'Varios'}</Text>
        </View>

        <View style={styles.itemsHeader}>
          <Text style={styles.itemQty}>Cant</Text>
          <Text style={styles.itemDesc}>Descripción</Text>
          <Text style={styles.itemTotal}>Total</Text>
        </View>

        {data.items.map((item, i) => (
          <View key={i} style={styles.itemRow}>
            <Text style={styles.itemQty}>{item.cantidad}</Text>
            <Text style={styles.itemDesc}>{item.descripcion}</Text>
            <Text style={styles.itemTotal}>{item.subtotal.toFixed(2)}</Text>
          </View>
        ))}

        <View style={styles.totalSection}>
          <View style={styles.totalRow}>
            <Text>OP. GRAVADA</Text>
            <Text>S/ {data.comprobante.subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>IGV (18%)</Text>
            <Text>S/ {data.comprobante.igv.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL A PAGAR</Text>
            <Text style={styles.totalValue}>S/ {data.comprobante.total.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.separator} />

        <View style={styles.footer}>
          <View style={styles.qrContainer}>
            {data.comprobante.qr_data_uri && (
              <Image src={data.comprobante.qr_data_uri} style={styles.qrImage} />
            )}
            <Text style={styles.hashText}>Hash: {data.comprobante.hash}</Text>
          </View>
          <Text style={styles.legalText}>Representación impresa del comprobante electrónico.</Text>
          <Text style={styles.legalText}>Consulte su documento en www.sunat.gob.pe</Text>
        </View>
      </Page>
    </Document>
  )
}
