import { wsLogin, wsInGuiaPeso, wsGetPegoteJson, wsObtieneGuiasCliente } from "../dac-client.ts";

export interface ShipmentResult {
  success: boolean;
  trackingCode?: string;
  externalGuide?: string;
  labelUrl?: string;
  labelPath?: string;
  labelBase64?: string;
  error?: string;
  rawResponse?: any;
}

export interface ShippingAdapter {
  createShipment(
    supabaseClient: any,
    orderId: string,
    credentials: any,
    shippingAddress: any,
    weight: number,
    quantity: number,
    observations?: string,
    recipientInfo?: { name: string; phone: string }
  ): Promise<ShipmentResult>;
  
  validateConfig(credentials: any): boolean;
  
  checkExistingShipment?(
    supabaseClient: any,
    orderId: string,
    credentials: any
  ): Promise<ShipmentResult | null>;
}

/**
 * DAC Shipping Adapter
 */
export class DACAdapter implements ShippingAdapter {
  validateConfig(creds: any): boolean {
    return !!(creds && creds.username && creds.password);
  }

  async createShipment(
    supabaseClient: any,
    orderId: string,
    creds: any,
    shippingAddress: any,
    weight: number,
    quantity: number,
    observations?: string,
    recipientInfo?: { name: string; phone: string }
  ): Promise<ShipmentResult> {
    try {
      const username = creds.username;
      const password = creds.password || creds.password_encrypted;
      const apiUrl = creds.apiUrl || creds.api_url || "http://ws01.dac.com.uy/ws_ecommerce_v4/ServiciosGenerales.asmx";
      
      let kOficinaOrigen = creds.kOficinaOrigen || "800";
      let entregaDomicilio = 1;
      let entregaAgencia = 2;
      let kTipoGuia = 4;
      let kTipoEnvio = 1;
      
      if (creds.settings) {
        if (creds.settings.k_oficina_origen !== undefined) kOficinaOrigen = String(creds.settings.k_oficina_origen);
        if (creds.settings.entrega_domicilio !== undefined) entregaDomicilio = Number(creds.settings.entrega_domicilio);
        if (creds.settings.entrega_agencia !== undefined) entregaAgencia = Number(creds.settings.entrega_agencia);
        if (creds.settings.k_tipo_guia !== undefined) kTipoGuia = Number(creds.settings.k_tipo_guia);
        if (creds.settings.k_tipo_envio !== undefined) kTipoEnvio = Number(creds.settings.k_tipo_envio);
      }

      // Login or reuse session
      let { data: activeSession } = await supabaseClient
        .from('dac_sessions')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let sessionObj = activeSession;
      if (!sessionObj) {
        console.log("[DAC Adapter] Logging in to DAC...");
        const sessionData = await wsLogin(apiUrl, username, password);
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 12);
        
        const { data: storedSession, error: sessionErr } = await supabaseClient
          .from('dac_sessions')
          .insert({
            session_id: sessionData.id_session,
            k_cliente: sessionData.k_cliente,
            k_usuario: sessionData.k_usuario,
            rut: sessionData.rut,
            expires_at: expiresAt.toISOString()
          })
          .select()
          .single();
        
        if (sessionErr) throw new Error(`Failed to store new session: ${sessionErr.message}`);
        sessionObj = storedSession;
      }

      const sessionParam = {
        id_session: sessionObj.session_id,
        k_cliente: sessionObj.k_cliente,
        k_usuario: sessionObj.k_usuario,
        rut: sessionObj.rut
      };

      // Construct packages
      const packages = [];
      const qty = Math.max(1, Math.round(quantity));
      const totalWt = Number(weight) || 1.0;
      const weightPerPackage = totalWt / qty;
      for (let i = 0; i < qty; i++) {
        packages.push({
          cantidad: 1,
          peso: Number(weightPerPackage.toFixed(2))
        });
      }

      const dacDeliveryMode = shippingAddress.dac_delivery_mode || "home";
      const entrega = dacDeliveryMode === "agency" ? entregaAgencia : entregaDomicilio;
      const kOficinaDestino = shippingAddress.dac_k_oficina_destino || null;
      
      const resolvedAddress = shippingAddress.street || "";
      const dacAddress = dacDeliveryMode === "agency"
        ? `RETIRO EN AGENCIA: ${shippingAddress.dac_office_name || "Agencia DAC"}${shippingAddress.dac_office_address ? ` (${shippingAddress.dac_office_address})` : ""}`
        : resolvedAddress;

      const ci = shippingAddress.ci || "";
      let finalObservations = observations || "";
      if (ci) {
        finalObservations = `CI: ${ci}${finalObservations ? ` | ${finalObservations}` : ""}`.trim();
      }

      const shipmentInput = {
        celular: recipientInfo?.phone || shippingAddress.phone || "",
        destinatario: recipientInfo?.name || `${shippingAddress.first_name || ""} ${shippingAddress.last_name || ""}`.trim(),
        direccion: dacAddress,
        cp: "",
        localidad: dacDeliveryMode === "agency" ? (shippingAddress.city || "") : (shippingAddress.city || ""),
        departamento: dacDeliveryMode === "agency" ? (shippingAddress.department || "") : (shippingAddress.department || ""),
        telefono: recipientInfo?.phone || shippingAddress.phone || "",
        email: "",
        observaciones: finalObservations,
        codigoPedido: orderId,
        paquetesAmpara: qty,
        packages: packages,
        kTipoGuia: kTipoGuia,
        kTipoEnvio: kTipoEnvio,
        entrega: entrega,
        kOficinaDestino: kOficinaDestino || undefined
      };

      console.log("[DAC Adapter] Creating guide on DAC...");
      const dacResult = await wsInGuiaPeso(apiUrl, sessionParam, shipmentInput);
      
      // Fetch label pegote
      let labelBase64 = "";
      let labelPublicUrl = "";
      try {
        labelBase64 = await wsGetPegoteJson(apiUrl, sessionParam, dacResult.kGuia, kOficinaOrigen);
        
        // Upload label PDF to Supabase Storage
        const binaryString = atob(labelBase64);
        if (binaryString.startsWith("%PDF")) {
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          const labelPath = `dac/${orderId}-${dacResult.kGuia}.pdf`;
          const { error: uploadErr } = await supabaseClient.storage
            .from('shipping-labels')
            .upload(labelPath, new Blob([bytes], { type: 'application/pdf' }), {
              contentType: 'application/pdf',
              upsert: true
            });

          if (!uploadErr) {
            const { data: { publicUrl } } = supabaseClient.storage
              .from('shipping-labels')
              .getPublicUrl(labelPath);
            labelPublicUrl = publicUrl;
          }
        }
      } catch (labelError: any) {
        console.error("[DAC Adapter] Error loading label:", labelError.message);
      }

      const returnPath = labelPublicUrl ? `dac/${orderId}-${dacResult.kGuia}.pdf` : undefined;

      return {
        success: true,
        trackingCode: dacResult.trackingCode,
        externalGuide: String(dacResult.kGuia),
        labelUrl: labelPublicUrl || undefined,
        labelPath: returnPath,
        labelBase64: labelBase64 || undefined,
        rawResponse: dacResult
      };
    } catch (err: any) {
      console.error("[DAC Adapter Error]:", err.message);
      return {
        success: false,
        error: err.message || String(err)
      };
    }
  }

  async checkExistingShipment(
    supabaseClient: any,
    orderId: string,
    creds: any
  ): Promise<ShipmentResult | null> {
    try {
      const username = creds.username;
      const password = creds.password || creds.password_encrypted;
      const apiUrl = creds.apiUrl || creds.api_url || "http://ws01.dac.com.uy/ws_ecommerce_v4/ServiciosGenerales.asmx";
      
      let { data: activeSession } = await supabaseClient
        .from('dac_sessions')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let sessionObj = activeSession;
      if (!sessionObj) {
        console.log("[DAC Adapter] Logging in to DAC for checkExistingShipment...");
        const sessionData = await wsLogin(apiUrl, username, password);
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 12);
        
        const { data: storedSession } = await supabaseClient
          .from('dac_sessions')
          .insert({
            session_id: sessionData.id_session,
            k_cliente: sessionData.k_cliente,
            k_usuario: sessionData.k_usuario,
            rut: sessionData.rut,
            expires_at: expiresAt.toISOString()
          })
          .select()
          .single();
        sessionObj = storedSession;
      }

      const sessionParam = {
        id_session: sessionObj.session_id,
        k_cliente: sessionObj.k_cliente,
        k_usuario: sessionObj.k_usuario,
        rut: sessionObj.rut
      };

      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 2); // check last 2 days

      const formatDate = (d: Date) => {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
      };

      const fi = formatDate(yesterday);
      const ff = formatDate(today);

      console.log(`[DAC Adapter] checkExistingShipment: checking guides from ${fi} to ${ff} for order ${orderId}...`);
      const xml = await wsObtieneGuiasCliente(apiUrl, sessionParam, sessionParam.k_cliente, 0, fi, ff, sessionParam.rut);

      const regex = new RegExp(`<guia_cliente>[\\s\\S]*?<CodigoPedido>${orderId}</CodigoPedido>[\\s\\S]*?</guia_cliente>`, 'i');
      const match = xml.match(regex);
      if (match) {
        const guiaXml = match[0];
        const kGuia = (guiaXml.match(/<K_Guia[^>]*>([^<]*)<\/K_Guia>/i) || [])[1];
        const trackingCode = (guiaXml.match(/<Codigo_Rastreo[^>]*>([^<]*)<\/Codigo_Rastreo>/i) || [])[1];

        if (kGuia && trackingCode) {
          console.log(`[DAC Adapter] Found existing guide ${kGuia} with tracking ${trackingCode} for pedido ${orderId}`);
          
          let labelPublicUrl = "";
          let labelPath = "";
          let labelBase64 = "";
          try {
            let kOficinaOrigen = creds.kOficinaOrigen || "800";
            if (creds.settings && creds.settings.k_oficina_origen !== undefined) {
              kOficinaOrigen = String(creds.settings.k_oficina_origen);
            }
            labelBase64 = await wsGetPegoteJson(apiUrl, sessionParam, kGuia, kOficinaOrigen);
            
            const binaryString = atob(labelBase64);
            if (binaryString.startsWith("%PDF")) {
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              labelPath = `dac/${orderId}-${kGuia}.pdf`;
              const { error: uploadErr } = await supabaseClient.storage
                .from('shipping-labels')
                .upload(labelPath, new Blob([bytes], { type: 'application/pdf' }), {
                  contentType: 'application/pdf',
                  upsert: true
                });

              if (!uploadErr) {
                const { data: { publicUrl } } = supabaseClient.storage
                  .from('shipping-labels')
                  .getPublicUrl(labelPath);
                labelPublicUrl = publicUrl;
              }
            }
          } catch (labelError: any) {
            console.error("[DAC Adapter] Error loading existing guide label:", labelError.message);
          }

          return {
            success: true,
            trackingCode,
            externalGuide: kGuia,
            labelUrl: labelPublicUrl || undefined,
            labelPath: labelPath || undefined,
            labelBase64: labelBase64 || undefined,
            rawResponse: { kGuia, trackingCode, resolved_existing: true }
          };
        }
      }
    } catch (err: any) {
      console.error("[DAC Adapter] Error in checkExistingShipment:", err.message);
    }
    return null;
  }
}

