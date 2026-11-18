/**
 * Centralized Notification Templates for Collectibles Marketplace
 * Resolves In-App (title, body, category, severity), Push (title, body),
 * Email (subject, text, html), and Deep Links for all 4 roles:
 * Customer, Admin, Vendor, Affiliate/Influencer.
 */

export function formatCurrencyUYU(amount: number, currency: string = 'UYU'): string {
  const formatted = new Intl.NumberFormat('es-UY', {
    style: 'decimal',
    minimumFractionDigits: currency === 'USD' ? 2 : 0,
    maximumFractionDigits: currency === 'USD' ? 2 : 0,
  }).format(Number(amount || 0));
  return currency === 'UYU' ? `$ ${formatted}` : `${currency} ${formatted}`;
}

export function formatOrderNumber(order: { order_number?: string | null; display_number?: string | null; id?: string }): string {
  const num = order.order_number || order.display_number;
  if (num) {
    return num.startsWith('#') ? num : `#${num}`;
  }
  if (order.id) {
    return `#COL-${order.id.slice(0, 8).toUpperCase()}`;
  }
  return '#N/A';
}

export function resolveValidTrackingUrl(provider?: string | null, trackingNumber?: string | null, customUrl?: string | null): string | null {
  if (customUrl && /^https?:\/\//i.test(customUrl.trim())) {
    return customUrl.trim();
  }
  if (!trackingNumber || !trackingNumber.trim()) return null;
  const cleanCode = encodeURIComponent(trackingNumber.trim());
  const normProvider = (provider || '').toLowerCase().trim();

  if (normProvider.includes('dac')) {
    return `https://www.dac.com.uy/envios/seguimiento?guia=${cleanCode}`;
  }
  if (normProvider.includes('ues')) {
    return `https://www.ues.com.uy/rastreo/?guia=${cleanCode}`;
  }
  if (normProvider.includes('correo')) {
    return `https://www.correo.com.uy/seguimiento-de-envios`;
  }
  return null;
}

export interface VendorOrderItem {
  product_name: string;
  quantity: number;
}

export interface VendorOrderPaidTemplateData {
  orderNumber: string;
  orderId: string;
  vendorTotal: number;
  items: VendorOrderItem[];
}

export interface AdminOwnOrderPaidTemplateData {
  orderNumber: string;
  orderId: string;
  collectiblesTotal: number;
  items: VendorOrderItem[];
  saleTypeLabel?: string;
}

export interface OrderCancelledTemplateData {
  orderNumber: string;
  orderId: string;
  isVendor?: boolean;
  isCustomer?: boolean;
  reason?: string;
}

export interface DailySummaryVendorRow {
  storeName: string;
  orderCount: number;
  totalAmount: number;
}

export interface AdminDailySummaryTemplateData {
  dateStr: string; // DD/MM/YYYY
  vendorRows: DailySummaryVendorRow[];
  marketplaceTotal: number;
  orderCount: number;
  vendorCount: number;
  commissionTotal: number;
}

