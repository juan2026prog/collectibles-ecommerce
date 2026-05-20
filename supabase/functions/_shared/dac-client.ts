/**
 * DAC (Grupo Agencia) SOAP Client Utility
 * Shared among Supabase Edge Functions
 */

export interface DacSession {
  id_session: string;
  k_cliente: string;
  k_usuario: string;
  rut: string;
}

export interface DacShipmentInput {
  celular: string;
  destinatario: string;
  direccion: string;
  cp: string;
  localidad: string;
  departamento: string;
  telefono: string;
  email: string;
  observaciones: string;
  codigoPedido: string;
  paquetesAmpara: number;
  packages: Array<{ cantidad: number; peso: number }>;
}

export function parseXmlTag(xml: string, tag: string): string {
  const regex = new RegExp(`<([^>:]+:)?${tag}[^>]*>([\\s\\S]*?)<\/\\1?${tag}>`, 'i');
  const match = xml.match(regex);
  if (!match) return '';
  let content = match[2].trim();
  if (content.startsWith('<![CDATA[')) {
    content = content.substring(9, content.length - 3).trim();
  }
  return content;
}

export function checkSoapFault(xml: string): void {
  if (xml.includes('<soap:Fault>') || xml.includes('<soapenv:Fault>') || xml.includes('<Fault>')) {
    const faultString = parseXmlTag(xml, 'faultstring') || parseXmlTag(xml, 'FaultString') || "Error SOAP desconocido";
    const faultCode = parseXmlTag(xml, 'faultcode') || parseXmlTag(xml, 'FaultCode') || "soap:Server";
    throw new Error(`SOAP Fault [${faultCode}]: ${faultString}`);
  }
}

function isDebugEnabled(): boolean {
  try {
    // @ts-ignore Deno namespace is available at runtime
    return Deno.env.get('DAC_DEBUG') === 'true';
  } catch {
    return false;
  }
}

export function mapDacStatus(dacStatus: string): string {
  const normalized = dacStatus.toUpperCase().trim();
  if (normalized.includes("DOCUMENTADA") || normalized.includes("DOCUMENTADO")) {
    return "documented";
  }
  if (normalized.includes("EN REPARTO") || normalized.includes("REPARTO")) {
    return "out_for_delivery";
  }
  if (normalized.includes("ENTREGADA") || normalized.includes("ENTREGADO")) {
    return "delivered";
  }
  if (normalized.includes("EN RUTA") || normalized.includes("RUTA") || normalized.includes("TRANSITO") || normalized.includes("EN TRÁNSITO")) {
    return "in_transit";
  }
  if (normalized.includes("RECHAZADA") || normalized.includes("RECHAZADO") || normalized.includes("DEVUELTO") || normalized.includes("DEVOLUCION")) {
    return "rejected";
  }
  return "in_transit";
}

/**
 * Perform login request
 */
export async function wsLogin(apiUrl: string, usuario: string, contrasenia: string): Promise<DacSession> {
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <wsLogin xmlns="http://www.dac.com.uy/">
      <Login>${escapeXml(usuario)}</Login>
      <Contrasenia>${escapeXml(contrasenia)}</Contrasenia>
    </wsLogin>
  </soap:Body>
</soap:Envelope>`;

  const soapAction = 'http://www.dac.com.uy/wsLogin';
  if (isDebugEnabled()) {
    console.log(`[DAC DEBUG] SOAP Action: ${soapAction}`);
    console.log(`[DAC DEBUG] Request XML:\n${soapEnvelope}`);
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': soapAction
    },
    body: soapEnvelope
  });

  if (!res.ok) {
    if (isDebugEnabled()) {
      console.log(`[DAC DEBUG] Response HTTP Error Status: ${res.status}`);
    }
    throw new Error(`DAC Login HTTP error: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  if (isDebugEnabled()) {
    console.log(`[DAC DEBUG] Response XML:\n${xml}`);
  }

  // Validate SOAP faults first
  checkSoapFault(xml);

  const idSession = parseXmlTag(xml, 'ID_Session');
  const kCliente = parseXmlTag(xml, 'K_Cliente');
  const kUsuario = parseXmlTag(xml, 'K_Usuario');
  const rut = parseXmlTag(xml, 'RUT');

  if (isDebugEnabled()) {
    console.log(`[DAC DEBUG] Parsed Session: idSession="${idSession}", kCliente="${kCliente}", kUsuario="${kUsuario}", rut="${rut}"`);
  }

  if (!idSession) {
    const errorMsg = parseXmlTag(xml, 'Text') || parseXmlTag(xml, 'result') || parseXmlTag(xml, 'Error') || parseXmlTag(xml, 'Mensaje') || "Error de login desconocido";
    throw new Error(`DAC SOAP Login Failed: ${errorMsg}`);
  }

  return {
    id_session: idSession,
    k_cliente: kCliente,
    k_usuario: kUsuario,
    rut: rut
  };
}

