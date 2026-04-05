import React, { useState } from 'react';
import { Truck, MapPin, Save, QrCode, FileText, CheckCircle2 } from 'lucide-react';

const ZONES_DATA = {
  near: { price: 169, label: 'Zonas cercanas', id: 'near', subzones: ['Zona 5', 'Zona 6', 'Zona 7'] },
  medium: { price: 200, label: 'Zonas de media distancia', id: 'medium', subzones: ['Zona 1', 'Zona 2', 'Zona 3', 'Zona 4', 'Zona 10'] },
  far: { price: 290, label: 'Zonas lejanas', id: 'far', subzones: ['Zona 8', 'Zona 9', 'Zona 11'] }
};

export default function AdminLogistics() {
  const [flexActive, setFlexActive] = useState(true);
  const [selectedZones, setSelectedZones] = useState<string[]>(['near', 'medium', 'far']);
  
  const [sameday, setSameday] = useState(true);
  const [weekdayCutoff, setWeekdayCutoff] = useState('15:00');
  const [saturdayCutoff, setSaturdayCutoff] = useState('13:00');
  const [saturdayActive, setSaturdayActive] = useState(true);
  const [sundayActive, setSundayActive] = useState(false);
  const [maxOrders, setMaxOrders] = useState('50');

  const [interiorPrice, setInteriorPrice] = useState('280');
  const [labelFormat, setLabelFormat] = useState('zebra');

  function toggleZone(zoneId: string) {
    if (selectedZones.includes(zoneId)) {
      setSelectedZones(selectedZones.filter(z => z !== zoneId));
    } else {
      setSelectedZones([...selectedZones, zoneId]);
    }
  }

  function handleSave() {
    alert("Configuración de envíos y SoyDelivery guardada exitosamente.");
  }

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-gray-900">Logística y Envíos</h2>
          <p className="text-sm text-gray-500 mt-1">Integra tus envíos con SoyDelivery y configura envíos al interior.</p>
        </div>
        <button onClick={handleSave} className="btn-primary gap-2">
          <Save className="w-4 h-4" /> Guardar Cambios
        </button>
      </div>

      {/* ENVÍOS FLEX */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-gray-900 text-lg">Configuración de Envíos Flex (SoyDelivery)</h3>
              <p className="text-xs text-gray-500 font-medium">Entregas en el día o al día siguiente en Montevideo y Área Metropolita</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={flexActive} onChange={() => setFlexActive(!flexActive)} />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {flexActive && (
          <div className="p-6 space-y-8">
            {/* ZONAS DE COBERTURA */}
            <div>
              <h4 className="font-bold text-gray-900 mb-2">Zonas de cobertura</h4>
              <p className="text-sm text-gray-500 mb-4">Elige a qué zonas quieres hacer tus envíos con SoyDelivery. El precio que paga el comprador varía según la distancia.</p>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-blue-50 p-3 border-b border-gray-200 flex justify-between">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-sm text-blue-900">
                      <input 
                        type="checkbox" 
                        checked={selectedZones.length === Object.keys(ZONES_DATA).length} 
                        onChange={() => {
                          if (selectedZones.length === Object.keys(ZONES_DATA).length) setSelectedZones([]);
                          else setSelectedZones(Object.keys(ZONES_DATA));
                        }}
                        className="rounded text-blue-600"
                      /> 
                      Seleccionar todas
                    </label>
                    <span className="text-xs font-bold text-blue-800">{selectedZones.length} zonas seleccionadas</span>
                  </div>
                  
                  <div className="divide-y divide-gray-100">
                    {Object.values(ZONES_DATA).map(zone => (
                      <div key={zone.id} className="p-4">
                        <div className="flex justify-between items-center mb-2">
                          <label className="flex items-center gap-2 font-bold text-sm text-gray-800 cursor-pointer">
                            <input type="checkbox" checked={selectedZones.includes(zone.id)} onChange={() => toggleZone(zone.id)} className="rounded text-blue-600" />
                            {zone.label}
                          </label>
                          <span className="font-black text-gray-900">${zone.price}</span>
                        </div>
                        <div className="pl-6 flex flex-wrap gap-2">
                          {zone.subzones.map(sz => (
                            <span key={sz} className="text-[10px] uppercase font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded cursor-help" title="Click 'Ver Barrios' en documentación de zonas">{sz}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-100 rounded-lg border border-gray-200 min-h-[300px] relative overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#4b5563 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                  <div className="text-center z-10">
                    <MapPin className="w-12 h-12 text-blue-400 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-bold text-gray-500">Mapa de Cobertura Activo</p>
                    <p className="text-xs text-gray-400">Montevideo y Área Metropolitana</p>
                  </div>
                  <div className="absolute bottom-2 right-2 flex gap-1">
                     <span className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow border border-white" title="Cercana"></span>
                     <span className="w-2.5 h-2.5 bg-blue-400 rounded-full shadow border border-white" title="Media"></span>
                     <span className="w-2.5 h-2.5 bg-blue-300 rounded-full shadow border border-white" title="Lejana"></span>
                  </div>
                </div>
              </div>
            </div>

            {/* TIEMPOS DE ENTREGA */}
            <div className="pt-8 border-t border-gray-100">
              <h4 className="font-bold text-gray-900 mb-2">Tiempos de entrega</h4>
              <p className="text-sm text-gray-500 mb-6">Establece los días y horarios en los que ofreces envíos, y el máximo de envíos que podrás entregar.</p>
              
              <div className="mb-6 flex gap-8">
                <div>
                  <p className="text-xs font-bold text-gray-600 uppercase mb-2">Hago envíos en el día</p>
                  <div className="flex rounded-lg overflow-hidden border border-gray-300 w-max">
                    <button onClick={() => setSameday(true)} className={`px-6 py-2 text-sm font-bold transition-colors ${sameday ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>SÍ</button>
                    <button onClick={() => setSameday(false)} className={`px-6 py-2 text-sm font-bold transition-colors border-l border-gray-300 ${!sameday ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>NO</button>
                  </div>
                </div>
                <div className="text-sm flex flex-col justify-center gap-1.5 pt-4">
                  <p className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> <span className="text-gray-700">Tus envíos dirán <strong className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded text-xs ml-1">Llega hoy</strong></span></p>
                  <p className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> <span className="text-gray-700">Integración directa con recolectores de SoyDelivery</span></p>
                </div>
              </div>

              <div className="space-y-4 max-w-3xl border border-gray-200 rounded-lg overflow-hidden text-sm">
                {/* L-V */}
                <div className="grid grid-cols-[1fr,2fr,1fr] items-center p-4 bg-gray-50 border-b border-gray-200">
                  <div className="font-bold text-gray-800">Lunes a viernes</div>
                  <div className="flex items-center gap-4">
                    <div>
                      <label className="text-[10px] text-gray-500 font-bold block mb-1">Corte</label>
                      <input type="time" value={weekdayCutoff} onChange={e => setWeekdayCutoff(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm w-32 outline-none focus:border-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 font-bold block mb-1">Máximo de envíos</label>
                    <input type="number" value={maxOrders} onChange={e => setMaxOrders(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full outline-none focus:border-blue-500" />
                  </div>
                </div>

                {/* Sabado */}
                <div className="grid grid-cols-[1fr,2fr,1fr] items-center p-4 bg-white border-b border-gray-200">
                  <label className="font-bold text-gray-800 flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={saturdayActive} onChange={() => setSaturdayActive(!saturdayActive)} className="rounded" />
                    Sábados
                  </label>
                  <div className={`flex items-center gap-4 ${!saturdayActive && 'opacity-30 pointer-events-none'}`}>
                    <div>
                      <label className="text-[10px] text-gray-500 font-bold block mb-1">Corte</label>
                      <input type="time" value={saturdayCutoff} onChange={e => setSaturdayCutoff(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm w-32 outline-none focus:border-blue-500" />
                    </div>
                  </div>
                  <div className={`${!saturdayActive && 'opacity-30 pointer-events-none'}`}>
                    <label className="text-[10px] text-gray-500 font-bold block mb-1">Máximo de envíos</label>
                    <input type="number" value={maxOrders} onChange={e => setMaxOrders(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full outline-none focus:border-blue-500" />
                  </div>
                </div>

                {/* Domingo */}
                <div className="grid grid-cols-[1fr,2fr,1fr] items-center p-4 bg-gray-50">
                  <label className="font-bold text-gray-800 flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={sundayActive} onChange={() => setSundayActive(!sundayActive)} className="rounded" />
                    Domingos
                  </label>
                  <div className={`flex items-center gap-4 ${!sundayActive && 'opacity-30 pointer-events-none'}`}>
                    <span className="text-xs text-gray-400 italic">No tienes configurado domingos habilitados.</span>
                  </div>
                  <div></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>


      {/* INTERIOR Y COSTO FIJO */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 flex flex-col sm:flex-row gap-6 items-center justify-between">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-gray-900 text-lg mb-1">Resto del País (Interior)</h3>
            <p className="text-sm text-gray-500 mb-3 max-w-md">Define un costo fijo para los envíos a los departamentos fuera de la zona metropolitana o Flex.</p>
            <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200 w-max">
              <span className="font-black text-gray-400">$</span>
              <input type="number" value={interiorPrice} onChange={e => setInteriorPrice(e.target.value)} className="bg-transparent font-black text-xl text-gray-900 outline-none w-24" />
            </div>
          </div>
        </div>
      </div>
      
      {/* ETIQUETAS DE ENVÍO */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 overflow-hidden relative">
        <h3 className="font-black text-gray-900 text-lg mb-1">Configuración de Etiquetas</h3>
        <p className="text-sm text-gray-500 mb-6">Elige cómo se imprimen las etiquetas para pegarlas en tus paquetes. Compatibles con impresoras térmicas (Zebra) o estándar (A4).</p>
        
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <label className={`block p-4 border-2 rounded-xl cursor-pointer transition-all ${labelFormat === 'zebra' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className="flex items-center gap-3">
                <input type="radio" checked={labelFormat === 'zebra'} onChange={() => setLabelFormat('zebra')} className="w-4 h-4 text-blue-600" />
                <div>
                  <p className="font-bold text-gray-900">Impresora Térmica (Zebra/Eltron)</p>
                  <p className="text-xs text-gray-500">10x15 cm. Rollo contínuo perfecto para logística veloz.</p>
                </div>
              </div>
            </label>
            <label className={`block p-4 border-2 rounded-xl cursor-pointer transition-all ${labelFormat === 'a4' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className="flex items-center gap-3">
                <input type="radio" checked={labelFormat === 'a4'} onChange={() => setLabelFormat('a4')} className="w-4 h-4 text-blue-600" />
                <div>
                  <p className="font-bold text-gray-900">Impresora Estándar (A4)</p>
                  <p className="text-xs text-gray-500">Imprime 4 etiquetas por hoja. Requiere cortar y pegar.</p>
                </div>
              </div>
            </label>
            <button className="btn-secondary w-full py-3 gap-2 mt-4">
              <FileText className="w-4 h-4" /> Imprimir etiqueta de prueba
            </button>
          </div>

          <div className="bg-gray-100 p-6 rounded-xl flex items-center justify-center border border-gray-200">
             {/* PREVIEW ETIQUETA SIMULADA */}
             <div className="bg-white p-4 w-[280px] border border-gray-300 shadow-md transform rotate-1 transition-transform hover:rotate-0">
                <div className="flex justify-between items-start border-b border-gray-400 pb-2 mb-2">
                   <div className="flex items-center gap-2">
                     <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200 shrink-0">
                       <Truck className="w-4 h-4 text-blue-600" />
                     </div>
                     <div className="text-[8px] leading-tight text-gray-600">
                       <p className="font-bold text-black text-[9px]">Remitente #63700367</p>
                       <p>Ruta 101 - Capitan Artigas</p>
                       <p>Barros Blancos Canelones</p>
                       <p className="font-bold mt-0.5 text-black">Pack ID: <span className="text-[10px]">2000012349445877</span></p>
                     </div>
                   </div>
                </div>

                <div className="flex justify-between items-center bg-gray-100 border-y border-black font-black uppercase text-xs">
                   <p className="bg-black text-white px-4 py-1">XMV01</p>
                   <p className="text-[8px] pr-2 tracking-tighter">Despachar lun 6/abr 16:00 hs</p>
                </div>

                <div className="py-4 border-b border-black text-center">
                   {/* Fake Barcode */}
                   <div className="h-12 flex justify-center overflow-hidden mb-1 opacity-90 mx-auto w-4/5" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #000, #000 2px, transparent 2px, transparent 4px, #000 4px, #000 5px, transparent 5px, transparent 8px, #000 8px, #000 12px, transparent 12px, transparent 14px)', backgroundSize: '100% 100%' }}></div>
                   <p className="text-sm font-black tracking-widest">467831<span className="text-xl px-1">24991</span></p>
                </div>

                <div className="py-2 border-b border-black flex justify-between items-center text-center">
                   <p className="text-4xl font-black tracking-tighter w-full">STB1</p>
                   <p className="text-2xl font-black bg-black text-white px-2">00:00</p>
                </div>

                <div className="py-1 text-center border-b border-black">
                   <p className="text-[10px] font-black uppercase tracking-widest">XMV01 {'>'} STB1 {'>'} <span className="text-lg">TAC</span></p>
                   <p className="text-[9px] font-bold mt-1 uppercase">JUE 09/04/2026</p>
                </div>

                <div className="pt-2 flex justify-between">
                   <div className="text-[8px] leading-tight text-gray-800 flex-1">
                     <p className="font-bold text-black text-[9px] mb-0.5">Victor Sueiro (SUVI5690187)</p>
                     <p><span className="font-bold">Dirección:</span> jose pedro varela 365</p>
                     <p><span className="font-bold">CP:</span> 45000</p>
                     <p><span className="font-bold">Localidad:</span> Tacuarembó</p>
                     <p className="truncate w-32"><span className="font-bold">Ref:</span> Comercio ceramicas castro</p>
                   </div>
                   <div className="shrink-0 flex flex-col items-center border-l justify-between border-black pl-2">
                     <QrCode className="w-10 h-10 mb-1" />
                     <p className="bg-black text-white w-full text-center font-bold text-xs py-0.5">C</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
