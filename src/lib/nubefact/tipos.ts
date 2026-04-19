// Tipos para la API de Nubefact (OSE/PSE peruano)
// Documentación: https://nubefact.com/api
//
// Nubefact recibe boletas y facturas, las firma digitalmente
// y las envía a SUNAT. Devuelve un CDR (Constancia de Recepción).

// ── Constantes ─────────────────────────────────────────────────────────────────

export const NUBEFACT_TIPO = {
  FACTURA: 1,
  BOLETA:  2,
} as const

export const NUBEFACT_TIPO_DOC_CLIENTE = {
  SIN_DOC: 0,
  DNI:     1,
  CARNET:  4,
  RUC:     6,
  PASAPORTE: 7,
} as const

export const NUBEFACT_TIPO_IGV = {
  GRAVADO_OP_ONEROSA:        1,  // con IGV 18%
  INAFECTO_OP_ONEROSA:       3,  // sin IGV, inafecto
  EXONERADO_OP_ONEROSA:      2,  // sin IGV, exonerado
  GRATUITO_RETRIBUCION:      5,  // gratuito
} as const

export const NUBEFACT_UNIDAD = {
  UNIDAD:    'NIU',
  KILOGRAMO: 'KGM',
  METRO:     'MTR',
  LITRO:     'LTR',
  SERVICIO:  'ZZ',
} as const

// ── Payload que enviamos a Nubefact ──────────────────────────────────────────

export interface NubefactItem {
  unidad_de_medida:  string        // 'NIU' para unidades
  codigo:            string        // código interno del producto
  descripcion:       string
  cantidad:          number
  valor_unitario:    number        // precio sin IGV
  precio_unitario:   number        // precio con IGV (= valor_unitario * 1.18 si afecto)
  descuento:         ''
  subtotal:          number        // cantidad * valor_unitario
  tipo_de_igv:       number        // 1=gravado, 3=inafecto
  igv:               number        // monto IGV del item
  total:             number        // cantidad * precio_unitario
  anticipo_regularizacion: false
  anticipo_documento_serie:  ''
  anticipo_documento_numero: ''
}

export interface NubefactPayload {
  operacion:                    'generar_comprobante'
  tipo_de_comprobante:          number   // 1=factura, 2=boleta
  serie:                        string   // 'B001'
  numero:                       number   // correlativo entero
  sunat_transaction:            1
  cliente_tipo_de_documento:    number
  cliente_numero_de_documento:  string
  cliente_denominacion:         string
  cliente_direccion:            ''
  cliente_email:                ''
  cliente_email_1:              ''
  cliente_email_2:              ''
  fecha_de_emision:             string   // 'DD-MM-YYYY'
  fecha_de_vencimiento:         ''
  moneda:                       1        // 1 = PEN (soles)
  tipo_de_cambio:               ''
  porcentaje_de_igv:            18
  descuento_global:             ''
  total_descuento:              ''
  total_anticipo:               ''
  total_gravada:                number
  total_inafecta:               ''
  total_exonerada:              ''
  total_igv:                    number
  total_gratuita:               ''
  total_otros_cargos:           ''
  total:                        number
  percepcion_tipo:              ''
  percepcion_base_imponible:    ''
  total_percepcion:             ''
  total_incluido_percepcion:    ''
  detraccion:                   false
  observaciones:                string
  documento_que_se_modifica_tipo:   ''
  documento_que_se_modifica_serie:  ''
  documento_que_se_modifica_numero: ''
  tipo_de_nota_de_credito:      ''
  tipo_de_nota_de_debito:       ''
  enviar_automaticamente_a_la_sunat:  true
  enviar_automaticamente_al_cliente:  false
  codigo_unico:                 string   // UUID interno para deduplicación
  condiciones_de_pago:          ''
  medio_de_pago:                ''
  placa_vehiculo:               ''
  orden_compra_servicio:        ''
  tabla_personalizada_codigo:   ''
  formato_de_pdf:               ''
  items:                        NubefactItem[]
}

// ── Respuesta de Nubefact ─────────────────────────────────────────────────────

export interface NubefactRespuestaOk {
  aceptada_por_sunat:    boolean
  enviada_a_sunat:       boolean
  numero_ticket_sunat:   string | null
  nubefact_id:           string       // UUID de Nubefact
  hash_cpe:              string       // hash CDR
  enlace_del_pdf:        string       // URL pública del PDF
  enlace_del_xml:        string       // URL pública del XML
  enlace_del_cdr:        string       // URL pública del CDR
  cadena_para_codigo_qr: string
  codigo:                number       // 0 = sin error SUNAT
  errors:                unknown[]
  sunat_description:     string
  sunat_note:            string | null
  sunat_responsecode:    string | null
}

export interface NubefactRespuestaError {
  errors:  { code: string; description: string }[]
  codigo?: number
}

export type NubefactRespuesta = NubefactRespuestaOk | NubefactRespuestaError

export function esRespuestaOk(r: NubefactRespuesta): r is NubefactRespuestaOk {
  return 'nubefact_id' in r
}
