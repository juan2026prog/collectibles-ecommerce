import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import Barcode from './Barcode';
import { 
  X, Printer, Download, RefreshCw, AlertTriangle, CheckCircle, 
  Truck, Store, Package, FileText, ChevronRight, Eye 
} from 'lucide-react';

interface ShipmentLabelModalProps {
  suborderId: string;
  onClose: () => void;
  initialTab?: 'label' | 'slip';
}

export default function ShipmentLabelModal({ suborderId, onClose, initialTab = 'label' }: ShipmentLabelModalProps) {
  const [activeTab, setActiveTab] = useState<'label' | 'slip'>(initialTab);
  const [suborder, setSuborder] = useState<any>(null);
  const [shipment, setShipment] = useState<any>(null);
  const [vendor, setVendor] = useState<any>(null);
  const [dispatchAddress, setDispatchAddress] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printSize, setPrintSize] = useState<'A6' | 'A4'>('A6');
  
  // For template override testing
  const [templateOverride, setTemplateOverride] = useState<string | null>(null);

  const labelRef = useRef<HTMLDivElement>(null);
  const slipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (suborderId) {
      loadDetails();
    }
  }, [suborderId]);

  async function loadDetails() {
    setLoading(true);
    try {
      // 1. Fetch suborder and its parent order
      const { data: subData, error: subErr } = await supabase
        .from('order_suborders')
        .select(`
          *,
          parentOrder:orders (
            id,
            status,
            customer_id,
            customer_phone,
            customer_email,
            shipping_address,
            created_at
          )
        `)
        .eq('id', suborderId)
        .single();

      if (subErr || !subData) throw subErr || new Error("Suborder not found");
      setSuborder(subData);

      // 2. Fetch vendor info
      if (subData.vendor_id) {
        const { data: vData } = await supabase
          .from('vendors')
          .select('id, store_name, logo_url, shipping_settings')
          .eq('id', subData.vendor_id)
          .single();
        setVendor(vData || null);

        // Fetch default dispatch address
        const { data: addrData } = await supabase
          .from('vendor_dispatch_addresses')
          .select('*')
          .eq('vendor_id', subData.vendor_id)
          .eq('is_default', true)
          .maybeSingle();
        setDispatchAddress(addrData || null);
      }

      // 3. Fetch suborder items
      const { data: itemsData } = await supabase
        .from('order_items')
        .select(`
          id,
          quantity,
          price,
          product_name,
          product_variants (
            id,
            sku,
            name,
            image_url,
            product:products (
              id,
              title,
              image_url
            )
          )
        `)
        .eq('suborder_id', suborderId);
      setOrderItems(itemsData || []);

      // 4. Fetch or create shipment record
      const { data: shipData, error: shipErr } = await supabase
        .from('shipments')
        .select('*')
        .eq('suborder_id', suborderId)
        .maybeSingle();

      if (shipData) {
        setShipment(shipData);
      } else {
        // Create a shipment row on-the-fly
        const addr = subData.parentOrder?.shipping_address || {};
        const customerName = `${addr.first_name || ''} ${addr.last_name || ''}`.trim() || 'Cliente';
        const customerPhone = subData.parentOrder?.customer_phone || addr.phone || '';
        const customerAddress = addr.street || '';
        const customerCity = addr.city || '';
        const customerDepartment = addr.department || '';

        const provider = (subData.shipping_provider || subData.shipping_method || 'manual').toLowerCase();
        const tracking = subData.tracking_number || `COL-${subData.suborder_number}`;

        // Determine label type
        let labelType = 'courier';
        if (provider === 'soydelivery' || provider === 'flex' || subData.shipping_method === 'express') {
          labelType = 'flex';
        } else if (subData.shipping_method === 'pickup') {
          labelType = 'pickup';
        }

        const newShipment = {
          order_id: subData.parent_order_id,
          suborder_id: suborderId,
          provider_key: provider,
          tracking_code: tracking,
          shipping_status: 'ready_to_ship',
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_address: customerAddress,
          customer_city: customerCity,
          customer_department: customerDepartment,
          barcode_value: tracking,
          qr_value: tracking,
          label_type: labelType,
          label_version: 1,
          label_generated_at: new Date().toISOString()
        };

        const { data: createdShip, error: createErr } = await supabase
          .from('shipments')
          .insert(newShipment)
          .select()
          .single();

        if (createErr) {
          console.error("Error creating shipment automatically:", createErr.message);
        } else {
          setShipment(createdShip);
        }
      }
    } catch (err: any) {
      console.error("Error loading label details:", err.message);
    } finally {
      setLoading(false);
    }
  }

  // Get active template name
  const resolvedTemplate = templateOverride || shipment?.label_type || 'courier';

  // Format Date utility
  function formatDeliveryDate() {
    const d = new Date();
    d.setDate(d.getDate() + 1); // Mock delivery tomorrow
    const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }

  // Print function
  async function handlePrint(isRePrint = false) {
    if (!suborder || !shipment) return;

    let targetElement = activeTab === 'label' ? labelRef.current : slipRef.current;
    if (!targetElement) return;

    // Increment label version if re-printing
    if (isRePrint) {
      setSaving(true);
      const nextVersion = (shipment.label_version || 1) + 1;
      const { data: updatedShip, error: updateErr } = await supabase
        .from('shipments')
        .update({ 
          label_version: nextVersion,
          label_generated_at: new Date().toISOString()
        })
        .eq('id', shipment.id)
        .select()
        .single();
      
      if (!updateErr && updatedShip) {
        setShipment(updatedShip);
      }
      setSaving(false);
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = targetElement.innerHTML;
    const styles = printSize === 'A6' 
      ? `
        @page { size: 100mm 150mm; margin: 0; }
        body { margin: 0; padding: 5px; font-family: system-ui, -apple-system, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .label-container { width: 95mm; height: 140mm; margin: 0 auto; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid #000; padding: 8px; }
      `
      : `
        @page { size: A4; margin: 10mm; }
        body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .label-container { width: 100%; max-width: 170mm; margin: 0 auto; border: 2px solid #000; padding: 20px; box-sizing: border-box; }
      `;

    printWindow.document.write(`
      <html>
        <head>
          <title>${activeTab === 'label' ? 'Etiqueta' : 'Packing Slip'} ${suborder.suborder_number}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>${styles}</style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="label-container bg-white text-black">
            ${htmlContent}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  // Load html2pdf dynamically and download PDF
  async function handleDownloadPDF() {
    if (!suborder || !shipment) return;
    setSaving(true);

    const targetElement = activeTab === 'label' ? labelRef.current : slipRef.current;
    if (!targetElement) {
      setSaving(false);
      return;
    }

    try {
      // Load html2pdf from CDN dynamically
      if (!(window as any).html2pdf) {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
        script.async = true;
        document.body.appendChild(script);
        await new Promise((resolve) => {
          script.onload = resolve;
        });
      }

      const html2pdf = (window as any).html2pdf;
      const fileName = `${activeTab === 'label' ? 'label' : 'packingslip'}_${suborder.suborder_number}.pdf`;
      
      const opt = {
        margin: 0,
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: printSize === 'A6' ? [100, 150] : 'a4', orientation: 'portrait' }
      };

      // Generate the PDF blob to upload
      const pdfBlob = await html2pdf().set(opt).from(targetElement).toPdf().output('blob');

      // Upload to Supabase Storage
      const nextVersion = (shipment.label_version || 1);
      const storagePath = `${activeTab === 'label' ? 'internal' : 'slips'}/${suborderId}-v${nextVersion}.pdf`;
      
      const { error: uploadErr } = await supabase.storage
        .from('shipping-labels')
        .upload(storagePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadErr) {
        console.error("Storage upload failed:", uploadErr.message);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('shipping-labels')
          .getPublicUrl(storagePath);

        const updateFields: any = {};
        if (activeTab === 'label') {
          updateFields.internal_label_url = publicUrl;
        } else {
          updateFields.packing_slip_url = publicUrl;
        }

        await supabase
          .from('shipments')
          .update(updateFields)
          .eq('id', shipment.id);

        // Update local state
        setShipment((prev: any) => ({ ...prev, ...updateFields }));
      }

      // Download file to client
      html2pdf().set(opt).from(targetElement).save(fileName);

    } catch (err: any) {
      console.error("PDF generation/download error:", err.message);
    } finally {
      setSaving(false);
    }
  }

  // Resolve vendor dispatch address fields
  const senderName = vendor?.store_name || 'Tienda';
  const senderAddress = dispatchAddress ? `${dispatchAddress.address}, ${dispatchAddress.city}` : 'Despacho principal';
  const senderPhone = dispatchAddress?.phone || '';

  // Get shipping service label (Flex service)
  const serviceLabel = suborder?.shipping_method === 'express' ? 'EXPRESS' : 'FLEX';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-5xl w-full flex flex-col md:flex-row overflow-hidden max-h-[90vh]">
        
        {/* Left Side: Preview area */}
        <div className="flex-1 bg-slate-100 p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-gray-200 overflow-y-auto min-h-[350px] md:min-h-0">
          <div className="mb-4 text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5 bg-white py-1 px-3 rounded-full shadow-sm border border-gray-200/50">
            <Eye className="w-3.5 h-3.5 text-blue-500" /> Vista Previa ({printSize})
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-8 h-8 text-primary-600 animate-spin" />
              <span className="text-sm text-gray-500">Cargando etiqueta...</span>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              {activeTab === 'label' ? (
                /* LABEL CONTENT CONTAINER */
                <div 
                  ref={labelRef} 
                  className={`bg-white text-black border-2 border-black p-4 select-none ${printSize === 'A6' ? 'w-[100mm] min-h-[148mm] max-w-[380px]' : 'w-full max-w-[600px] aspect-[1/1.414]'}`}
                  style={{ contentVisibility: 'auto' }}
                >
                  {resolvedTemplate === 'flex' && (
                    /* FLEX TEMPLATE */
                    <div className="h-full flex flex-col justify-between text-xs font-sans gap-2">
                      {/* Encabezado */}
                      <div className="border-b-2 border-black pb-2 flex justify-between items-start">
                        <div>
                          {vendor?.logo_url ? (
                            <img src={vendor.logo_url} alt={senderName} className="h-8 max-w-[120px] object-contain mb-1" />
                          ) : (
                            <div className="font-black text-sm uppercase tracking-wide">{senderName}</div>
                          )}
                          <div className="text-[10px] text-gray-600">Despacho: {senderAddress}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">Pedido: #{suborder?.suborder_number}</div>
                          <div className="text-[10px] text-gray-500">Pack ID: {suborder?.parent_order_id?.slice(0, 8).toUpperCase()}</div>
                        </div>
                      </div>

                      {/* Fila destacada servicio */}
                      <div className="bg-black text-white p-3 rounded text-center flex flex-col justify-center items-center">
                        <span className="text-xl font-black tracking-widest">{serviceLabel}</span>
                        <span className="text-xs font-bold mt-0.5">FECHA ENTREGA: {formatDeliveryDate()}</span>
                      </div>

                      {/* QR Grande */}
                      <div className="flex justify-center py-2">
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shipment?.qr_value || suborderId)}`}
                          alt="QR Logistics"
                          className="w-40 h-40 border border-gray-200 p-1 bg-white"
                        />
                      </div>

                      {/* Zona logística y Tipo destino */}
                      <div className="border-y-2 border-black py-2 grid grid-cols-2 text-center divide-x-2 divide-black">
                        <div>
                          <div className="text-[9px] uppercase font-bold text-gray-500">Zona Logística</div>
                          <div className="text-base font-black uppercase tracking-wider">{suborder?.parentOrder?.shipping_address?.city?.toUpperCase() || 'CENTRO'}</div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase font-bold text-gray-500">Destino</div>
                          <div className="text-base font-black uppercase tracking-wider">RESIDENCIAL</div>
                        </div>
                      </div>

                      {/* Datos Destinatario */}
                      <div className="space-y-1 py-1">
                        <div className="text-[10px] uppercase font-bold text-gray-500 border-b border-gray-100">Destinatario</div>
                        <div className="font-bold text-sm">{shipment?.customer_name}</div>
                        <div className="font-semibold">Tel: {shipment?.customer_phone}</div>
                        <div className="text-xs leading-tight">
                          {shipment?.customer_address}, {shipment?.customer_city}, {shipment?.customer_department}
                        </div>
                        {suborder?.parentOrder?.shipping_address?.reference && (
                          <div className="text-[10px] bg-slate-50 border p-1 rounded mt-1">
                            <span className="font-bold">Ref:</span> {suborder.parentOrder.shipping_address.reference}
                          </div>
                        )}
                        {suborder?.parentOrder?.shipping_address?.observations && (
                          <div className="text-[10px] text-red-600 font-semibold mt-0.5">
                            Obs: {suborder.parentOrder.shipping_address.observations}
                          </div>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="border-t-2 border-black pt-2 text-[9px] font-mono text-gray-500 flex justify-between">
                        <span>Marketplace Collectibles</span>
                        <span>Cod: {shipment?.id?.slice(0, 8).toUpperCase()}</span>
                      </div>
                    </div>
                  )}

                  {resolvedTemplate === 'courier' && (
                    /* COURIER TEMPLATE */
                    <div className="h-full flex flex-col justify-between text-xs font-sans gap-2">
                      {/* Encabezado */}
                      <div className="border-b-2 border-black pb-2 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          {vendor?.logo_url ? (
                            <img src={vendor.logo_url} alt={senderName} className="h-6 object-contain" />
                          ) : (
                            <span className="font-black text-sm uppercase">{senderName}</span>
                          )}
                          <span className="text-[10px] text-slate-500">| Vendido por {senderName}</span>
                        </div>
                        <span className="font-bold text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">Marketplace Collectibles</span>
                      </div>

                      {/* Tracking e ID Envío */}
                      <div className="text-center py-1">
                        <div className="text-[10px] uppercase font-bold text-gray-400">Tracking Courier</div>
                        <div className="text-xl font-black tracking-widest">{shipment?.tracking_code || 'SIN TRACKING'}</div>
                      </div>

                      {/* Código de barras horizontal */}
                      <div className="py-2">
                        <Barcode value={shipment?.barcode_value || suborder?.suborder_number || '0000'} height={65} />
                      </div>

                      {/* Destinatario y Remitente en paralelo */}
                      <div className="grid grid-cols-2 gap-4 border-t border-black pt-2">
                        <div className="space-y-1">
                          <div className="text-[9px] font-black uppercase text-gray-400">Destinatario</div>
                          <div className="font-bold">{shipment?.customer_name}</div>
                          <div>Tel: {shipment?.customer_phone}</div>
                          <div className="text-[10px] leading-tight">
                            {shipment?.customer_address}, {shipment?.customer_city}, {shipment?.customer_department}
                          </div>
                        </div>

                        <div className="space-y-1 border-l border-gray-200 pl-3">
                          <div className="text-[9px] font-black uppercase text-gray-400">Remitente</div>
                          <div className="font-bold">{senderName}</div>
                          {senderPhone && <div>Tel: {senderPhone}</div>}
                          <div className="text-[10px] leading-tight">{senderAddress}</div>
                        </div>
                      </div>

                      {/* Datos Courier y Servicio */}
                      <div className="border-t-2 border-black pt-2 grid grid-cols-3 text-center bg-gray-50 p-2 rounded">
                        <div>
                          <div className="text-[8px] font-bold text-gray-400 uppercase">Courier</div>
                          <div className="font-black text-xs uppercase text-slate-800">{shipment?.provider_key?.toUpperCase() || 'DAC'}</div>
                        </div>
                        <div>
                          <div className="text-[8px] font-bold text-gray-400 uppercase">Servicio</div>
                          <div className="font-black text-xs uppercase text-slate-800">
                            {suborder?.shipping_method === 'dac_agency' ? 'AGENCIA' : 'DOMICILIO'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[8px] font-bold text-gray-400 uppercase">Suborden</div>
                          <div className="font-mono text-[10px] font-bold">{suborder?.suborder_number}</div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="text-[8px] font-mono text-gray-400 text-center">
                        Pedido Principal: {suborder?.parent_order_id} | Versión Etiqueta: {shipment?.label_version || 1}
                      </div>
                    </div>
                  )}

                  {resolvedTemplate === 'pickup' && (
                    /* PICKUP TEMPLATE */
                    <div className="h-full flex flex-col justify-between text-xs font-sans gap-3">
                      {/* Encabezado */}
                      <div className="bg-amber-500 text-white p-3 rounded text-center">
                        <span className="text-lg font-black tracking-wider">RETIRO EN LOCAL</span>
                        <div className="text-[10px] font-bold mt-0.5">LISTO PARA RETIRAR</div>
                      </div>

                      {/* QR Grande */}
                      <div className="flex justify-center">
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(suborder?.suborder_number || suborderId)}`}
                          alt="QR Pickup"
                          className="w-40 h-40 border p-1 bg-white"
                        />
                      </div>

                      {/* Info Cliente & Tienda */}
                      <div className="grid grid-cols-2 gap-3 border-y border-black py-2">
                        <div className="space-y-0.5">
                          <div className="text-[8px] uppercase font-bold text-gray-400">Cliente</div>
                          <div className="font-bold">{shipment?.customer_name}</div>
                          <div>{shipment?.customer_phone}</div>
                          <div className="text-gray-500">{suborder?.parentOrder?.customer_email}</div>
                        </div>
                        <div className="space-y-0.5 border-l pl-3">
                          <div className="text-[8px] uppercase font-bold text-gray-400">Punto de Retiro</div>
                          <div className="font-bold">{senderName}</div>
                          <div className="text-[10px] leading-tight text-gray-600">{senderAddress}</div>
                        </div>
                      </div>

                      {/* Productos */}
                      <div className="flex-1 py-1">
                        <div className="text-[8px] uppercase font-bold text-gray-400 mb-1">Productos a Entregar</div>
                        <div className="space-y-1 max-h-[120px] overflow-y-auto pr-1">
                          {orderItems.map((item) => (
                            <div key={item.id} className="flex justify-between text-[11px] border-b border-gray-100 py-0.5">
                              <span className="font-medium text-slate-700 truncate max-w-[200px]">
                                {item.product_name || item.product_variants?.name || item.product_variants?.product?.title}
                              </span>
                              <span className="font-black text-slate-900">x{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Pedidos */}
                      <div className="border-t border-gray-200 pt-2 flex justify-between text-[9px] text-gray-500">
                        <span>Orden: #{suborder?.parent_order_id?.slice(0, 8).toUpperCase()}</span>
                        <span>Suborden: {suborder?.suborder_number}</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* PACKING SLIP (INTERNAL PREPARATION) */
                <div 
                  ref={slipRef} 
                  className={`bg-white text-black border-2 border-dashed border-gray-400 p-6 select-none ${printSize === 'A6' ? 'w-[100mm] min-h-[148mm] max-w-[380px]' : 'w-full max-w-[700px]'}`}
                  style={{ contentVisibility: 'auto' }}
                >
                  <div className="flex flex-col justify-between h-full font-sans gap-4">
                    {/* Header */}
                    <div className="border-b-2 border-black pb-2 flex justify-between items-start">
                      <div>
                        <span className="bg-slate-900 text-white font-black text-[10px] px-2 py-0.5 rounded uppercase tracking-wider">Etiqueta Interna</span>
                        <h2 className="text-base font-black mt-1">PREPARACIÓN DE PEDIDO</h2>
                        <p className="text-[10px] text-slate-500 mt-0.5">Vendor: {senderName}</p>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-sm">{suborder?.suborder_number}</div>
                        <div className="text-[10px] text-gray-500">
                          {new Date(suborder?.created_at || Date.now()).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    {/* QR Interno y Picking info */}
                    <div className="flex justify-between items-center bg-slate-50 p-3 rounded border border-slate-100">
                      <div>
                        <span className="text-[9px] uppercase font-bold text-gray-400">Ubicación de Picking</span>
                        <div className="text-lg font-black text-slate-800">BODEGA-SEC_A</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Por favor verifique SKU y variante.</div>
                      </div>
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent('PICK-' + suborder?.suborder_number)}`}
                        alt="Internal QR"
                        className="w-16 h-16 border bg-white p-0.5"
                      />
                    </div>

                    {/* Listado de Productos */}
                    <div className="flex-1 space-y-3">
                      <div className="text-[9px] uppercase font-black tracking-wider text-slate-400 border-b pb-1">Artículos a Preparar</div>
                      
                      <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                        {orderItems.map((item) => {
                          const title = item.product_name || item.product_variants?.name || item.product_variants?.product?.title;
                          const sku = item.product_variants?.sku || 'SIN SKU';
                          const image = item.product_variants?.image_url || item.product_variants?.product?.image_url || 'https://via.placeholder.com/60';
                          
                          return (
                            <div key={item.id} className="flex gap-3 items-center border-b border-gray-100 pb-2">
                              <img src={image} alt={title} className="w-12 h-12 object-cover rounded border border-gray-200 bg-slate-50" />
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-800 truncate text-[11px]">{title}</div>
                                <div className="text-[10px] text-slate-400 flex justify-between mt-0.5">
                                  <span>SKU: <span className="font-mono text-slate-600 font-bold">{sku}</span></span>
                                  {item.product_variants?.name && (
                                    <span className="text-slate-500 font-medium">Var: {item.product_variants.name}</span>
                                  )}
                                </div>
                              </div>
                              <div className="bg-slate-100 text-slate-900 font-black rounded-lg px-3 py-1.5 text-center text-sm min-w-[36px]">
                                x{item.quantity}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Observaciones */}
                    {suborder?.parentOrder?.shipping_address?.observations && (
                      <div className="bg-red-50 border border-red-100 p-2 rounded text-[10px]">
                        <span className="font-bold text-red-800">Instrucciones del Cliente:</span>
                        <p className="text-red-700 mt-0.5">{suborder.parentOrder.shipping_address.observations}</p>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="text-[8px] font-mono text-gray-400 flex justify-between border-t pt-2 mt-auto">
                      <span>Marketplace Collectibles Logistics</span>
                      <span>Orden Ref: {suborder?.parent_order_id?.slice(0, 8)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Sidebar Actions */}
        <div className="w-full md:w-[280px] p-6 flex flex-col justify-between bg-white">
          <div className="space-y-6">
            {/* Header / Close */}
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-black text-slate-900 leading-tight">Acciones de Logística</h3>
                <p className="text-xs text-slate-500 mt-0.5">Suborden {suborder?.suborder_number}</p>
              </div>
              <button 
                onClick={onClose} 
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Toggles */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
              <button
                onClick={() => setActiveTab('label')}
                className={`py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${activeTab === 'label' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <Truck className="w-3.5 h-3.5" /> Etiqueta
              </button>
              <button
                onClick={() => setActiveTab('slip')}
                className={`py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${activeTab === 'slip' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <FileText className="w-3.5 h-3.5" /> Packing Slip
              </button>
            </div>

            {/* Template Override Selector (Only for Tab 1 / Label) */}
            {activeTab === 'label' && (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Diseño de Etiqueta</span>
                <div className="grid grid-cols-3 gap-1">
                  {['flex', 'courier', 'pickup'].map((temp) => (
                    <button
                      key={temp}
                      onClick={() => setTemplateOverride(temp)}
                      className={`py-1 px-2 border rounded font-bold text-[10px] uppercase transition-colors text-center ${resolvedTemplate === temp ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                      {temp}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Paper Size selector */}
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tamaño de Papel</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPrintSize('A6')}
                  className={`flex-1 py-1.5 border rounded-lg font-bold text-xs transition-colors ${printSize === 'A6' ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  A6 Térmica (4"x6")
                </button>
                <button
                  onClick={() => setPrintSize('A4')}
                  className={`flex-1 py-1.5 border rounded-lg font-bold text-xs transition-colors ${printSize === 'A4' ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  A4 Completo
                </button>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-3 mt-6 border-t border-slate-100 pt-6">
            <button
              onClick={() => handlePrint(false)}
              disabled={loading || saving}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white py-3 rounded-xl font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </button>

            <button
              onClick={() => handlePrint(true)}
              disabled={loading || saving}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white py-3 rounded-xl font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Reimprimir (v{(shipment?.label_version || 1) + 1})
            </button>

            <button
              onClick={handleDownloadPDF}
              disabled={loading || saving}
              className="w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 disabled:text-slate-300 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Descargar PDF
            </button>

            {/* Cloud Storage URLs info */}
            {shipment && (
              <div className="text-[10px] text-gray-400 mt-2 space-y-1 border-t pt-3">
                {shipment.internal_label_url && (
                  <div className="flex justify-between items-center">
                    <span>Etiqueta PDF:</span>
                    <a href={shipment.internal_label_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Ver en Nube</a>
                  </div>
                )}
                {shipment.packing_slip_url && (
                  <div className="flex justify-between items-center">
                    <span>Packing Slip PDF:</span>
                    <a href={shipment.packing_slip_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Ver en Nube</a>
                  </div>
                )}
                <div className="text-[9px] text-gray-500 font-mono flex justify-between mt-2 bg-slate-50 p-1.5 rounded border border-slate-100">
                  <span>Versión: v{shipment.label_version || 1}</span>
                  <span>Generado: {shipment.label_generated_at ? new Date(shipment.label_generated_at).toLocaleDateString() : 'N/A'}</span>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