/**
 * Create guide/shipment
 */
export async function wsInGuiaPeso(
  apiUrl: string,
  session: DacSession,
  input: DacShipmentInput
): Promise<{ kGuia: string; trackingCode: string; destinationOffice: string }> {
  
  const detailXml = input.packages.map(p => `
    <Paquete>
      <Cantidad>${p.cantidad}</Cantidad>
      <Peso>${p.peso}</Peso>
    </Paquete>
  `).join('');

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <wsInGuia_peso xmlns="http://www.dac.com.uy/">
      <ID_Sesion>${escapeXml(session.id_session)}</ID_Sesion>
      <K_Cliente>${escapeXml(session.k_cliente)}</K_Cliente>
      <K_Usuario>${escapeXml(session.k_usuario)}</K_Usuario>
      <K_Tipo_Guia>2</K_Tipo_Guia>
      <K_Tipo_Envio>1</K_Tipo_Envio>
      <Entrega>2</Entrega>
      <RUT>${escapeXml(session.rut)}</RUT>
      <Celular>${escapeXml(input.celular)}</Celular>
      <Destinatario>${escapeXml(input.destinatario)}</Destinatario>
      <Direccion>${escapeXml(input.direccion)}</Direccion>
      <CP>${escapeXml(input.cp)}</CP>
      <Localidad>${escapeXml(input.localidad)}</Localidad>
      <Departamento>${escapeXml(input.departamento)}</Departamento>
      <Telefono>${escapeXml(input.telefono)}</Telefono>
      <Email>${escapeXml(input.email)}</Email>
      <Observaciones>${escapeXml(input.observaciones)}</Observaciones>
      <CodigoPedido>${escapeXml(input.codigoPedido)}</CodigoPedido>
      <Paquetes_Ampara>${input.paquetesAmpara}</Paquetes_Ampara>
      <Detalle_Paquetes>
        ${detailXml}
      </Detalle_Paquetes>
    </wsInGuia_peso>
  </soap:Body>
</soap:Envelope>`;

  const soapAction = 'http://www.dac.com.uy/wsInGuia_peso';
  if (isDebugEnabled()) {
    console.log(`[DAC DEBUG] SOAP Action: ${soapAction}`);
    console.log(`[DAC DEBUG] Request XML:\n${soapEnvelope}`);
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': soapAction
    },
    body: soapEnvelope
  });

  if (!res.ok) {
    if (isDebugEnabled()) {
      console.log(`[DAC DEBUG] Response HTTP Error Status: ${res.status}`);
    }
    throw new Error(`DAC wsInGuia_peso HTTP error: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  if (isDebugEnabled()) {
    console.log(`[DAC DEBUG] Response XML:\n${xml}`);
  }

  // Validate SOAP faults first
  checkSoapFault(xml);

  const kGuia = parseXmlTag(xml, 'K_Guia');
  const trackingCode = parseXmlTag(xml, 'Codigo_Rastreo') || parseXmlTag(xml, 'Cod_Rastreo');
  const destinationOffice = parseXmlTag(xml, 'K_Oficina_Destino');

  if (isDebugEnabled()) {
    console.log(`[DAC DEBUG] Parsed Guide Result: kGuia="${kGuia}", trackingCode="${trackingCode}", destinationOffice="${destinationOffice}"`);
  }

  if (!kGuia && !trackingCode) {
    const errorMsg = parseXmlTag(xml, 'Error') || parseXmlTag(xml, 'Mensaje') || "Fallo al generar la guía en DAC";
    throw new Error(`DAC SOAP Create Shipment Failed: ${errorMsg}`);
  }

  return { kGuia, trackingCode, destinationOffice };
}