/**
 * SoyDelivery Shipping Adapter
 */
export class SoyDeliveryAdapter implements ShippingAdapter {
  validateConfig(creds: any): boolean {
    return !!(creds && creds.apiKey && (creds.clientId || creds.negocioId));
  }

  async createShipment(
    supabaseClient: any,
    orderId: string,
    creds: any,
    shippingAddress: any,
    weight: number,
    quantity: number,
    observations?: string,
    recipientInfo?: { name: string; phone: string }
  ): Promise<ShipmentResult> {
    try {
      const apiId = creds.clientId || creds.negocioId || creds.apiId;
      const apiKey = creds.apiKey;
      const negocioId = creds.negocioId || creds.clientId || apiId;
      const negocioClave = creds.secret || creds.negocioClave;
      const isSandbox = creds.isSandbox || creds.environment === 'uat';
      
      const baseUrl = isSandbox 
        ? "http://testing.soydelivery.com.uy/rest" 
        : "https://soydelivery.com.uy/rest";

      // 1. Authenticate
      const authRes = await fetch(`${baseUrl}/sdws_autenticar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ApiId: Number(apiId),
          ApiKey: apiKey
        })
      });
      
      const authData = await authRes.json();
      if (authData.ErrId && authData.ErrId !== "0") {
        throw new Error(`SoyDelivery Auth Error: ${authData.ErrDescription}`);
      }
      const token = authData.AccessToken;
      if (!token) throw new Error("No token returned from SoyDelivery");

      // 2. Resolve origin address (remitente) from vendor addresses or default
      let originAddress = "Vázquez 1418";
      let originCity = "Montevideo";
      let originPhone = "099000000";
      
      // Attempt to look up the suborder's vendor ID
      const { data: subData } = await supabaseClient
        .from('order_suborders')
        .select('vendor_id')
        .eq('id', orderId)
        .maybeSingle();

      if (subData?.vendor_id) {
        const { data: defaultAddr } = await supabaseClient
          .from('vendor_dispatch_addresses')
          .select('*')
          .eq('vendor_id', subData.vendor_id)
          .eq('is_default', true)
          .maybeSingle();
        if (defaultAddr) {
          originAddress = defaultAddr.address;
          originCity = defaultAddr.city;
          originPhone = defaultAddr.phone || originPhone;
        }
      }

      // Parse street and number from destination street
      const destStreet = shippingAddress.street || "";
      const streetMatches = destStreet.match(/^(.*?)([\d].*)$/);
      const street = streetMatches ? streetMatches[1].trim() : destStreet;
      const number = streetMatches ? streetMatches[2].trim() : "S/N";

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const deliveryDate = tomorrow.toISOString().split('T')[0];

      const payload = {
        Negocio_id: Number(negocioId),
        Negocio_clave: Number(negocioClave),
        Negocio_RepartidoId: 0,
        Nombre_cliente: recipientInfo?.name || `${shippingAddress.first_name || ""} ${shippingAddress.last_name || ""}`.trim(),
        Telefono_cliente: recipientInfo?.phone || shippingAddress.phone || "099000000",
        Email_cliente: shippingAddress.email || "",
        Negocio_sucursal_external_id: "1",
        Ciudad_origen: originCity,
        Calle_origen: originAddress,
        Numero_origen: "S/N",
        Apto_origen: "",
        Esquina_origen: "",
        Observacion_origen: "",
        Location_origen: "",
        Ciudad_destino: shippingAddress.city || "Montevideo",
        Calle_destino: street,
        Numero_destino: number,
        Apto_destino: shippingAddress.apartment || "",
        Esquina_destino: "",
        Observacion_destino: observations || "",
        Location_destino: "",
        Fecha_entrega: deliveryDate,
        Franja_horaria: 4, // Todo el dia
        Cantidad_bultos: Math.max(1, quantity),
        Detalle: `Orden #${orderId}`,
        Pedido_external_id: orderId,
        Nro_Factura: "",
        Servicio: "Express",
        Tipo_Vehiculo_Nombre: "MOTO",
        Tipo_Producto: 1, // CHICO
        Complejidad: "NORMAL",
        Productos: []
      };

      console.log("[SoyDelivery Adapter] Creating order on SoyDelivery...");
      const createRes = await fetch(`${baseUrl}/awsnuevopedido1`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });

      const createData = await createRes.json();
      if (createData.Error_code !== 0) {
        throw new Error(`SoyDelivery Create Error: ${createData.Error_desc}`);
      }

      return {
        success: true,
        trackingCode: String(createData.Pedido_id),
        rawResponse: createData
      };
    } catch (err: any) {
      console.error("[SoyDelivery Adapter Error]:", err.message);
      return {
        success: false,
        error: err.message || String(err)
      };
    }
  }
}

/**
 * Manual Shipping Adapter (Generates only reference number)
 */
export class ManualAdapter implements ShippingAdapter {
  validateConfig(): boolean { return true; }

  async createShipment(
    _supabaseClient: any,
    orderId: string
  ): Promise<ShipmentResult> {
    return {
      success: true,
      rawResponse: { method: "manual", created_at: new Date().toISOString() }
    };
  }
}

/**
 * Pickup Adapter (Generates only reference number)
 */
export class PickupAdapter implements ShippingAdapter {
  validateConfig(): boolean { return true; }

  async createShipment(
    _supabaseClient: any,
    orderId: string
  ): Promise<ShipmentResult> {
    return {
      success: true,
      rawResponse: { method: "pickup", created_at: new Date().toISOString() }
    };
  }
}