function wrapCollectiblesEmail(title: string, badgeText: string, badgeColor: string, contentHtml: string, ctaLabel?: string, ctaUrl?: string): string {
  const ctaBlock = ctaLabel && ctaUrl ? `
    <div style="text-align: center; margin-top: 28px; margin-bottom: 12px;">
      <a href="${ctaUrl}" style="background-color: #f00856; color: #ffffff; padding: 12px 26px; text-decoration: none; border-radius: 8px; font-weight: 700; display: inline-block; font-size: 14px; letter-spacing: 0.3px;">${ctaLabel}</a>
    </div>
  ` : '';

  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
  <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f3f4f6; padding-bottom: 16px; margin-bottom: 20px;">
    <div>
      <span style="font-size: 18px; font-weight: 900; color: #111827; letter-spacing: -0.5px;">COLLECTIBLES<span style="color: #f00856;">.UY</span></span>
    </div>
    <span style="background-color: ${badgeColor}; color: #ffffff; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">${badgeText}</span>
  </div>
  <h2 style="color: #111827; margin-top: 0; margin-bottom: 12px; font-size: 20px; font-weight: 800;">${title}</h2>
  <div style="font-size: 15px; line-height: 1.6; color: #374151;">
    ${contentHtml}
  </div>
  ${ctaBlock}
  <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #6b7280; text-align: center;">
    <p style="margin: 0 0 4px 0;">Collectibles Marketplace · Vázquez 1418, Montevideo, Uruguay</p>
    <p style="margin: 0;">Si necesitás asistencia, respondé a este correo o visitá <a href="https://collectibles.uy/contact" style="color: #f00856; text-decoration: none;">Soporte</a>.</p>
  </div>
</div>
  `.trim();
}

export const notificationTemplates = {
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. CUSTOMER TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════
  customer_order_created: (data: { orderNumber: string; orderId: string; totalAmount: number; currency?: string }) => {
    const formattedTotal = formatCurrencyUYU(data.totalAmount, data.currency || 'UYU');
    const deepLink = `https://collectibles.uy/account?tab=orders&order_id=${data.orderId}`;
    return {
      inApp: {
        title: `Pedido ${data.orderNumber} creado`,
        body: `Tu pedido por ${formattedTotal} fue registrado y aguarda confirmación de pago.`,
        category: 'purchases',
        severity: 'info',
      },
      push: {
        title: `🧾 Pedido ${data.orderNumber} registrado`,
        body: `Tu pedido por ${formattedTotal} está pendiente de confirmación de pago.`,
      },
      email: {
        subject: `🧾 Recibimos tu pedido ${data.orderNumber} — Pendiente de pago`,
        text: `Recibimos tu pedido ${data.orderNumber} por ${formattedTotal}. Una vez confirmado el pago, comenzaremos a prepararlo. Ver estado: ${deepLink}`,
        html: wrapCollectiblesEmail(
          `Recibimos tu pedido ${data.orderNumber}`,
          'Pendiente de Pago',
          '#d97706',
          `<p>Tu pedido fue registrado correctamente por un total de <strong>${formattedTotal}</strong>.</p>
           <p>En cuanto la pasarela confirme la acreditación del pago, te enviaremos el comprobante definitivo y comenzaremos la preparación.</p>`,
          'Ver mi pedido',
          deepLink
        ),
      },
      deepLink,
    };
  },

  customer_payment_pending: (data: { orderNumber: string; orderId: string; totalAmount: number; currency?: string; paymentMethod?: string }) => {
    const formattedTotal = formatCurrencyUYU(data.totalAmount, data.currency || 'UYU');
    const deepLink = `https://collectibles.uy/account?tab=orders&order_id=${data.orderId}`;
    return {
      inApp: {
        title: `Pago en proceso — Pedido ${data.orderNumber}`,
        body: `Tu pago por ${formattedTotal} (${data.paymentMethod || 'pasarela'}) se encuentra pendiente de acreditación.`,
        category: 'payments',
        severity: 'warning',
      },
      push: {
        title: `⏳ Pago pendiente de acreditación ${data.orderNumber}`,
        body: `Estamos aguardando la confirmación de tu pago por ${formattedTotal}.`,
      },
      email: {
        subject: `⏳ Pago pendiente de acreditación — Pedido ${data.orderNumber}`,
        text: `Tu pago para el pedido ${data.orderNumber} por ${formattedTotal} está pendiente de acreditación. Te avisaremos apenas se confirme. Ver pedido: ${deepLink}`,
        html: wrapCollectiblesEmail(
          `Pago pendiente de acreditación`,
          'En Proceso',
          '#d97706',
          `<p>Registramos tu intento de pago para el pedido <strong>${data.orderNumber}</strong> por <strong>${formattedTotal}</strong>.</p>
           <p>Actualmente el pago se encuentra <strong>pendiente de acreditación</strong> por parte de la entidad financiera o red de cobranza (${(data.paymentMethod || 'Pasarela').toUpperCase()}).</p>
           <p>Te notificaremos por este medio en cuanto quede confirmado.</p>`,
          'Consultar estado del pedido',
          deepLink
        ),
      },
      deepLink,
    };
  },

  customer_order_paid: (data: {
    orderNumber: string;
    orderId: string;
    totalAmount: number;
    currency?: string;
    displayTotal?: number | null;
    displayCurrency?: string | null;
    fxRate?: number | null;
    isArgentina?: boolean;
    items?: VendorOrderItem[];
  }) => {
    const deepLink = `https://collectibles.uy/account?tab=orders&order_id=${data.orderId}`;
    const displayAmount = data.isArgentina && data.displayTotal
      ? `${data.displayCurrency || 'ARS'} ${Number(data.displayTotal).toLocaleString('es-AR')}`
      : formatCurrencyUYU(data.totalAmount, data.currency || 'UYU');

    const itemsHtml = (data.items && data.items.length > 0)
      ? `<div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; margin: 16px 0;">
           <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 700;">Productos confirmados</p>
           <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #111827;">
             ${data.items.map(i => `<li>${i.product_name} &times; ${i.quantity}</li>`).join('')}
           </ul>
         </div>`
      : '';

    const handyNotice = data.isArgentina ? `
      <div style="margin-top: 15px; padding: 12px; background: #eef2ff; border-left: 4px solid #4f46e5; border-radius: 4px;">
        <p style="margin: 0; font-size: 13px; color: #3730a3;"><strong>💳 Cobro en tarjeta de crédito/débito:</strong></p>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #4338ca;">Tu pago fue procesado en dólares estadounidenses por un importe de <strong>USD ${data.totalAmount}</strong> (Tipo de cambio: 1 USD = ARS ${data.fxRate || 1140}).</p>
      </div>
    ` : '';

    return {
      inApp: {
        title: `¡Pago confirmado! Pedido ${data.orderNumber}`,
        body: `Tu pago por ${displayAmount} fue aprobado. Ya estamos preparando tu pedido.`,
        category: 'payments',
        severity: 'success',
      },
      push: {
        title: `✅ ¡Pago confirmado! Pedido ${data.orderNumber}`,
        body: `Aprobamos tu pago por ${displayAmount}. Ya comenzamos a preparar tu compra.`,
      },
      email: {
        subject: `✅ ¡Confirmación de tu Orden ${data.orderNumber}!`,
        text: `¡Gracias por tu compra en Collectibles.uy! Recibimos el pago de tu orden ${data.orderNumber} por ${displayAmount} y ya comenzamos a prepararla. Ver pedido: ${deepLink}`,
        html: wrapCollectiblesEmail(
          `¡Gracias por tu compra en Collectibles.uy!`,
          'Pago Aprobado',
          '#059669',
          `<p>Hemos confirmado el pago de tu orden <strong>${data.orderNumber}</strong> y ya comenzamos a prepararla para su envío.</p>
           <p><strong>Total de la compra:</strong> ${displayAmount}<br/>
           <strong>Estado del Pago:</strong> Aprobado ✅</p>
           ${itemsHtml}
           ${handyNotice}
           <p style="font-size: 13px; color: #4b5563;">Te enviaremos el código de rastreo apenas tu paquete sea despachado.</p>`,
          'Seguir mi pedido',
          deepLink
        ),
      },
      deepLink,
    };
  },

  customer_payment_rejected: (data: { orderNumber: string; orderId: string; totalAmount: number; currency?: string }) => {
    const formattedTotal = formatCurrencyUYU(data.totalAmount, data.currency || 'UYU');
    const deepLink = `https://collectibles.uy/account?tab=orders&order_id=${data.orderId}`;
    return {
      inApp: {
        title: `Pago rechazado — Pedido ${data.orderNumber}`,
        body: `El pago por ${formattedTotal} no pudo ser procesado. Podés reintentar desde tu cuenta.`,
        category: 'payments',
        severity: 'error',
      },
      push: {
        title: `❌ Pago no aprobado — Pedido ${data.orderNumber}`,
        body: `Tu pago por ${formattedTotal} fue rechazado por el procesador. Podés reintentar el pago.`,
      },
      email: {
        subject: `❌ Pago no aprobado — Pedido ${data.orderNumber}`,
        text: `El pago de tu pedido ${data.orderNumber} por ${formattedTotal} fue rechazado o cancelado por la pasarela. Podés revisar tu pedido o reintentar desde tu cuenta: ${deepLink}`,
        html: wrapCollectiblesEmail(
          `El pago de tu pedido ${data.orderNumber} no pudo completarse`,
          'Pago Rechazado',
          '#dc2626',
          `<p>Te informamos que el procesador de pagos rechazó la transacción correspondiente al pedido <strong>${data.orderNumber}</strong> (${formattedTotal}).</p>
           <p>No se ha realizado ningún cargo definitivo. Podés ingresar a tu portal de cliente para verificar el estado o intentar con otro medio de pago.</p>`,
          'Revisar mi pedido',
          deepLink
        ),
      },
      deepLink,
    };
  },

  customer_order_preparing: (data: { orderNumber: string; orderId: string; suborderNumber?: string; isPrepared?: boolean; items?: VendorOrderItem[] }) => {
    const deepLink = `https://collectibles.uy/account?tab=orders&order_id=${data.orderId}`;
    const stageTitle = data.isPrepared ? `Pedido listo para despacho` : `Tu pedido está en preparación`;
    const stageBadge = data.isPrepared ? 'Preparado' : 'En Preparación';
    const subLabel = data.suborderNumber ? ` (Envío ${data.suborderNumber})` : '';
    const itemsHtml = (data.items && data.items.length > 0)
      ? `<ul style="margin: 12px 0; padding-left: 18px; font-size: 14px;">${data.items.map(i => `<li>${i.product_name} &times; ${i.quantity}</li>`).join('')}</ul>`
      : '';

    return {
      inApp: {
        title: `${stageTitle} — ${data.orderNumber}${subLabel}`,
        body: data.isPrepared
          ? `Tu paquete del pedido ${data.orderNumber}${subLabel} ya está embalado y listo para ser entregado al transportista.`
          : `Estamos preparando los productos de tu pedido ${data.orderNumber}${subLabel}.`,
        category: 'shipments',
        severity: 'info',
      },
      push: {
        title: `📦 ${stageTitle} ${data.orderNumber}`,
        body: data.isPrepared
          ? `Tu paquete${subLabel} está embalado y pronto para despachar.`
          : `Comenzamos a preparar tu pedido ${data.orderNumber}${subLabel}.`,
      },
      email: {
        subject: `📦 ${stageTitle} — Pedido ${data.orderNumber}`,
        text: `${stageTitle} (${data.orderNumber}${subLabel}). Ver estado: ${deepLink}`,
        html: wrapCollectiblesEmail(
          stageTitle,
          stageBadge,
          '#4f46e5',
          `<p>Tu pedido <strong>${data.orderNumber}</strong>${subLabel} ${data.isPrepared ? 'ya fue preparado y empaquetado. En breve será entregado al transportista y recibirás el número de guía.' : 'se encuentra actualmente en proceso de preparación y control de calidad.'}</p>
           ${itemsHtml}`,
          'Ver detalle del pedido',
          deepLink
        ),
      },
      deepLink,
    };
  },

  customer_order_shipped: (data: {
    orderNumber: string;
    orderId: string;
    suborderNumber?: string | null;
    isPartialShipment?: boolean;
    carrier?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    dispatchedAt?: string | null;
    items?: VendorOrderItem[];
  }) => {
    const deepLink = `https://collectibles.uy/account?tab=orders&order_id=${data.orderId}`;
    const validTrackingUrl = resolveValidTrackingUrl(data.carrier, data.trackingNumber, data.trackingUrl);
    const carrierName = (data.carrier || 'Logística Oficial').toUpperCase();
    const dateFormatted = data.dispatchedAt
      ? new Date(data.dispatchedAt).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const scopeNotice = data.isPartialShipment && data.suborderNumber
      ? `<p style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 10px 12px; font-size: 13px; color: #1e40af;"><strong>Envío por suborden (${data.suborderNumber}):</strong> Este despacho corresponde a los productos listados a continuación de tu pedido.</p>`
      : '';

    const itemsHtml = (data.items && data.items.length > 0)
      ? `<div style="margin: 16px 0;">
           <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 700;">Productos en este envío</p>
           <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #111827;">
             ${data.items.map(i => `<li>${i.product_name} &times; ${i.quantity}</li>`).join('')}
           </ul>
         </div>`
      : '';

    const trackingBlockHtml = `
      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 6px 0; font-size: 13px;"><strong>Transportista:</strong> ${carrierName}</p>
        ${data.trackingNumber ? `<p style="margin: 0 0 6px 0; font-size: 15px;"><strong>Número de seguimiento:</strong> <code style="background: #e5e7eb; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${data.trackingNumber}</code></p>` : ''}
        <p style="margin: 0 0 6px 0; font-size: 13px;"><strong>Estado:</strong> Despachado / En tránsito</p>
        <p style="margin: 0; font-size: 13px;"><strong>Fecha de despacho:</strong> ${dateFormatted}</p>
        ${validTrackingUrl ? `<div style="margin-top: 12px;"><a href="${validTrackingUrl}" style="color: #4f46e5; font-weight: 700; font-size: 13px; text-decoration: underline;">Rastrear envío en ${carrierName} &rarr;</a></div>` : ''}
      </div>
    `;

    return {
      inApp: {
        title: `🚚 Pedido despachado — ${data.orderNumber}${data.suborderNumber ? ` (${data.suborderNumber})` : ''}`,
        body: `Enviado vía ${carrierName}${data.trackingNumber ? ` · Guía: ${data.trackingNumber}` : ''}.`,
        category: 'shipments',
        severity: 'info',
      },
      push: {
        title: `🚚 ¡Tu pedido ${data.orderNumber} está en camino!`,
        body: `Despachado por ${carrierName}${data.trackingNumber ? `. Guía: ${data.trackingNumber}` : ''}.`,
      },
      email: {
        subject: `🚚 ¡Tu pedido ${data.orderNumber} fue despachado!${data.trackingNumber ? ` (Guía ${data.trackingNumber})` : ''}`,
        text: `Tu pedido ${data.orderNumber} ya fue despachado por ${carrierName}.${data.trackingNumber ? ` Número de seguimiento: ${data.trackingNumber}.` : ''}${validTrackingUrl ? ` Seguimiento: ${validTrackingUrl}` : ''} Ver pedido: ${deepLink}`,
        html: wrapCollectiblesEmail(
          `¡Tu pedido ${data.orderNumber} va en camino!`,
          'Despachado',
          '#2563eb',
          `<p>Tenemos excelentes noticias: tu envío correspondiente al pedido <strong>${data.orderNumber}</strong> ya fue entregado al transportista.</p>
           ${scopeNotice}
           ${trackingBlockHtml}
           ${itemsHtml}`,
          validTrackingUrl ? 'Seguir envío en línea' : 'Ver mi pedido',
          validTrackingUrl || deepLink
        ),
      },
      deepLink: validTrackingUrl || deepLink,
    };
  },

  customer_order_delivered: (data: { orderNumber: string; orderId: string; suborderNumber?: string | null; items?: VendorOrderItem[] }) => {
    const deepLink = `https://collectibles.uy/account?tab=orders&order_id=${data.orderId}`;
    const subLabel = data.suborderNumber ? ` (Envío ${data.suborderNumber})` : '';
    return {
      inApp: {
        title: `🎉 Pedido entregado — ${data.orderNumber}${subLabel}`,
        body: `Confirmamos la entrega de tu envío correspondiente al pedido ${data.orderNumber}. ¡Que lo disfrutes!`,
        category: 'deliveries',
        severity: 'success',
      },
      push: {
        title: `🎉 ¡Pedido ${data.orderNumber} entregado!`,
        body: `Tu compra${subLabel} fue marcada como entregada. ¡Gracias por elegir Collectibles!`,
      },
      email: {
        subject: `🎉 ¡Tu pedido ${data.orderNumber} fue entregado!`,
        text: `Tu pedido ${data.orderNumber}${subLabel} ha sido entregado. ¡Esperamos que disfrutes tu coleccionable! Ver detalle: ${deepLink}`,
        html: wrapCollectiblesEmail(
          `¡Tu pedido ${data.orderNumber} fue entregado!`,
          'Entregado',
          '#059669',
          `<p>El transportista confirmó la entrega de tu envío correspondiente al pedido <strong>${data.orderNumber}</strong>${subLabel}.</p>
           <p>¡Esperamos que disfrutes tus nuevos coleccionables! Podés consultar tu comprobante e historial desde tu cuenta.</p>`,
          'Ver mi compra',
          deepLink
        ),
      },
      deepLink,
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. VENDOR & ADMIN ORDER TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════
  vendor_order_paid: (data: VendorOrderPaidTemplateData) => {
    const formattedTotal = formatCurrencyUYU(data.vendorTotal);
    const deepLink = `https://collectibles.uy/vendor?tab=orders&order_id=${data.orderId}`;
    
    const itemsListHtml = data.items
      .map(item => `<li>${item.product_name} &times; ${item.quantity}</li>`)
      .join('\n');
    
    const itemsListText = data.items
      .map(item => `- ${item.product_name} × ${item.quantity}`)
      .join('\n');

    return {
      inApp: {
        title: `🛒 Nueva venta pagada — ${data.orderNumber}`,
        body: `Tus productos suman ${formattedTotal}. Ya podés preparar el pedido para despacho.`,
        category: 'sales',
        severity: 'success',
      },
      push: {
        title: `🛒 Nueva venta — Pedido pago, preparar envío`,
        body: `El pedido ${data.orderNumber} ya fue pagado. Total de tus productos: ${formattedTotal}. Prepará el pedido para despacho.`,
      },
      email: {
        subject: `🛒 Nueva venta — Pedido pago, preparar envío ${data.orderNumber}`,
        text: `¡Tenés una nueva venta!\n\nEl pago del pedido ${data.orderNumber} fue aprobado.\nYa podés preparar el pedido para despacho.\n\nPedido:\n${data.orderNumber}\n\nTotal de tus productos:\n${formattedTotal}\n\nProductos:\n${itemsListText}\n\nVer pedido: ${deepLink}`,
        html: wrapCollectiblesEmail(
          `¡Tenés una nueva venta confirmada!`,
          'Pago Aprobado',
          '#059669',
          `<p>El pago del pedido <strong>${data.orderNumber}</strong> fue aprobado y verificado.<br/>Ya podés preparar la mercadería para su despacho.</p>
           <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
             <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 700;">Subtotal de tus productos</p>
             <p style="margin: 0 0 14px 0; font-size: 22px; font-weight: 800; color: #059669;">${formattedTotal}</p>
             <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 700;">Productos vendidos</p>
             <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #111827;">${itemsListHtml}</ul>
           </div>`,
          'Gestionar despacho',
          deepLink
        ),
      },
      deepLink,
    };
  },

  admin_own_order_paid: (data: AdminOwnOrderPaidTemplateData) => {
    const formattedTotal = formatCurrencyUYU(data.collectiblesTotal);
    const deepLink = `https://collectibles.uy/admin/orders?order_id=${data.orderId}`;
    const label = data.saleTypeLabel || 'Collectibles';
    
    const itemsListHtml = data.items
      .map(item => `<li>${item.product_name} &times; ${item.quantity}</li>`)
      .join('\n');
    
    const itemsListText = data.items
      .map(item => `- ${item.product_name} × ${item.quantity}`)
      .join('\n');

    return {
      inApp: {
        title: `🎉 Venta confirmada (${label}) — ${data.orderNumber}`,
        body: `Pedido ${data.orderNumber} pagado por ${formattedTotal} (${data.items.length} ítem(s)).`,
        category: 'sales',
        severity: 'success',
      },
      push: {
        title: `🎉 Nueva venta ${label} — ${data.orderNumber}`,
        body: `El pedido ${data.orderNumber} ya fue pagado. Total: ${formattedTotal}.`,
      },
      email: {
        subject: `🎉 Nueva venta ${label} — Pedido pago ${data.orderNumber}`,
        text: `Se confirmó una nueva venta (${label}).\n\nPedido ${data.orderNumber} aprobado.\nTotal: ${formattedTotal}\n\nProductos:\n${itemsListText}\n\nVer pedido: ${deepLink}`,
        html: wrapCollectiblesEmail(
          `Nueva venta confirmada — ${label}`,
          'Venta Pagada',
          '#059669',
          `<p>El pago del pedido <strong>${data.orderNumber}</strong> fue aprobado y consolidado.</p>
           <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
             <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 700;">Importe</p>
             <p style="margin: 0 0 14px 0; font-size: 22px; font-weight: 800; color: #059669;">${formattedTotal}</p>
             <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 700;">Productos</p>
             <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #111827;">${itemsListHtml}</ul>
           </div>`,
          'Ver en Admin Orders',
          deepLink
        ),
      },
      deepLink,
    };
  },

  order_cancelled: (data: OrderCancelledTemplateData) => {
    if (data.isCustomer) {
      const deepLink = `https://collectibles.uy/account?tab=orders&order_id=${data.orderId}`;
      const reasonText = data.reason || 'Cancelación procesada y reembolso en curso';
      return {
        inApp: {
          title: `⛔ Pedido ${data.orderNumber} cancelado`,
          body: `Tu pedido fue cancelado. Motivo: ${reasonText}.`,
          category: 'returns',
          severity: 'warning',
        },
        push: {
          title: `⛔ Pedido ${data.orderNumber} cancelado`,
          body: `Tu orden fue cancelada. Si habías abonado, el reembolso fue iniciado.`,
        },
        email: {
          subject: `⛔ Tu pedido ${data.orderNumber} ha sido cancelado`,
          text: `Te informamos que tu pedido ${data.orderNumber} ha sido cancelado. Motivo: ${reasonText}. Ver estado: ${deepLink}`,
          html: wrapCollectiblesEmail(
            `Pedido ${data.orderNumber} cancelado`,
            'Cancelado',
            '#dc2626',
            `<p>Te informamos que tu pedido <strong>${data.orderNumber}</strong> ha sido cancelado y el reembolso correspondiente fue procesado hacia tu medio de pago original.</p>
             <p><strong>Motivo:</strong> ${reasonText}</p>`,
            'Ver detalle en mi cuenta',
            deepLink
          ),
        },
        deepLink,
      };
    }

    const isVendor = data.isVendor ?? true;
    const deepLink = isVendor 
      ? `https://collectibles.uy/vendor?tab=orders&order_id=${data.orderId}`
      : `https://collectibles.uy/admin/orders?order_id=${data.orderId}`;

    if (isVendor) {
      return {
        inApp: {
          title: `❌ Venta cancelada — ${data.orderNumber}`,
          body: `El pedido ${data.orderNumber} fue cancelado. No prepares ni despaches esta suborden.`,
          category: 'sales',
          severity: 'error',
        },
        push: {
          title: `❌ Pedido cancelado`,
          body: `El pedido ${data.orderNumber} fue cancelado. No prepares el despacho.`,
        },
        email: {
          subject: `❌ Pedido cancelado ${data.orderNumber}`,
          text: `El pedido ${data.orderNumber} fue cancelado o reembolsado.\nNo prepares ni despaches los productos de este pedido.\n\nVer pedido: ${deepLink}`,
          html: wrapCollectiblesEmail(
            `❌ Pedido cancelado ${data.orderNumber}`,
            'No Despachar',
            '#dc2626',
            `<p>El pedido <strong>${data.orderNumber}</strong> fue cancelado o reembolsado.</p>
             <p><strong>Importante: No prepares ni despaches los productos de este pedido.</strong></p>`,
            'Ver suborden',
            deepLink
          ),
        },
        deepLink,
      };
    } else {
      return {
        inApp: {
          title: `❌ Pedido pagado cancelado — ${data.orderNumber}`,
          body: `Se canceló el pedido ${data.orderNumber}.`,
          category: 'sales',
          severity: 'warning',
        },
        push: {
          title: `❌ Venta cancelada`,
          body: `Se canceló el pedido ${data.orderNumber}.`,
        },
        email: {
          subject: `❌ Venta cancelada ${data.orderNumber}`,
          text: `Se canceló o reembolsó el pedido ${data.orderNumber}.\n\nVer pedido: ${deepLink}`,
          html: wrapCollectiblesEmail(
            `Venta cancelada — ${data.orderNumber}`,
            'Cancelada',
            '#dc2626',
            `<p>Se registró la cancelación comercial del pedido <strong>${data.orderNumber}</strong>.</p>`,
            'Ver pedido en Admin',
            deepLink
          ),
        },
        deepLink,
      };
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. RETURNS, CLAIMS, REFUNDS & DISPUTES TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════
  return_or_claim_event: (data: {
    orderNumber: string;
    orderId: string;
    requestType: string;
    status: string;
    reason?: string;
    amount?: number;
    recipientRole: 'customer' | 'vendor' | 'admin';
  }) => {
    const isApproved = ['APPROVED', 'REFUNDED', 'CANCELLATION_CONFIRMED'].includes(data.status);
    const isRejected = ['REJECTED', 'DENIED', 'REFUND_FAILED'].includes(data.status);
    const formattedAmt = data.amount ? formatCurrencyUYU(data.amount) : '';

    const deepLink = data.recipientRole === 'customer'
      ? `https://collectibles.uy/account?tab=requests`
      : data.recipientRole === 'vendor'
      ? `https://collectibles.uy/vendor?tab=orders&order_id=${data.orderId}`
      : `https://collectibles.uy/admin/refunds`;

    let title = `Solicitud sobre pedido ${data.orderNumber}`;
    let badge = 'En Revisión';
    let color = '#d97706';
    let severity: 'info' | 'success' | 'warning' | 'error' | 'priority' = 'warning';

    if (isApproved) {
      title = `Resolución aprobada — Pedido ${data.orderNumber}`;
      badge = 'Aprobada';
      color = '#059669';
      severity = 'success';
    } else if (isRejected) {
      title = `Actualización de solicitud — Pedido ${data.orderNumber}`;
      badge = 'Rechazada';
      color = '#dc2626';
      severity = 'error';
    } else if (data.recipientRole !== 'customer') {
      title = `Nueva solicitud posventa — Pedido ${data.orderNumber}`;
      badge = 'Acción Requerida';
      color = '#ea580c';
      severity = 'priority';
    }

    const bodyText = `Pedido ${data.orderNumber} · Estado: ${data.status}${formattedAmt ? ` · Monto: ${formattedAmt}` : ''}${data.reason ? ` · Motivo: ${data.reason}` : ''}`;

    return {
      inApp: {
        title,
        body: bodyText,
        category: data.requestType?.includes('claim') ? 'claims' : 'returns',
        severity,
      },
      push: {
        title: `📋 ${title}`,
        body: bodyText,
      },
      email: {
        subject: `📋 ${title}`,
        text: `${title}\n${bodyText}\nVer detalle: ${deepLink}`,
        html: wrapCollectiblesEmail(
          title,
          badge,
          color,
          `<p>Se ha registrado una actualización en la gestión posventa asociada al pedido <strong>${data.orderNumber}</strong>.</p>
           <ul>
             <li><strong>Tipo de gestión:</strong> ${data.requestType}</li>
             <li><strong>Estado actual:</strong> ${data.status}</li>
             ${formattedAmt ? `<li><strong>Importe:</strong> ${formattedAmt}</li>` : ''}
             ${data.reason ? `<li><strong>Detalle / Motivo:</strong> ${data.reason}</li>` : ''}
           </ul>`,
          'Ver gestión',
          deepLink
        ),
      },
      deepLink,
    };
  },

  refund_processed: (data: {
    orderNumber: string;
    orderId: string;
    amount: number;
    currency?: string;
    reason?: string;
    status: 'requested' | 'completed' | 'rejected' | 'manual_required' | 'failed';
    recipientRole: 'customer' | 'vendor' | 'admin';
    storeName?: string;
    provider?: string;
  }) => {
    const formattedAmt = formatCurrencyUYU(data.amount, data.currency || 'UYU');
    const deepLink = data.recipientRole === 'customer'
      ? `https://collectibles.uy/account?tab=orders&order_id=${data.orderId}`
      : data.recipientRole === 'vendor'
      ? `https://collectibles.uy/vendor?tab=finances`
      : `https://collectibles.uy/admin/refunds`;

    if (data.status === 'completed') {
      const title = data.recipientRole === 'vendor'
        ? `Reembolso aplicado en suborden — ${data.orderNumber}`
        : `Reembolso completado — Pedido ${data.orderNumber}`;
      return {
        inApp: {
          title,
          body: `Se procesó el reembolso por ${formattedAmt} para el pedido ${data.orderNumber}.`,
          category: 'returns',
          severity: data.recipientRole === 'customer' ? 'success' : 'info',
        },
        push: {
          title: `✅ ${title}`,
          body: `Importe reembolsado: ${formattedAmt} (${data.orderNumber}).`,
        },
        email: {
          subject: `✅ ${title}`,
          text: `${title} por ${formattedAmt}. Ver detalle: ${deepLink}`,
          html: wrapCollectiblesEmail(
            title,
            'Reembolsado',
            '#059669',
            data.recipientRole === 'customer'
              ? `<p>Te confirmamos que el reembolso de tu pedido <strong>${data.orderNumber}</strong> por un monto de <strong>${formattedAmt}</strong> fue procesado con éxito hacia tu medio de pago original.</p>`
              : `<p>Se ha procesado un reembolso por <strong>${formattedAmt}</strong> vinculado al pedido <strong>${data.orderNumber}</strong>. Las liquidaciones y comisiones fueron ajustadas proporcionalmente.</p>`,
            'Ver detalle',
            deepLink
          ),
        },
        deepLink,
      };
    }

    if (data.status === 'manual_required' || data.status === 'failed') {
      const isFailed = data.status === 'failed';
      const title = isFailed
        ? `[URGENTE] Falló reembolso automático — ${data.orderNumber}`
        : `[ACCIÓN REQUERIDA] Reembolso manual pendiente — ${data.orderNumber}`;
      return {
        inApp: {
          title,
          body: `Pasarela: ${data.provider || 'N/A'} · Monto: ${formattedAmt} · ${data.reason || ''}`,
          category: 'alerts',
          severity: 'priority',
        },
        push: {
          title: `🚨 ${title}`,
          body: `Pedido ${data.orderNumber} (${formattedAmt}) requiere intervención en ${data.provider || 'pasarela'}.`,
        },
        email: {
          subject: `🚨 ${title}`,
          text: `${title}. Monto: ${formattedAmt}. Pasarela: ${data.provider}. Detalle: ${data.reason}. Link: ${deepLink}`,
          html: wrapCollectiblesEmail(
            title,
            'Prioritario',
            '#dc2626',
            `<p>Se requiere intervención administrativa sobre el reembolso del pedido <strong>${data.orderNumber}</strong>:</p>
             <ul>
               <li><strong>Importe:</strong> ${formattedAmt}</li>
               <li><strong>Pasarela:</strong> ${data.provider || 'N/A'}</li>
               <li><strong>Detalle:</strong> ${data.reason || 'N/A'}</li>
             </ul>`,
            'Ir a Reembolsos',
            deepLink
          ),
        },
        deepLink,
      };
    }

    // Requested or Rejected
    const isRej = data.status === 'rejected';
    const title = isRej
      ? `Solicitud de reembolso rechazada — ${data.orderNumber}`
      : `Reembolso en proceso — Pedido ${data.orderNumber}`;
    return {
      inApp: {
        title,
        body: isRej
          ? `Tu solicitud de reembolso para ${data.orderNumber} fue rechazada. Motivo: ${data.reason || 'Políticas comerciales'}.`
          : `Iniciamos la gestión de reembolso por ${formattedAmt} para tu pedido ${data.orderNumber}.`,
        category: 'returns',
        severity: isRej ? 'error' : 'info',
      },
      push: {
        title: `${isRej ? '❌' : '⏳'} ${title}`,
        body: isRej ? `Motivo: ${data.reason || 'Políticas del marketplace'}` : `Monto en gestión: ${formattedAmt}`,
      },
      email: {
        subject: `${isRej ? '❌' : '⏳'} ${title}`,
        text: `${title}. ${data.reason || ''}. Ver en cuenta: ${deepLink}`,
        html: wrapCollectiblesEmail(
          title,
          isRej ? 'Rechazado' : 'En Proceso',
          isRej ? '#dc2626' : '#d97706',
          `<p>${isRej
            ? `Tu solicitud de reembolso para el pedido <strong>${data.orderNumber}</strong> no fue aprobada.<br/><strong>Motivo:</strong> ${data.reason || 'Políticas de devolución'}.`
            : `Hemos iniciado el procesamiento del reembolso para tu pedido <strong>${data.orderNumber}</strong> por <strong>${formattedAmt}</strong>.`}</p>`,
          'Ver mi cuenta',
          deepLink
        ),
      },
      deepLink,
    };
  },

  dispute_or_chargeback: (data: {
    orderNumber: string;
    orderId: string;
    amount: number;
    reason?: string;
    provider?: string;
    recipientRole: 'customer' | 'vendor' | 'admin';
    storeName?: string;
  }) => {
    const formattedAmt = formatCurrencyUYU(data.amount);
    const deepLink = data.recipientRole === 'customer'
      ? `https://collectibles.uy/account?tab=orders&order_id=${data.orderId}`
      : data.recipientRole === 'vendor'
      ? `https://collectibles.uy/vendor?tab=finances`
      : `https://collectibles.uy/admin/refunds`;

    const title = data.recipientRole === 'admin'
      ? `🚨 Contracargo / Disputa recibida — ${data.orderNumber}`
      : data.recipientRole === 'vendor'
      ? `⚠️ Alerta de contracargo en pedido ${data.orderNumber}`
      : `⚠️ Disputa de pago registrada — Pedido ${data.orderNumber}`;

    return {
      inApp: {
        title,
        body: `Disputa en pasarela por ${formattedAmt} en el pedido ${data.orderNumber}. Motivo: ${data.reason || 'En revisión'}.`,
        category: 'claims',
        severity: 'priority',
      },
      push: {
        title,
        body: `Pedido ${data.orderNumber} (${formattedAmt}). Revisá los detalles en tu panel.`,
      },
      email: {
        subject: title,
        text: `${title} por ${formattedAmt}. Motivo: ${data.reason || 'No especificado'}. Ver panel: ${deepLink}`,
        html: wrapCollectiblesEmail(
          title,
          'Disputa Activa',
          '#dc2626',
          `<p>Se ha registrado un reporte de disputa o contracargo bancario asociado al pedido <strong>${data.orderNumber}</strong> por un monto de <strong>${formattedAmt}</strong>.</p>
           <p><strong>Motivo reportado:</strong> ${data.reason || 'Revisión de pasarela'}</p>
           ${data.recipientRole !== 'customer' ? `<p>⚠️ <strong>Retención preventiva:</strong> Los fondos asociados a esta operación permanecen retenidos hasta la resolución de la disputa.</p>` : ''}`,
          'Ver detalles',
          deepLink
        ),
      },
      deepLink,
    };
  },

  vendor_financial_adjustment: (data: { storeName: string; orderNumber: string; amount: number; typeAdj: string; reason?: string }) => {
    const formattedAmt = formatCurrencyUYU(data.amount);
    const deepLink = `https://collectibles.uy/vendor?tab=finances`;
    return {
      inApp: {
        title: `Ajuste financiero registrado (${data.typeAdj})`,
        body: `Pedido ${data.orderNumber} · Monto: ${formattedAmt} · ${data.reason || 'Ajuste de liquidación'}.`,
        category: 'payouts',
        severity: 'warning',
      },
      push: {
        title: `⚖️ Ajuste financiero registrado`,
        body: `Se registró un ajuste de ${formattedAmt} (${data.orderNumber}).`,
      },
      email: {
        subject: `⚖️ Nuevo ajuste financiero registrado — Collectibles`,
        text: `Estimado ${data.storeName}, se registró un ajuste financiero (${data.typeAdj}) por ${formattedAmt} en referencia al pedido ${data.orderNumber}. Razón: ${data.reason || 'Ajuste post-liquidación'}. Ver finanzas: ${deepLink}`,
        html: wrapCollectiblesEmail(
          `Ajuste Financiero Registrado`,
          'Finanzas Vendor',
          '#d97706',
          `<p>Estimado <strong>${data.storeName}</strong>,</p>
           <p>Se ha registrado un ajuste financiero en tu cuenta de vendedor:</p>
           <ul>
             <li><strong>Pedido / Referencia:</strong> ${data.orderNumber}</li>
             <li><strong>Tipo:</strong> ${data.typeAdj}</li>
             <li><strong>Importe:</strong> ${formattedAmt}</li>
             <li><strong>Motivo:</strong> ${data.reason || 'Ajuste de reembolso post-liquidación'}</li>
           </ul>
           <p>Este importe se aplicará automáticamente en tu próxima liquidación disponible.</p>`,
          'Ver mis finanzas',
          deepLink
        ),
      },
      deepLink,
    };
  },

  vendor_liquidation_event: (data: { storeName?: string; amount: number; isPaid: boolean; reference?: string }) => {
    const formattedAmt = formatCurrencyUYU(data.amount);
    const deepLink = `https://collectibles.uy/vendor?tab=settlements`;
    const title = data.isPaid
      ? `💸 Liquidación pagada — ${formattedAmt}`
      : `📊 Nueva liquidación disponible — ${formattedAmt}`;

    return {
      inApp: {
        title,
        body: data.isPaid
          ? `Se acreditó el pago de tu liquidación por ${formattedAmt}${data.reference ? ` (Ref: ${data.reference})` : ''}.`
          : `Se generó una nueva liquidación por ${formattedAmt} lista para pago.`,
        category: 'payouts',
        severity: data.isPaid ? 'success' : 'info',
      },
      push: {
        title,
        body: data.isPaid
          ? `Tu liquidación por ${formattedAmt} fue pagada.`
          : `Tenés una nueva liquidación generada por ${formattedAmt}.`,
      },
      email: {
        subject: title,
        text: `${title}. Consultá el detalle en tu panel de vendedor: ${deepLink}`,
        html: wrapCollectiblesEmail(
          title,
          data.isPaid ? 'Pagada' : 'Disponible',
          data.isPaid ? '#059669' : '#4f46e5',
          `<p>${data.isPaid
            ? `Te confirmamos que tu liquidación de ventas por un neto de <strong>${formattedAmt}</strong> ha sido marcada como <strong>pagada</strong>.${data.reference ? `<br/><strong>Referencia de pago:</strong> ${data.reference}` : ''}`
            : `Se ha generado una nueva liquidación de tus ventas entregadas por un monto neto de <strong>${formattedAmt}</strong>.`}</p>`,
          'Ver liquidaciones',
          deepLink
        ),
      },
      deepLink,
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. INFLUENCERS & AFFILIATES TEMPLATES (Strict Privacy: Zero Buyer PII)
  // ═══════════════════════════════════════════════════════════════════════════
  affiliate_event: (data: {
    eventSubType: 'code_used_checkout' | 'sale_paid_commission' | 'commission_approved' | 'commission_paid' | 'commission_adjusted' | 'commission_cancelled' | 'payout_requested' | 'code_deactivated' | 'code_expiring';
    code: string;
    orderReference?: string; // Non-sensitive ref e.g. #COL-1A2B3C4D
    saleDate?: string;
    commissionableAmount?: number;
    commissionAmount?: number;
    commissionRate?: number;
    statusLabel?: string;
    reason?: string;
  }) => {
    const deepLink = `https://collectibles.uy/affiliate?tab=overview`;
    const commFormatted = data.commissionAmount !== undefined ? formatCurrencyUYU(data.commissionAmount) : '';
    const baseFormatted = data.commissionableAmount !== undefined ? formatCurrencyUYU(data.commissionableAmount) : '';
    const dateStr = data.saleDate ? new Date(data.saleDate).toLocaleDateString('es-UY') : new Date().toLocaleDateString('es-UY');

    let title = `Actividad de afiliado — Código ${data.code}`;
    let body = '';
    let badge = 'Afiliados';
    let color = '#f00856';
    let severity: 'info' | 'success' | 'warning' | 'error' = 'info';

    switch (data.eventSubType) {
      case 'code_used_checkout':
        title = `🏷️ Código ${data.code} utilizado en checkout`;
        body = `Un comprador aplicó tu código ${data.code} en el pedido ${data.orderReference || ''} (pendiente de pago). La comisión se confirmará una vez acreditado el pago.`;
        badge = 'Actividad Preliminar';
        color = '#6366f1';
        severity = 'info';
        break;
      case 'sale_paid_commission':
        title = `🎉 ¡Nueva venta confirmada con tu código ${data.code}!`;
        body = `Referencia ${data.orderReference || 'N/A'} · Base comisionable: ${baseFormatted} · Tu comisión (${data.commissionRate || 5}%): ${commFormatted}.`;
        badge = 'Comisión Generada';
        color = '#059669';
        severity = 'success';
        break;
      case 'commission_approved':
        title = `✅ Comisión aprobada — ${commFormatted}`;
        body = `Tu comisión de ${commFormatted} (Ref: ${data.orderReference || 'N/A'}) fue aprobada y está disponible en tu balance.`;
        badge = 'Aprobada';
        color = '#059669';
        severity = 'success';
        break;
      case 'commission_paid':
        title = `💸 Comisión liquidada y pagada — ${commFormatted}`;
        body = `Se procesó el pago de ${commFormatted} a tu cuenta configurada.`;
        badge = 'Pagada';
        color = '#059669';
        severity = 'success';
        break;
      case 'payout_requested':
        title = `⏳ Solicitud de cobro recibida — ${commFormatted}`;
        body = `Registramos tu solicitud de retiro por ${commFormatted}. Administración procesará el pago a la brevedad.`;
        badge = 'En Proceso';
        color = '#d97706';
        severity = 'info';
        break;
      case 'commission_adjusted':
        title = `⚖️ Comisión ajustada — Ref ${data.orderReference || 'N/A'}`;
        body = `Por un reembolso parcial en la orden ${data.orderReference || ''}, tu comisión fue actualizada a ${commFormatted}.`;
        badge = 'Ajuste Proporcional';
        color = '#d97706';
        severity = 'warning';
        break;
      case 'commission_cancelled':
        title = `❌ Comisión anulada por reembolso/cancelación — Ref ${data.orderReference || 'N/A'}`;
        body = `El pedido ${data.orderReference || ''} fue cancelado o reembolsado en su totalidad. La comisión asociada fue revertida.`;
        badge = 'Anulada';
        color = '#dc2626';
        severity = 'error';
        break;
      case 'code_deactivated':
        title = `⚠️ Tu código ${data.code} fue desactivado`;
        body = `El código promocional o perfil de afiliado ${data.code} cambió a estado inactivo.`;
        badge = 'Desactivado';
        color = '#dc2626';
        severity = 'warning';
        break;
      case 'code_expiring':
        title = `⏰ Tu código ${data.code} está próximo a vencer`;
        body = `Recordá que tu código promocional ${data.code} vencerá pronto.`;
        badge = 'Vencimiento';
        color = '#d97706';
        severity = 'warning';
        break;
    }

    const detailsTableHtml = `
      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0; font-size: 14px;">
        <p style="margin: 0 0 6px 0;"><strong>Código utilizado:</strong> <code style="background: #e5e7eb; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${data.code}</code></p>
        <p style="margin: 0 0 6px 0;"><strong>Fecha:</strong> ${dateStr}</p>
        ${data.orderReference ? `<p style="margin: 0 0 6px 0;"><strong>Referencia de operación:</strong> ${data.orderReference}</p>` : ''}
        ${baseFormatted ? `<p style="margin: 0 0 6px 0;"><strong>Importe comisionable:</strong> ${baseFormatted}</p>` : ''}
        ${commFormatted ? `<p style="margin: 0 0 6px 0;"><strong>Comisión:</strong> <strong style="color: #059669;">${commFormatted}</strong> ${data.commissionRate ? `(${data.commissionRate}%)` : ''}</p>` : ''}
        ${data.statusLabel ? `<p style="margin: 0;"><strong>Estado:</strong> ${data.statusLabel}</p>` : ''}
      </div>
    `;

    return {
      inApp: {
        title,
        body,
        category: 'commissions',
        severity,
      },
      push: {
        title,
        body,
      },
      email: {
        subject: title,
        text: `${title}\n${body}\nPanel de Afiliado: ${deepLink}`,
        html: wrapCollectiblesEmail(
          title,
          badge,
          color,
          `<p>${body}</p>${detailsTableHtml}`,
          'Ir a mi Panel de Afiliado',
          deepLink
        ),
      },
      deepLink,
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. DAILY SUMMARY & PRODUCT QUESTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  admin_vendor_daily_summary: (data: AdminDailySummaryTemplateData) => {
    const formattedMarketplaceTotal = formatCurrencyUYU(data.marketplaceTotal);
    const formattedCommissionTotal = formatCurrencyUYU(data.commissionTotal);
    const deepLink = `https://collectibles.uy/admin/marketplace`;

    const rowsHtml = data.vendorRows
      .map(r => `
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${r.storeName}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${r.orderCount} ${r.orderCount === 1 ? 'pedido' : 'pedidos'}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #059669;">${formatCurrencyUYU(r.totalAmount)}</td>
        </tr>
      `)
      .join('\n');

    const rowsText = data.vendorRows
      .map(r => `${r.storeName} — ${r.orderCount} ${r.orderCount === 1 ? 'pedido' : 'pedidos'} — ${formatCurrencyUYU(r.totalAmount)}`)
      .join('\n');

    return {
      inApp: {
        title: `📊 Resumen diario Marketplace (${data.dateStr})`,
        body: `Vendieron ${data.vendorCount} vendors (${data.orderCount} pedidos) por un total de ${formattedMarketplaceTotal}. Comisión: ${formattedCommissionTotal}.`,
        category: 'summaries',
        severity: 'info',
      },
      push: {
        title: `📊 Resumen diario Marketplace`,
        body: `Hoy vendieron ${data.vendorCount} vendors por un total de ${formattedMarketplaceTotal}.`,
      },
      email: {
        subject: `📊 Resumen Marketplace — ${data.dateStr}`,
        text: `Resumen de ventas confirmadas de Vendors\n\nVendor | Pedidos | Total vendido\n\n${rowsText}\n\nTotal Marketplace:\n${formattedMarketplaceTotal}\n\nCantidad total de pedidos:\n${data.orderCount}\n\nVendors con ventas:\n${data.vendorCount}\n\nComisión estimada Collectibles:\n${formattedCommissionTotal}\n\nVer ventas del Marketplace: ${deepLink}`,
        html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 24px; color: #1f2937; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
  <h2 style="color: #4f46e5; margin-top: 0; font-size: 20px;">Resumen de ventas confirmadas de Vendors</h2>
  <p style="font-size: 14px; color: #6b7280; margin-bottom: 20px;">Fecha: ${data.dateStr}</p>
  
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
    <thead>
      <tr style="background-color: #f3f4f6; text-align: left;">
        <th style="padding: 10px 12px; border-bottom: 2px solid #d1d5db; font-weight: 600;">Vendor</th>
        <th style="padding: 10px 12px; border-bottom: 2px solid #d1d5db; font-weight: 600; text-align: center;">Pedidos</th>
        <th style="padding: 10px 12px; border-bottom: 2px solid #d1d5db; font-weight: 600; text-align: right;">Total vendido</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 20px 0; font-size: 14px;">
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
      <span style="color: #4b5563;">Total Marketplace:</span>
      <strong style="color: #111827; font-size: 16px;">${formattedMarketplaceTotal}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
      <span style="color: #4b5563;">Cantidad total de pedidos:</span>
      <strong style="color: #111827;">${data.orderCount}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
      <span style="color: #4b5563;">Vendors con ventas:</span>
      <strong style="color: #111827;">${data.vendorCount}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; border-top: 1px solid #e5e7eb; padding-top: 8px; margin-top: 8px;">
      <span style="color: #4b5563;">Comisión estimada Collectibles:</span>
      <strong style="color: #059669; font-size: 16px;">${formattedCommissionTotal}</strong>
    </div>
  </div>

  <div style="text-align: center; margin-top: 28px;">
    <a href="${deepLink}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 15px;">Ver ventas del Marketplace</a>
  </div>
</div>
        `.trim(),
      },
      deepLink,
    };
  },

  product_question_received: (data: { productTitle: string; productId: string; questionText: string; isVendor?: boolean }) => {
    const deepLink = data.isVendor 
      ? `https://collectibles.uy/vendor?tab=questions`
      : `https://collectibles.uy/admin/questions`;

    const recipientLabel = data.isVendor ? 'Vendor' : 'Administración';

    return {
      inApp: {
        title: `❓ Nueva consulta en "${data.productTitle}"`,
        body: `"${data.questionText.slice(0, 100)}${data.questionText.length > 100 ? '...' : ''}"`,
        category: 'questions',
        severity: 'info',
      },
      push: {
        title: `❓ Nueva pregunta sobre un producto`,
        body: `Recibiste una pregunta en "${data.productTitle}": "${data.questionText.slice(0, 80)}${data.questionText.length > 80 ? '...' : ''}"`,
      },
      email: {
        subject: `❓ Nueva pregunta en: ${data.productTitle}`,
        text: `¡Hola ${recipientLabel}!\n\nUn comprador ha realizado una nueva pregunta sobre tu producto:\n\nProducto: ${data.productTitle}\n\nPregunta:\n"${data.questionText}"\n\nPodés responderla directamente ingresando a: ${deepLink}`,
        html: wrapCollectiblesEmail(
          `Nueva pregunta sobre tu producto`,
          'Preguntas Q&A',
          '#4f46e5',
          `<p>Un usuario realizó una consulta sobre: <strong>${data.productTitle}</strong></p>
           <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #4f46e5; border-radius: 6px; padding: 16px; margin: 20px 0;">
             <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Pregunta del comprador</p>
             <p style="margin: 0; font-size: 15px; font-style: italic; color: #111827;">"${data.questionText}"</p>
           </div>`,
          'Responder pregunta',
          deepLink
        ),
      },
      deepLink,
    };
  },

  product_question_answered: (data: { productTitle: string; productSlug: string; questionId: string; questionText: string; answerText: string; answeredBy: string }) => {
    const deepLink = `https://collectibles.uy/p/${data.productSlug}#pregunta-${data.questionId}`;

    return {
      inApp: {
        title: `💬 Respondieron tu consulta en "${data.productTitle}"`,
        body: `${data.answeredBy}: "${data.answerText.slice(0, 100)}${data.answerText.length > 100 ? '...' : ''}"`,
        category: 'questions',
        severity: 'success',
      },
      push: {
        title: `💬 Respondieron tu pregunta`,
        body: `En "${data.productTitle}": "${data.answerText.slice(0, 80)}${data.answerText.length > 80 ? '...' : ''}"`,
      },
      email: {
        subject: `💬 Respondieron tu pregunta en: ${data.productTitle}`,
        text: `¡Hola!\n\nEl vendedor ha respondido a tu pregunta en ${data.productTitle}.\n\nTu pregunta:\n"${data.questionText}"\n\nRespuesta de ${data.answeredBy}:\n"${data.answerText}"\n\nPodés ver la publicación aquí: ${deepLink}`,
        html: wrapCollectiblesEmail(
          `¡Respondieron tu pregunta!`,
          'Respuesta Publicada',
          '#059669',
          `<p>Han respondido a tu consulta sobre: <strong>${data.productTitle}</strong></p>
           <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 16px 0;">
             <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Tu pregunta</p>
             <p style="margin: 0 0 12px 0; font-size: 14px; color: #4b5563;">"${data.questionText}"</p>
             <p style="margin: 0 0 4px 0; font-size: 12px; color: #059669; text-transform: uppercase; font-weight: 600;">Respuesta de ${data.answeredBy}</p>
             <p style="margin: 0; font-size: 15px; font-weight: 500; color: #111827;">"${data.answerText}"</p>
           </div>`,
          'Ver producto',
          deepLink
        ),
      },
      deepLink,
    };
  },
};