/**
 * Get Label (Pegote) Base64
 */
export async function wsGetPegote(
  apiUrl: string,
  session: DacSession,
  kGuia: string
): Promise<string> {
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <wsGetPegote xmlns="http://www.dac.com.uy/">
      <ID_Sesion>${escapeXml(session.id_session)}</ID_Sesion>
      <K_Guia>${escapeXml(kGuia)}</K_Guia>
    </wsGetPegote>
  </soap:Body>
</soap:Envelope>`;

  const soapAction = 'http://www.dac.com.uy/wsGetPegote';
  if (isDebugEnabled()) {
    console.log(`[DAC DEBUG] SOAP Action: ${soapAction}`);
    console.log(`[DAC DEBUG] Request XML:\n${soapEnvelope}`);
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': soapAction
    },
    body: soapEnvelope
  });

  if (!res.ok) {
    if (isDebugEnabled()) {
      console.log(`[DAC DEBUG] Response HTTP Error Status: ${res.status}`);
    }
    throw new Error(`DAC wsGetPegote HTTP error: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  if (isDebugEnabled()) {
    console.log(`[DAC DEBUG] Response XML length: ${xml.length} bytes`);
  }

  // Validate SOAP faults first
  checkSoapFault(xml);

  const base64 = parseXmlTag(xml, 'wsGetPegoteResult') || parseXmlTag(xml, 'Pegote');

  if (isDebugEnabled()) {
    console.log(`[DAC DEBUG] Parsed Pegote Base64: ${base64 ? '(Found, length: ' + base64.length + ')' : '(Not Found)'}`);
  }

  if (!base64) {
    const errorMsg = parseXmlTag(xml, 'Error') || parseXmlTag(xml, 'Mensaje') || "Fallo al obtener la etiqueta";
    throw new Error(`DAC SOAP Get Label Failed: ${errorMsg}`);
  }

  return base64;
}

/**
 * Track shipment status
 */
export async function wsRastreoGuia(
  apiUrl: string,
  session: DacSession,
  kGuia: string,
  trackingCode: string
): Promise<{ status: string; statusDescription: string; rawStatus: string }> {
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <wsRastreoGuia xmlns="http://www.dac.com.uy/">
      <ID_Sesion>${escapeXml(session.id_session)}</ID_Sesion>
      <K_Guia>${escapeXml(kGuia)}</K_Guia>
      <Codigo_Rastreo>${escapeXml(trackingCode)}</Codigo_Rastreo>
    </wsRastreoGuia>
  </soap:Body>
</soap:Envelope>`;

  const soapAction = 'http://www.dac.com.uy/wsRastreoGuia';
  if (isDebugEnabled()) {
    console.log(`[DAC DEBUG] SOAP Action: ${soapAction}`);
    console.log(`[DAC DEBUG] Request XML:\n${soapEnvelope}`);
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': soapAction
    },
    body: soapEnvelope
  });

  if (!res.ok) {
    if (isDebugEnabled()) {
      console.log(`[DAC DEBUG] Response HTTP Error Status: ${res.status}`);
    }
    throw new Error(`DAC wsRastreoGuia HTTP error: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  if (isDebugEnabled()) {
    console.log(`[DAC DEBUG] Response XML:\n${xml}`);
  }

  // Validate SOAP faults first
  checkSoapFault(xml);
  
  const rawStatus = parseXmlTag(xml, 'Estado') || parseXmlTag(xml, 'Desc_Ultimo_Estado') || parseXmlTag(xml, 'Ultimo_Estado') || "DOCUMENTADA";
  const statusDescription = parseXmlTag(xml, 'Detalle') || parseXmlTag(xml, 'Observaciones') || rawStatus;
  const status = mapDacStatus(rawStatus);

  if (isDebugEnabled()) {
    console.log(`[DAC DEBUG] Parsed Tracking Result: rawStatus="${rawStatus}", statusDescription="${statusDescription}", status="${status}"`);
  }

  return { status, statusDescription, rawStatus };
}

