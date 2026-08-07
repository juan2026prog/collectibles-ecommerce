# Preguntas Abiertas e Inconsistencias Técnicas — API Distrilogic 2026

Este documento contiene los puntos ambiguos, vacíos o inconsistencias identificadas durante el análisis técnico de la especificación `DISTRILOGIC_API_INTEGRACION_2026.pdf`.

---

## 1. Seguridad y Protocolos HTTP vs. HTTPS

* **Inconsistencia en URLs**: La documentación indica URLs que utilizan el protocolo `http://` no cifrado:
  - Testing: `http://test.DISTRILOGIC.com.uy/rest/`
  - Producción: `http://tracking.districad.com.uy/rest/`
* **Pregunta**: ¿Las APIs de Distrilogic soportan conexión HTTPS segura sobre TLS 1.2+ (`https://`) en ambos ambientes para evitar la transmisión de credenciales y datos personales en texto plano por la red?

---

## 2. Código de País (`PaiCod`)

* **Inconsistencia**: En los ejemplos del PDF se muestran dos valores distintos para Uruguay:
  - En `WsGetServicio` (Pág. 5) y `WsGetLstServicios` (Pág. 8): `"PaiCod": "UR"`
  - En `wsaltaservicioetiquetaV2` (Pág. 12 y 13): `"PaiCod": "UY"`
* **Pregunta**: ¿Cuál es el valor estandarizado que debe enviarse en `PaiCod` para envíos nacionales dentro de Uruguay? ¿Se admite `"UY"`, `"UR"` o el código ISO 3166-1 alpha-2?

---

## 3. Formato Decimal y Coordenadas (`SrvDirLat` / `SrvDirLon`)

* **Inconsistencia**: En el esquema de campos se especifica `N(10.5)` para latitud y longitud, pero en el ejemplo JSON (Pág. 13) se utiliza una string con coma decimal:
  - Ejemplo: `"SrvDirLat": "-34,91102"`, `"SrvDirLon": "-56,14544"`
* **Pregunta**: ¿El analizador JSON de la API requiere coma `,` o punto `.` como separador decimal para coordenadas geográficas?

---

## 4. Identificador de Servicio (`TSrvId` vs. `TSrvDsc`)

* **Ambigüedad**: En el alta de servicio (`wsaltaservicioetiquetaV2`):
  - El cuadro de validación (Pág. 10) requiere `SrvDsc` ("Debe existir el Tipo de Servicio para el Nro. de Cliente").
  - La tabla de atributos (Pág. 11) lista `TSrvDsc` (Char 50) como "Tipo de Servicio Descripción (ej: CADETERIA/EXPRESS)".
  - En el ejemplo JSON (Pág. 13) se envía `"TSrvId": "385"`.
* **Pregunta**: ¿Es obligatorio enviar el ID numérico (`TSrvId`) o la descripción textual (`TSrvDsc`), o ambos en el payload de creación?

---

## 5. Webhooks y Notificaciones (`SrvPostUrl`)

* **Falta de Especificación**:
  - El campo `SrvPostUrl` (Char 200) permite enviar una URL para actualización de estados.
  - La documentación no det детаilla el formato del payload enviado al webhook, la firma HMAC / header de autenticación, el comportamiento ante reintentos ni la respuesta HTTP esperada (`200 OK`).
* **Pregunta**: ¿Cuál es el contrato del webhook enviado por Distrilogic? ¿Se puede incluir un token secreto de consulta en la Query String (ej: `https://domain.com/webhook?token=XYZ`)?

---

## 6. Tarifas por Cliente (`WsGetTarifaPorCliente`)

* **Formatos de Zona y Peso**:
  - En el método `WsGetTarifaPorCliente` se puede filtrar por `DeptoCod`.
  - La respuesta retorna un array de `Departamentos`.
* **Pregunta**: ¿Cómo se cotizan envíos si la dirección de entrega no especifica departamento? ¿Existe una consulta global para obtener la matriz completa de tarifas del cliente sin iterar departamento por departamento?

---

## 7. Solicitud de Retiro y Remitente (Pickup / Dispatch Address)

* **Dirección de Origen**:
  - El alta de servicio no incluye campos explícitos de dirección de retiro/origen (remitente), solo datos de destino (`SrvDstCalle`, `SrvDstNro`, `SrvDstApto`, `DeptoCod`, `LocCod`).
* **Pregunta**: ¿Distrilogic toma la dirección del remitente asociada a la cuenta `CueId` ingresada, o existe algún campo en `wsaltaservicioetiquetaV2` para especificar una dirección de origen diferente por envío?
