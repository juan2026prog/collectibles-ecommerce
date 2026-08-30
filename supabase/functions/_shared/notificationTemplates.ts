/**
 * Centralized Notification Templates for Collectibles Marketplace
 * Resolves Push title, Push body, Email subject, Email html/body, and Deep Links.
 */

export function formatCurrencyUYU(amount: number): string {
  const formatted = new Intl.NumberFormat('es-UY', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0));
  return `$ ${formatted}`;
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
}

export interface OrderCancelledTemplateData {
  orderNumber: string;
  orderId: string;
  isVendor?: boolean;
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

export const notificationTemplates = {
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
      push: {
        title: `🛒 Nueva venta — Pedido pago, preparar envío`,
        body: `El pedido ${data.orderNumber} ya fue pagado. Total de tus productos: ${formattedTotal}. Prepará el pedido para despacho.`,
      },
      email: {
        subject: `🛒 Nueva venta — Pedido pago, preparar envío ${data.orderNumber}`,
        text: `¡Tenés una nueva venta!\n\nEl pago del pedido ${data.orderNumber} fue aprobado.\nYa podés preparar el pedido para despacho.\n\nPedido:\n${data.orderNumber}\n\nTotal de tus productos:\n${formattedTotal}\n\nProductos:\n${itemsListText}\n\nVer pedido: ${deepLink}`,
        html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
  <h2 style="color: #4f46e5; margin-top: 0; font-size: 20px;">¡Tenés una nueva venta!</h2>
  <p style="font-size: 15px; line-height: 1.5; color: #374151;">
    El pago del pedido <strong>${data.orderNumber}</strong> fue aprobado.<br/>
    Ya podés preparar el pedido para despacho.
  </p>
  
  <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Pedido</p>
    <p style="margin: 0 0 16px 0; font-size: 18px; font-weight: bold; color: #111827;">${data.orderNumber}</p>
    
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Total de tus productos</p>
    <p style="margin: 0 0 16px 0; font-size: 22px; font-weight: bold; color: #059669;">${formattedTotal}</p>
    
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Productos</p>
    <ul style="margin: 0; padding-left: 20px; font-size: 15px; color: #374151;">
      ${itemsListHtml}
    </ul>
  </div>

  <div style="text-align: center; margin-top: 28px;">
    <a href="${deepLink}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 15px;">Ver pedido</a>
  </div>
</div>
        `.trim(),
      },
      deepLink,
    };
  },

  admin_own_order_paid: (data: AdminOwnOrderPaidTemplateData) => {
    const formattedTotal = formatCurrencyUYU(data.collectiblesTotal);
    const deepLink = `https://collectibles.uy/admin/orders?order_id=${data.orderId}`;
    
    const itemsListHtml = data.items
      .map(item => `<li>${item.product_name} &times; ${item.quantity}</li>`)
      .join('\n');
    
    const itemsListText = data.items
      .map(item => `- ${item.product_name} × ${item.quantity}`)
      .join('\n');

    return {
      push: {
        title: `🎉 Nueva venta Collectibles — Pedido pago, preparar envío`,
        body: `El pedido ${data.orderNumber} ya fue pagado. Total Collectibles: ${formattedTotal}. Prepará el pedido para despacho.`,
      },
      email: {
        subject: `🎉 Nueva venta Collectibles — Pedido pago, preparar envío ${data.orderNumber}`,
        text: `Se confirmó una nueva venta de Collectibles.\n\nEl pago del pedido ${data.orderNumber} fue aprobado.\nEl pedido ya está listo para preparar.\n\nTotal Collectibles:\n${formattedTotal}\n\nProductos:\n${itemsListText}\n\nVer pedido: ${deepLink}`,
        html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
  <h2 style="color: #4f46e5; margin-top: 0; font-size: 20px;">Se confirmó una nueva venta de Collectibles</h2>
  <p style="font-size: 15px; line-height: 1.5; color: #374151;">
    El pago del pedido <strong>${data.orderNumber}</strong> fue aprobado.<br/>
    El pedido ya está listo para preparar.
  </p>
  
  <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Total Collectibles</p>
    <p style="margin: 0 0 16px 0; font-size: 22px; font-weight: bold; color: #059669;">${formattedTotal}</p>
    
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Productos</p>
    <ul style="margin: 0; padding-left: 20px; font-size: 15px; color: #374151;">
      ${itemsListHtml}
    </ul>
  </div>

  <div style="text-align: center; margin-top: 28px;">
    <a href="${deepLink}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 15px;">Ver pedido</a>
  </div>
</div>
        `.trim(),
      },
      deepLink,
    };
  },

  order_cancelled: (data: OrderCancelledTemplateData) => {
    const isVendor = data.isVendor ?? true;
    const deepLink = isVendor 
      ? `https://collectibles.uy/vendor?tab=orders&order_id=${data.orderId}`
      : `https://collectibles.uy/admin/orders?order_id=${data.orderId}`;

    if (isVendor) {
      return {
        push: {
          title: `❌ Pedido cancelado`,
          body: `El pedido ${data.orderNumber} fue cancelado. No prepares el despacho.`,
        },
        email: {
          subject: `❌ Pedido cancelado ${data.orderNumber}`,
          text: `El pedido ${data.orderNumber} fue cancelado o reembolsado.\nNo prepares ni despaches los productos de este pedido.\n\nVer pedido: ${deepLink}`,
          html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937; background-color: #ffffff; border: 1px solid #fee2e2; border-radius: 8px;">
  <h2 style="color: #dc2626; margin-top: 0; font-size: 20px;">❌ Pedido cancelado</h2>
  <p style="font-size: 15px; line-height: 1.5; color: #374151;">
    El pedido <strong>${data.orderNumber}</strong> fue cancelado o reembolsado.<br/>
    <strong>No prepares ni despaches los productos de este pedido.</strong>
  </p>
  <div style="text-align: center; margin-top: 24px;">
    <a href="${deepLink}" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 15px;">Ver pedido</a>
  </div>
</div>
          `.trim(),
        },
        deepLink,
      };
    } else {
      return {
        push: {
          title: `❌ Venta cancelada`,
          body: `Se canceló el pedido ${data.orderNumber}.`,
        },
        email: {
          subject: `❌ Venta cancelada ${data.orderNumber}`,
          text: `Se canceló o reembolsó el pedido ${data.orderNumber}.\n\nVer pedido: ${deepLink}`,
          html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937; background-color: #ffffff; border: 1px solid #fee2e2; border-radius: 8px;">
  <h2 style="color: #dc2626; margin-top: 0; font-size: 20px;">❌ Venta cancelada</h2>
  <p style="font-size: 15px; line-height: 1.5; color: #374151;">
    Se canceló o reembolsó el pedido <strong>${data.orderNumber}</strong>.
  </p>
  <div style="text-align: center; margin-top: 24px;">
    <a href="${deepLink}" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 15px;">Ver pedido</a>
  </div>
</div>
          `.trim(),
        },
        deepLink,
      };
    }
  },

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
    <div style="display: flex; justify-content: space-between; border-top: 1px solid #e5e7eb; pt: 8px; margin-top: 8px;">
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
};