function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

export interface DacCostInput {
  ID_Sesion: string;
  K_Tipo_Guia: number;
  K_Tipo_Envio: number;
  K_Cliente_Remitente: number;
  K_Cliente_Destinatario: number;
  Direccion_Destinatario: string;
  K_Oficina_Destino: number;
  Entrega: number;
  Paquetes_Ampara: number;
  Detalle_Paquetes: string; // JSON stringified array of packages
  esRecoleccion: number;
  usaBolsa: number;
}

export async function wsObtieneCostoNuevo(
  apiUrl: string,
  input: DacCostInput
): Promise<number> {
  const url = apiUrl.endsWith('/wsObtieneCosto_Nuevo') ? apiUrl : `${apiUrl.replace(/\/$/, '')}/wsObtieneCosto_Nuevo`;

  if (isDebugEnabled()) {
    console.log(`[DAC DEBUG] wsObtieneCostoNuevo URL: ${url}`);
    console.log(`[DAC DEBUG] wsObtieneCostoNuevo Request Payload:`, JSON.stringify(input));
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(input)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DAC wsObtieneCostoNuevo HTTP error: ${res.status} ${res.statusText}. Response: ${text}`);
  }

  const data = await res.json();
  if (isDebugEnabled()) {
    console.log(`[DAC DEBUG] wsObtieneCostoNuevo Response:`, JSON.stringify(data));
  }

  const dVal = data.d;
  if (!dVal) {
    throw new Error("Empty response from wsObtieneCostoNuevo JSON service");
  }

  let resultObj = dVal;
  if (typeof dVal === 'string') {
    try {
      resultObj = JSON.parse(dVal);
    } catch {
      throw new Error(`Failed to parse stringified 'd' response: ${dVal}`);
    }
  }

  if (typeof resultObj === 'number') {
    return resultObj;
  }

  const cost = resultObj.Costo ?? resultObj.costo ?? resultObj.CostoTotal ?? resultObj.costo_total ?? resultObj.wsObtieneCosto_NuevoResult ?? resultObj.Valor ?? resultObj.valor;
  if (cost === undefined) {
    if (resultObj.ErrorMessage || resultObj.Message) {
      throw new Error(`DAC API error: ${resultObj.ErrorMessage || resultObj.Message}`);
    }
    throw new Error(`Could not find cost field in response: ${JSON.stringify(resultObj)}`);
  }

  return Number(cost);
}

export async function wsGetPegoteJson(
  apiUrl: string,
  session: DacSession,
  kGuia: string,
  kOficina: string = "800",
  codigoPedido: string = ""
): Promise<string> {
  const url = apiUrl.endsWith('/wsGetPegote') ? apiUrl : `${apiUrl.replace(/\/$/, '')}/wsGetPegote`;

  const payload = {
    K_Oficina: kOficina,
    K_Guia: kGuia,
    ID_Sesion: session.id_session,
    CodigoPedido: codigoPedido
  };

  if (isDebugEnabled()) {
    console.log(`[DAC DEBUG] wsGetPegoteJson URL: ${url}`);
    console.log(`[DAC DEBUG] wsGetPegoteJson Request Payload:`, JSON.stringify(payload));
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DAC wsGetPegoteJson HTTP error: ${res.status} ${res.statusText}. Response: ${text}`);
  }

  const data = await res.json();
  if (isDebugEnabled()) {
    console.log(`[DAC DEBUG] wsGetPegoteJson Response:`, JSON.stringify(data));
  }

  const dVal = data.d;
  if (!dVal) {
    throw new Error("Empty response from wsGetPegote JSON service");
  }

  if (typeof dVal === 'string') {
    if (dVal.trim().startsWith('{') || dVal.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(dVal);
        return parsed.Pegote || parsed.wsGetPegoteResult || parsed.base64 || dVal;
      } catch {
        return dVal;
      }
    }
    return dVal;
  } else if (typeof dVal === 'object') {
    return dVal.Pegote || dVal.wsGetPegoteResult || dVal.base64 || '';
  }

  throw new Error("Invalid response format from wsGetPegote JSON service");
}
