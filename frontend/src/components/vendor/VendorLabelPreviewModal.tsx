import React, { useState, useRef } from 'react';
import Barcode from '../Barcode';
import { X, Printer, Download, AlertTriangle, Eye, Truck, FileText, CheckCircle, Store } from 'lucide-react';

interface VendorLabelPreviewModalProps {
  vendor: any; // Real vendor object
  defaultAddress: any; // Real default dispatch address
  onClose: () => void;
}

export default function VendorLabelPreviewModal({ vendor, defaultAddress, onClose }: VendorLabelPreviewModalProps) {
  const [activeTab, setActiveTab] = useState<'flex' | 'courier' | 'pickup' | 'slip'>('flex');
  const [printSize, setPrintSize] = useState<'A6' | 'A4'>('A6');
  const [saving, setSaving] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Resolve Vendor Details
  const storeName = vendor?.company_name || vendor?.store_name || 'Mi Tienda';
  const logoUrl = vendor?.logo_url || null;
  const slug = vendor?.slug || 'tienda-slug';
  
  // Resolve dispatch address
  let addressText = '';
  if (defaultAddress) {
    addressText = `${defaultAddress.address}, ${defaultAddress.city}, ${defaultAddress.department}`;
  } else if (vendor?.pickup_address) {
    const p = vendor.pickup_address;
    if (typeof p === 'string') {
      addressText = p;
    } else if (p.address || p.street) {
      addressText = `${p.address || p.street || ''}, ${p.city || ''}, ${p.department || ''}`.trim().replace(/^,|,$/g, '');
    }
  }

  // Resolve contact phone
  const contactPhone = defaultAddress?.phone || vendor?.contact_phone || '';

  // 2. Validations
  const hasLogo = !!logoUrl;
  const hasAddress = !!addressText.trim();
  const hasPhone = !!contactPhone.trim();

  // Demo Destination Data
  const demoRecipient = {
    name: 'Juan Pérez',
    phone: '099 123 456',
    address: 'Av. Italia 1234',
    barrio: 'Carrasco',
    department: 'Montevideo',
    tracking: 'TEST-123456789',
    order: 'ORDER-DEMO',
    suborder: 'ORDER-DEMO-A'
  };

  // Date format helper
  function formatPreviewDate() {
    const d = new Date();
    d.setDate(d.getDate() + 1); // tomorrow
    const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }

  // Print function
  function handlePrint() {
    const targetElement = containerRef.current;
    if (!targetElement) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = targetElement.innerHTML;
    const styles = printSize === 'A6' 
      ? `
        @page { size: 100mm 150mm; margin: 0; }
        body { margin: 0; padding: 5px; font-family: system-ui, -apple-system, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .label-container { width: 95mm; height: 140mm; margin: 0 auto; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid #000; padding: 8px; position: relative; }
      `
      : `
        @page { size: A4; margin: 10mm; }
        body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .label-container { width: 100%; max-width: 170mm; margin: 0 auto; border: 2px solid #000; padding: 20px; box-sizing: border-box; position: relative; }
      `;

    printWindow.document.write(`
      <html>
        <head>
          <title>Preview Label - ${storeName}</title>
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

  // PDF download function
  async function handleDownloadPDF() {
    const targetElement = containerRef.current;
    if (!targetElement) return;

    setSaving(true);
    try {
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
      const fileName = `demo_label_${slug}.pdf`;
      
      const opt = {
        margin: 0,
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: printSize === 'A6' ? [100, 150] : 'a4', orientation: 'portrait' }
      };

      html2pdf().set(opt).from(targetElement).save(fileName);
    } catch (err: any) {
      console.error("Error generating preview PDF:", err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-5xl w-full flex flex-col md:flex-row overflow-hidden max-h-[90vh]">
        
        {/* Left Side: Preview Rendering */}
        <div className="flex-1 bg-slate-100 p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-gray-200 overflow-y-auto min-h-[350px] md:min-h-0">
          <div className="mb-4 text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5 bg-white py-1.5 px-3 rounded-full shadow-sm border border-gray-200/50">
            <Eye className="w-3.5 h-3.5 text-blue-500" /> Vista Previa de Diseño
          </div>

          <div className="w-full flex justify-center">
            {/* CONTAINER REF */}
            <div 
              ref={containerRef}
              className={`bg-white text-black border-2 border-black p-4 select-none relative ${printSize === 'A6' ? 'w-[100mm] min-h-[148mm] max-w-[380px]' : 'w-full max-w-[600px] aspect-[1/1.414]'}`}
            >
              {/* WATERMARK BANNER (Diagonal/Overlay) */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-10 select-none opacity-20">
                <div className="border-[6px] border-red-600 text-red-600 text-center font-black text-2xl tracking-widest uppercase py-2 px-6 rounded-lg rotate-[-30deg] w-[120%] whitespace-nowrap">
                  PREVIEW / NO VÁLIDO PARA ENVÍO
                </div>
              </div>

              {activeTab === 'flex' && (
                /* FLEX TEMPLATE */
                <div className="h-full flex flex-col justify-between text-xs font-sans gap-2">
                  <div className="border-b-2 border-black pb-2 flex justify-between items-start">
                    <div>
                      {hasLogo ? (
                        <img src={logoUrl!} alt={storeName} className="h-8 max-w-[120px] object-contain mb-1" />
                      ) : (
                        <div className="font-black text-sm uppercase tracking-wide">{storeName}</div>
                      )}
                      <div className="text-[10px] text-gray-600">Despacho: {addressText || '(Dirección no configurada)'}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">Pedido: #{demoRecipient.suborder}</div>
                      <div className="text-[10px] text-gray-500">Pack ID: {demoRecipient.order}</div>
                    </div>
                  </div>

                  <div className="bg-black text-white p-3 rounded text-center flex flex-col justify-center items-center">
                    <span className="text-xl font-black tracking-widest">FLEX</span>
                    <span className="text-xs font-bold mt-0.5">FECHA ENTREGA: {formatPreviewDate()}</span>
                  </div>

                  <div className="flex justify-center py-2">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(demoRecipient.tracking)}`}
                      alt="QR Demo"
                      className="w-40 h-40 border border-gray-200 p-1 bg-white"
                    />
                  </div>

                  <div className="border-y-2 border-black py-2 grid grid-cols-2 text-center divide-x-2 divide-black">
                    <div>
                      <div className="text-[9px] uppercase font-bold text-gray-500">Zona Logística</div>
                      <div className="text-base font-black uppercase tracking-wider">{demoRecipient.barrio.toUpperCase()}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase font-bold text-gray-500">Destino</div>
                      <div className="text-base font-black uppercase tracking-wider">RESIDENCIAL</div>
                    </div>
                  </div>

                  <div className="space-y-1 py-1">
                    <div className="text-[10px] uppercase font-bold text-gray-500 border-b border-gray-100">Destinatario</div>
                    <div className="font-bold text-sm">{demoRecipient.name}</div>
                    <div className="font-semibold">Tel: {demoRecipient.phone}</div>
                    <div className="text-xs leading-tight">
                      {demoRecipient.address}, {demoRecipient.barrio}, {demoRecipient.department}
                    </div>
                  </div>

                  <div className="border-t-2 border-black pt-2 text-[9px] font-mono text-gray-500 flex justify-between">
                    <span>Marketplace Collectibles (PREVIEW)</span>
                    <span>Cod: DEMO-SHIP-ID</span>
                  </div>
                </div>
              )}

              {activeTab === 'courier' && (
                /* COURIER TEMPLATE */
                <div className="h-full flex flex-col justify-between text-xs font-sans gap-2">
                  <div className="border-b-2 border-black pb-2 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      {hasLogo ? (
                        <img src={logoUrl!} alt={storeName} className="h-6 object-contain" />
                      ) : (
                        <span className="font-black text-sm uppercase">{storeName}</span>
                      )}
                      <span className="text-[10px] text-slate-500">| Vendido por {storeName}</span>
                    </div>
                    <span className="font-bold text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">Collectibles</span>
                  </div>

                  <div className="text-center py-1">
                    <div className="text-[10px] uppercase font-bold text-gray-400">Tracking Courier</div>
                    <div className="text-xl font-black tracking-widest">{demoRecipient.tracking}</div>
                  </div>

                  <div className="py-2">
                    <Barcode value={demoRecipient.tracking} height={65} />
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-black pt-2">
                    <div className="space-y-1">
                      <div className="text-[9px] font-black uppercase text-gray-400">Destinatario</div>
                      <div className="font-bold">{demoRecipient.name}</div>
                      <div>Tel: {demoRecipient.phone}</div>
                      <div className="text-[10px] leading-tight">
                        {demoRecipient.address}, {demoRecipient.barrio}, {demoRecipient.department}
                      </div>
                    </div>

                    <div className="space-y-1 border-l border-gray-200 pl-3">
                      <div className="text-[9px] font-black uppercase text-gray-400">Remitente</div>
                      <div className="font-bold">{storeName}</div>
                      {hasPhone && <div>Tel: {contactPhone}</div>}
                      <div className="text-[10px] leading-tight">{addressText || '(Dirección no configurada)'}</div>
                    </div>
                  </div>

                  <div className="border-t-2 border-black pt-2 grid grid-cols-3 text-center bg-gray-50 p-2 rounded">
                    <div>
                      <div className="text-[8px] font-bold text-gray-400 uppercase">Courier</div>
                      <div className="font-black text-xs uppercase text-slate-800">DAC / UES</div>
                    </div>
                    <div>
                      <div className="text-[8px] font-bold text-gray-400 uppercase">Servicio</div>
                      <div className="font-black text-xs uppercase text-slate-800">DOMICILIO</div>
                    </div>
                    <div>
                      <div className="text-[8px] font-bold text-gray-400 uppercase">Suborden</div>
                      <div className="font-mono text-[10px] font-bold">{demoRecipient.suborder}</div>
                    </div>
                  </div>

                  <div className="text-[8px] font-mono text-gray-400 text-center">
                    Pedido Demo: {demoRecipient.order}
                  </div>
                </div>
              )}

              {activeTab === 'pickup' && (
                /* PICKUP TEMPLATE */
                <div className="h-full flex flex-col justify-between text-xs font-sans gap-3">
                  <div className="bg-amber-500 text-white p-3 rounded text-center">
                    <span className="text-lg font-black tracking-wider">RETIRO EN LOCAL</span>
                    <div className="text-[10px] font-bold mt-0.5">LISTO PARA RETIRAR</div>
                  </div>

                  <div className="flex justify-center">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(demoRecipient.suborder)}`}
                      alt="QR Demo"
                      className="w-40 h-40 border p-1 bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-y border-black py-2">
                    <div className="space-y-0.5">
                      <div className="text-[8px] uppercase font-bold text-gray-400">Cliente</div>
                      <div className="font-bold">{demoRecipient.name}</div>
                      <div>{demoRecipient.phone}</div>
                      <div className="text-gray-500">cliente@demo.com</div>
                    </div>
                    <div className="space-y-0.5 border-l pl-3">
                      <div className="text-[8px] uppercase font-bold text-gray-400">Punto de Retiro</div>
                      <div className="font-bold">{storeName}</div>
                      <div className="text-[10px] leading-tight text-gray-600">{addressText || '(Dirección no configurada)'}</div>
                    </div>
                  </div>

                  <div className="flex-1 py-1">
                    <div className="text-[8px] uppercase font-bold text-gray-400 mb-1">Productos a Entregar</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] border-b border-gray-100 py-0.5">
                        <span className="font-medium text-slate-700">Hasbro Action Figure Demo</span>
                        <span className="font-black text-slate-900">x2</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-2 flex justify-between text-[9px] text-gray-500">
                    <span>Orden: #{demoRecipient.order}</span>
                    <span>Suborden: {demoRecipient.suborder}</span>
                  </div>
                </div>
              )}

              {activeTab === 'slip' && (
                /* PACKING SLIP */
                <div className="h-full flex flex-col justify-between text-xs font-sans gap-4">
                  <div className="border-b-2 border-black pb-2 flex justify-between items-start">
                    <div>
                      <span className="bg-slate-900 text-white font-black text-[10px] px-2 py-0.5 rounded uppercase tracking-wider">Etiqueta Interna</span>
                      <h2 className="text-base font-black mt-1">PREPARACIÓN DE PEDIDO</h2>
                      <p className="text-[10px] text-slate-500 mt-0.5">Vendor: {storeName}</p>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-sm">{demoRecipient.suborder}</div>
                      <div className="text-[10px] text-gray-500">PREVIEW DEMO</div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-slate-50 p-3 rounded border border-slate-100">
                    <div>
                      <span className="text-[9px] uppercase font-bold text-gray-400">Ubicación de Picking</span>
                      <div className="text-lg font-black text-slate-800">BODEGA-DEMO-A</div>
                    </div>
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent('PICK-DEMO')}`}
                      alt="Internal QR Demo"
                      className="w-16 h-16 border bg-white p-0.5"
                    />
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="text-[9px] uppercase font-black tracking-wider text-slate-400 border-b pb-1">Artículos a Preparar</div>
                    <div className="flex gap-3 items-center border-b border-gray-100 pb-2">
                      <div className="w-12 h-12 rounded border border-gray-200 bg-slate-100 flex items-center justify-center font-bold text-slate-400 text-[10px]">FOTO</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 truncate text-[11px]">Hasbro Action Figure Demo</div>
                        <div className="text-[10px] text-slate-400 flex justify-between mt-0.5">
                          <span>SKU: <span className="font-mono text-slate-600 font-bold">HAS-DEMO-99</span></span>
                          <span className="text-slate-500 font-medium">Var: Classic Blue</span>
                        </div>
                      </div>
                      <div className="bg-slate-100 text-slate-900 font-black rounded-lg px-3 py-1.5 text-center text-sm min-w-[36px]">
                        x2
                      </div>
                    </div>
                  </div>

                  <div className="text-[8px] font-mono text-gray-400 flex justify-between border-t pt-2 mt-auto">
                    <span>Marketplace Collectibles Logistics</span>
                    <span>Orden Ref: DEMO-999</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Configuration Alerts & Action Toolbar */}
        <div className="w-full md:w-[320px] p-6 flex flex-col justify-between bg-white overflow-y-auto">
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-black text-slate-900">Preview de Etiqueta</h3>
                <p className="text-xs text-slate-500 mt-0.5">Probá y visualizá tus layouts</p>
              </div>
              <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* VALIDATION ALERTS */}
            <div className="space-y-2">
              {!hasLogo && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <div>
                    <span className="font-bold">Sin logo configurado</span>
                    <p className="text-amber-700 mt-0.5">Se mostrará tu nombre comercial como fallback en formato texto.</p>
                  </div>
                </div>
              )}
              
              {!hasAddress && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-xs flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <div>
                    <span className="font-bold">Falta dirección de despacho</span>
                    <p className="text-red-700 mt-0.5">Configurá tu dirección de despacho para que la etiqueta salga completa.</p>
                  </div>
                </div>
              )}

              {!hasPhone && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-xs flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <div>
                    <span className="font-bold">Falta teléfono de contacto</span>
                    <p className="text-red-700 mt-0.5">Agregá un teléfono de contacto para el remitente.</p>
                  </div>
                </div>
              )}

              {hasLogo && hasAddress && hasPhone && (
                <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-xs flex gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0 text-green-600" />
                  <div>
                    <span className="font-bold">¡Logística completa!</span>
                    <p className="text-green-700 mt-0.5">Todos los campos del remitente se cargarán correctamente.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Template select tabs */}
            <div className="space-y-2 border-t pt-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Seleccionar Plantilla</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setActiveTab('flex')}
                  className={`py-2 px-3 text-xs font-bold rounded-lg border flex items-center justify-center gap-1.5 transition-all ${activeTab === 'flex' ? 'bg-slate-900 border-slate-900 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  <Truck className="w-3.5 h-3.5" /> Flex
                </button>
                <button
                  onClick={() => setActiveTab('courier')}
                  className={`py-2 px-3 text-xs font-bold rounded-lg border flex items-center justify-center gap-1.5 transition-all ${activeTab === 'courier' ? 'bg-slate-900 border-slate-900 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  <Truck className="w-3.5 h-3.5" /> Courier
                </button>
                <button
                  onClick={() => setActiveTab('pickup')}
                  className={`py-2 px-3 text-xs font-bold rounded-lg border flex items-center justify-center gap-1.5 transition-all ${activeTab === 'pickup' ? 'bg-slate-900 border-slate-900 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  <Store className="w-3.5 h-3.5" /> Retiro Local
                </button>
                <button
                  onClick={() => setActiveTab('slip')}
                  className={`py-2 px-3 text-xs font-bold rounded-lg border flex items-center justify-center gap-1.5 transition-all ${activeTab === 'slip' ? 'bg-slate-900 border-slate-900 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  <FileText className="w-3.5 h-3.5" /> Packing Slip
                </button>
              </div>
            </div>

            {/* Print paper selection */}
            <div className="space-y-2 border-t pt-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tamaño de Impresión</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPrintSize('A6')}
                  className={`flex-1 py-1.5 border rounded-lg font-bold text-xs transition-colors ${printSize === 'A6' ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  A6 Térmica
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

          <div className="space-y-3 mt-6 border-t pt-6">
            <button
              onClick={handlePrint}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" /> Imprimir preview
            </button>
            
            <button
              onClick={handleDownloadPDF}
              disabled={saving}
              className="w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Descargar PDF demo
            </button>
            
            <button
              onClick={onClose}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold text-xs transition-all text-center"
            >
              Cerrar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
