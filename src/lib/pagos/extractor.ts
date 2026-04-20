// F5: Extractor de comprobantes de pago con Vision
//
// Analiza screenshots de Yape, Plin y transferencias bancarias.
// Devuelve datos estructurados sin inventar nada — si no ve un campo → null.
//
// Limitación sin API: no podemos verificar si el número de operación es
// real en Yape/Plin/bancos. Solo confiamos en lo que sale en la imagen.
// El dedup interno (numero_operacion UNIQUE por tenant) previene reuso de capturas.

const OPENAI_BASE = 'https://api.openai.com/v1'

export interface DatosComprobante {
  /** Plataforma de pago detectada */
  tipo: 'yape' | 'plin' | 'transferencia' | 'desconocido'
  /** Monto en la captura. null si no se ve. */
  monto: number | null
  /** Moneda (casi siempre PEN en Perú) */
  moneda: 'PEN' | 'USD'
  /** Número de operación / código de transacción. Usado para dedup interno. */
  numero_operacion: string | null
  /**
   * Nombre del pagador visible en la captura.
   * Yape: truncado ("Amanda Rod*") — quien PAGA.
   * Plin: nombre del DESTINATARIO.
   * Transferencia: nombre del DESTINATARIO.
   */
  nombre_pagador: string | null
  /**
   * Últimos dígitos del celular/cuenta del DESTINATARIO (si visible).
   * Plin: celular completo del destinatario.
   * Transferencia: últimos 4 dígitos de la cuenta.
   * Yape: NO muestra destinatario.
   */
  ultimos_digitos_destinatario: string | null
  /**
   * Últimos dígitos del celular del PAGADOR (si visible).
   * Yape: últimos 3 del celular de quien yapea ("*** *** 321").
   */
  ultimos_digitos_pagador: string | null
  /** Código de seguridad de 3 dígitos (solo Yape) */
  codigo_seguridad: string | null
  /** Fecha tal como aparece en la captura ("17 dic. 2025 11:31 p.m.") */
  fecha_visible: string | null
  /** Banco origen para transferencias (BCP, BBVA, Interbank, Scotiabank, otro) */
  banco_origen: string | null
  /** Descripción / motivo del pago si está visible */
  descripcion: string | null
  /** true si la imagen es claramente un comprobante de pago */
  es_comprobante_pago: boolean
  /** Confianza global de la extracción (0 = no se ve nada, 1 = todos los datos claros) */
  confianza_global: number
  /** Campos que no se pudieron leer por calidad de imagen */
  campos_ilegibles: string[]
}

const SYSTEM_PROMPT = `Eres un extractor especializado en comprobantes de pago peruanos.
Analiza la imagen y extrae ÚNICAMENTE lo que ves. NUNCA inventes datos.

Tipos de comprobante que reconoces:
- YAPE (app del BCP): fondo morado, dice "¡Yapeaste!", muestra monto S/, nombre truncado del que yapea (ej "Amanda Rod*"), código de seguridad (3 dígitos), últimos 3 dígitos del celular del pagador (ej "*** *** 321"), número de operación. El destinatario NO aparece en Yape.
- PLIN (Interbank/Scotiabank/BBVA/BCP): dice "¡Pago exitoso!", muestra monto, nombre y número de celular COMPLETO del destinatario, código de operación.
- TRANSFERENCIA BANCARIA (BCP, BBVA, Interbank, Scotiabank): muestra monto, nombre del destinatario, últimos 4 dígitos de cuenta, número de operación, banco origen, fecha.

REGLAS CRÍTICAS:
- ultimos_digitos_destinatario: solo para Plin (celular destino) y transferencias (últimos 4 de cuenta). En Yape → null.
- ultimos_digitos_pagador: últimos 3 del celular visible en Yape ("*** *** 321" → "321"). En Plin/transferencias → null.
- nombre_pagador: en Yape es quien PAGA. En Plin/transferencia es el DESTINATARIO (el que recibe).
- Si un campo no aparece o está borroso → null. NUNCA inventes.
- confianza_global: 1.0 si todos los campos principales están claros, 0.5 si hay campos importantes ilegibles, 0.0 si no es un comprobante.

Responde SOLO con JSON válido, sin markdown ni explicaciones.`

const USER_PROMPT = `Extrae los datos de este comprobante. Responde con exactamente este JSON:
{
  "tipo": "yape|plin|transferencia|desconocido",
  "monto": 150.00,
  "moneda": "PEN",
  "numero_operacion": "string o null",
  "nombre_pagador": "string o null",
  "ultimos_digitos_destinatario": "string o null",
  "ultimos_digitos_pagador": "string o null",
  "codigo_seguridad": "string o null",
  "fecha_visible": "string o null",
  "banco_origen": "BCP|BBVA|Interbank|Scotiabank|otro|null",
  "descripcion": "string o null",
  "es_comprobante_pago": true,
  "confianza_global": 0.9,
  "campos_ilegibles": []
}`

/**
 * Extrae datos estructurados de una imagen de comprobante de pago.
 * Retorna null si OpenAI no está disponible o si la imagen no es un comprobante.
 */
export async function extraerComprobante(
  buffer: Buffer,
  mimeType: string,
): Promise<DatosComprobante | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const base64 = buffer.toString('base64')
  const imageUrl = `data:${mimeType};base64,${base64}`

  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
              { type: 'text', text: USER_PROMPT },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      console.error('[Extractor] Error Vision:', res.status, await res.text())
      return null
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return null

    const parsed = JSON.parse(content) as DatosComprobante

    // Si Vision dice que no es comprobante, retornamos null
    if (!parsed.es_comprobante_pago) return null

    return parsed
  } catch (e) {
    console.error('[Extractor] Error:', e)
    return null
  }
}
