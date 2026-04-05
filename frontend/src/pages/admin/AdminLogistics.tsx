import React, { useState } from 'react';
import { Truck, MapPin, Save, QrCode, FileText, CheckCircle2, ChevronRight, X, Edit2, Check } from 'lucide-react';

const INITIAL_ZONES = {
  near: { price: 169, label: 'Zonas cercanas', id: 'near', subzones: ['Zona 5', 'Zona 6', 'Zona 7'], barrios: [
    'Buceo','Carrasco','Carrasco Norte','Flor de Maroñas','Las Canteras','Malvín','Malvín Norte','Maroñas','Playa Verde','Pocitos Nuevo','Puerto Buceo','Punta Gorda','Unión',
    'Aguada','Barrio Sur','Centro','Ciudad Vieja','Cordón','Goes','Jacinto Vera','La Blanqueada','La Comercial','La Figurita','Larrañaga','Palermo','Parque Batlle','Parque Rodó','Pocitos','Punta Carretas','Reducto','Tres Cruces','Villa Biarritz','Villa Dolores','Villa Muñoz',
    'Aires Puros','Arroyo Seco','Atahualpa','Bella Vista','Belvedere','Bolívar','Brazo Oriental','Capurro','Casavalle','Castro','Cerrito','Ituzaingó','Jardines Hipódromo','La Teja','Las Acacias','Lavalleja','Marconi','Paso de las Duranas','Paso Molino','Peñarol','Piedras Blancas','Prado','Sayago','Villa Española'
  ] },
  medium: { price: 200, label: 'Zonas de media distancia', id: 'medium', subzones: ['Zona 1', 'Zona 2', 'Zona 3', 'Zona 4', 'Zona 10'], barrios: [
    'Casabó','Cerro','La Paloma','Nuevo París','Pajas Blancas','Paso de la Arena','Punta Espinillo','Santiago Vázquez','Tres Ombúes','Victoria','Villa del Cerro',
    'Abayubá','Colón','Conciliación','Cuchilla Pereira','Lezica','Melilla',
    'Manga','Toledo Chico','Villa García',
    'Bañados de Carrasco','Bella Italia','Chacarita','Punta Rieles',
    'Ciudad de la Costa','Colinas de Carrasco','El Pinar','Lagomar','Lomas de Solymar','Parque Carrasco','Paso de Carrasco','Shangrilá','Solymar'
  ] },
  far: { price: 290, label: 'Zonas lejanas', id: 'far', subzones: ['Zona 8', 'Zona 9', 'Zona 11'], barrios: [
    'La Paz','Las Piedras','Progreso',
    'Barros Blancos','Joaquín Suárez','Pando','Toledo',
    'Ciudad de Canelones'
  ] }
};

export default function AdminLogistics() {
  const [flexActive, setFlexActive] = useState(true);
  const [zonesData, setZonesData] = useState(INITIAL_ZONES);
  const [selectedZones, setSelectedZones] = useState<string[]>(['near', 'medium', 'far']);
  
  // UI States
  const [viewingZone, setViewingZone] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');

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

  function handleSavePrice(zoneId: keyof typeof INITIAL_ZONES) {
    if (editPriceValue && !isNaN(Number(editPriceValue))) {
      setZonesData({
        ...zonesData,
        [zoneId]: { ...zonesData[zoneId], price: Number(editPriceValue) }
      });
    }
    setEditingPrice(null);
  }

  function openPriceEditor(zoneId: string, currentPrice: number) {
    setEditingPrice(zoneId);
    setEditPriceValue(currentPrice.toString());
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
            <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
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
              <p className="text-sm text-gray-500 mb-4">Elige a qué zonas quieres hacer tus envíos con SoyDelivery. El precio que paga el comprador varía según la distancia entre tu ubicación y el domicilio de entrega.</p>
              
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col">
                  <div className="bg-blue-50 p-4 border-b border-gray-200 flex justify-between">
                    <label className="flex items-center gap-3 cursor-pointer font-bold text-sm text-blue-900">
                      <input 
                        type="checkbox" 
                        checked={selectedZones.length === Object.keys(zonesData).length} 
                        onChange={() => {
                          if (selectedZones.length === Object.keys(zonesData).length) setSelectedZones([]);
                          else setSelectedZones(Object.keys(zonesData));
                        }}
                        className="rounded text-blue-600 w-4 h-4 cursor-pointer"
                      /> 
                      Seleccionar todas
                    </label>
                    <span className="text-xs font-bold text-blue-800 bg-blue-100 px-2 py-1 rounded-md">{selectedZones.length} zonas seleccionadas</span>
                  </div>
                  
                  <div className="divide-y divide-gray-100 flex-1 overflow-y-auto">
                    {Object.values(zonesData).map(zone => (
                      <div key={zone.id} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <label className="flex items-center gap-3 font-bold text-gray-800 cursor-pointer">
                              <input type="checkbox" checked={selectedZones.includes(zone.id)} onChange={() => toggleZone(zone.id)} className="rounded text-blue-600 w-4 h-4 cursor-pointer" />
                              <span className="text-sm">{zone.label}</span>
                            </label>
                            <button onClick={() => setViewingZone(zone.id)} className="ml-7 mt-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 group">
                               Ver barrios asociados <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {editingPrice === zone.id ? (
                              <div className="flex items-center gap-1">
                                <span className="font-black text-gray-400">$</span>
                                <input 
                                  type="number" 
                                  value={editPriceValue} 
                                  onChange={e => setEditPriceValue(e.target.value)} 
                                  className="w-16 px-2 py-1 text-sm border-b-2 border-blue-600 font-bold outline-none bg-blue-50" 
                                  autoFocus
                                  onKeyDown={e => e.key === 'Enter' && handleSavePrice(zone.id as any)}
                                />
                                <button onClick={() => handleSavePrice(zone.id as any)} className="p-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200">
                                  <Check className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group cursor-pointer" onClick={() => openPriceEditor(zone.id, zone.price)}>
                                <span className="font-black text-lg text-gray-900 group-hover:text-blue-600 transition-colors">${zone.price}</span>
                                <Edit2 className="w-3 h-3 text-gray-300 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all" />
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="pl-7 flex flex-wrap gap-1.5">
                          {zone.subzones.map(sz => (
                            <span key={sz} className="text-[10px] font-bold text-gray-500 bg-gray-100/80 border border-gray-200 px-1.5 py-0.5 rounded">{sz}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-100 rounded-lg border border-gray-200 min-h-[400px] w-full relative overflow-hidden flex items-center justify-center">
                  <iframe 
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d104711.19159938834!2d-56.24150529895175!3d-34.83604084770141!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x959f80ffc63bf7d3%3A0x6b321b2e355cecb5!2sMontevideo%2C%20Montevideo%20Department!5e0!3m2!1sen!2suy!4v1714400000000!5m2!1sen!2suy" 
                    width="100%" 
                    height="100%" 
                    style={{ border: 0 }} 
                    allowFullScreen 
                    loading="lazy" 
                    referrerPolicy="no-referrer-when-downgrade" 
                    className="absolute inset-0 grayscale-[50%] contrast-125 opacity-80 pointer-events-none"
                  ></iframe>
                  
                  {/* Fake Overlay to simulate the blue Flex zone */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                     <div className="w-[80%] h-[70%] bg-blue-600/30 border-2 border-blue-600/50 rounded-[40px] transform rotate-3 skew-x-12 blur-[1px]"></div>
                  </div>

                  <div className="absolute bottom-4 right-4 flex gap-2">
                     <div className="bg-white/90 backdrop-blur shadow-sm border border-gray-200 px-3 py-1.5 rounded-full text-[10px] font-bold text-gray-600 flex items-center gap-1.5">
                       <span className="w-2.5 h-2.5 bg-blue-600 rounded-full shadow-inner"></span> Cercana
                     </div>
                     <div className="bg-white/90 backdrop-blur shadow-sm border border-gray-200 px-3 py-1.5 rounded-full text-[10px] font-bold text-gray-600 flex items-center gap-1.5">
                       <span className="w-2.5 h-2.5 bg-blue-400 rounded-full shadow-inner"></span> Media
                     </div>
                  </div>
                </div>
              </div>
            </div>

            {/* TIEMPOS DE ENTREGA */}
            <div className="pt-8 border-t border-gray-100">
              <h4 className="font-bold text-gray-900 mb-2">Tiempos de entrega</h4>
              <p className="text-sm text-gray-500 mb-6">Establece los días y horarios en los que ofreces envíos, y el máximo de envíos que podrás entregar.</p>
              
              <div className="mb-6 flex flex-col md:flex-row gap-8">
                <div>
                  <p className="text-xs font-bold text-gray-600 uppercase mb-2">Hago envíos en el día</p>
                  <div className="flex rounded-lg overflow-hidden border border-gray-300 w-max shadow-sm">
                    <button onClick={() => setSameday(true)} className={`px-8 py-2.5 text-sm font-bold transition-colors ${sameday ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>SÍ</button>
                    <button onClick={() => setSameday(false)} className={`px-8 py-2.5 text-sm font-bold transition-colors border-l border-gray-300 ${!sameday ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>NO</button>
                  </div>
                </div>
                <div className="text-sm flex flex-col justify-center gap-2 pt-2 md:pt-4">
                  <p className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> <span className="text-gray-700">Tus publicacione destacadas dirán <strong className="bg-green-600 text-white px-2 py-0.5 rounded ml-1 tracking-wide text-xs shadow-sm">Llega hoy</strong></span></p>
                  <p className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> <span className="text-gray-700">Filtro de búsqueda exclusivo activado</span></p>
                </div>
              </div>

              <div className="space-y-0 max-w-3xl border border-gray-200 rounded-xl overflow-hidden text-sm shadow-sm bg-gray-50">
                <div className="grid grid-cols-[1fr,2fr,1fr] p-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-200 bg-gray-100">
                   <div>Días de entrega</div>
                   <div>Horarios de entrega</div>
                   <div>Máximo de envíos</div>
                </div>

                {/* L-V */}
                <div className="grid grid-cols-[1fr,2fr,1fr] items-center p-5 bg-white border-b border-gray-200">
                  <div className="font-bold text-gray-800">Lunes a viernes</div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-medium w-10">Desde</span>
                      <input type="time" value="09:00" disabled className="border border-gray-300 bg-gray-50 rounded-lg px-3 py-2 text-sm w-28 outline-none" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-medium w-10">Hasta</span>
                      <input type="time" value={weekdayCutoff} onChange={e => setWeekdayCutoff(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28 outline-none focus:border-blue-500 font-bold" />
                    </div>
                  </div>
                  <div>
                    <input type="number" value={maxOrders} onChange={e => setMaxOrders(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full outline-none focus:border-blue-500 font-bold" />
                  </div>
                </div>

                {/* Sabado */}
                <div className="grid grid-cols-[1fr,2fr,1fr] items-center p-5 bg-white border-b border-gray-200 transition-colors">
                  <label className="font-bold text-gray-800 flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={saturdayActive} onChange={() => setSaturdayActive(!saturdayActive)} className="rounded text-blue-600 w-4 h-4 cursor-pointer" />
                    Sábados
                  </label>
                  <div className={`flex items-center gap-4 transition-opacity ${!saturdayActive && 'opacity-40 pointer-events-none'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-medium w-10">Desde</span>
                      <input type="time" value="09:00" disabled className="border border-gray-300 bg-gray-50 rounded-lg px-3 py-2 text-sm w-28 outline-none" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-medium w-10">Hasta</span>
                      <input type="time" value={saturdayCutoff} onChange={e => setSaturdayCutoff(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28 outline-none focus:border-blue-500 font-bold" />
                    </div>
                  </div>
                  <div className={`transition-opacity ${!saturdayActive && 'opacity-40 pointer-events-none'}`}>
                    <input type="number" value={maxOrders} onChange={e => setMaxOrders(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full outline-none focus:border-blue-500 font-bold" />
                  </div>
                </div>

                {/* Domingo */}
                <div className="grid grid-cols-[1fr,2fr,1fr] items-center p-5 bg-gray-50 transition-colors">
                  <label className="font-bold text-gray-800 flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={sundayActive} onChange={() => setSundayActive(!sundayActive)} className="rounded text-blue-600 w-4 h-4 cursor-pointer" />
                    Domingos
                  </label>
                  <div className={`flex items-center gap-4 transition-opacity ${!sundayActive && 'opacity-30 pointer-events-none'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-medium w-10">Desde</span>
                      <input type="time" value="12:00" disabled className="border border-gray-300 border-dashed bg-transparent rounded-lg px-3 py-2 text-sm w-28 outline-none" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-medium w-10">Hasta</span>
                      <input type="time" value="21:00" disabled className="border border-gray-300 border-dashed bg-transparent rounded-lg px-3 py-2 text-sm w-28 outline-none font-bold text-gray-400" />
                    </div>
                  </div>
                  <div className={`transition-opacity ${!sundayActive && 'opacity-30 pointer-events-none'}`}>
                     <input type="number" disabled value={maxOrders} className="border border-gray-300 border-dashed bg-transparent rounded-lg px-3 py-2 text-sm w-full outline-none font-bold text-gray-400" />
                  </div>
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
            <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200 w-max shadow-inner">
              <span className="font-black text-gray-400 pl-2">$</span>
              <input type="number" value={interiorPrice} onChange={e => setInteriorPrice(e.target.value)} className="bg-transparent font-black text-2xl text-gray-900 outline-none w-24 py-1" />
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
            <label className={`block p-4 border-2 rounded-xl cursor-pointer transition-all ${labelFormat === 'zebra' ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className="flex items-center gap-4">
                <input type="radio" checked={labelFormat === 'zebra'} onChange={() => setLabelFormat('zebra')} className="w-5 h-5 text-blue-600 cursor-pointer" />
                <div>
                  <p className="font-bold text-gray-900 leading-tight">Impresora Térmica (Zebra/Eltron)</p>
                  <p className="text-xs text-gray-500 mt-1">10x15 cm. Rollo contínuo perfecto para logística veloz.</p>
                </div>
              </div>
            </label>
            <label className={`block p-4 border-2 rounded-xl cursor-pointer transition-all ${labelFormat === 'a4' ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className="flex items-center gap-4">
                <input type="radio" checked={labelFormat === 'a4'} onChange={() => setLabelFormat('a4')} className="w-5 h-5 text-blue-600 cursor-pointer" />
                <div>
                  <p className="font-bold text-gray-900 leading-tight">Impresora Estándar (A4)</p>
                  <p className="text-xs text-gray-500 mt-1">Imprime 4 etiquetas por hoja. Requiere cortar y pegar.</p>
                </div>
              </div>
            </label>
            <button className="btn-secondary w-full py-4 gap-2 mt-4 shadow-sm font-bold border-gray-300 text-gray-800">
              <FileText className="w-5 h-5" /> Imprimir etiqueta de prueba
            </button>
          </div>

          <div className="bg-gray-100 p-6 rounded-xl flex items-center justify-center border border-gray-200 shadow-inner">
             {/* PREVIEW ETIQUETA SIMULADA */}
             <div className="bg-white p-4 w-[280px] border border-gray-300 shadow-xl transform transition-transform hover:scale-[1.02] cursor-crosshair">
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

      {/* POPUP DE BARRIOS */}
      {viewingZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col animate-scale-up">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div>
                   <h3 className="font-black text-lg text-gray-900">
                     Barrios asociados a {zonesData[viewingZone as keyof typeof INITIAL_ZONES].label}
                   </h3>
                   <p className="text-xs text-gray-500 font-medium mt-0.5">Estos son los lugares a los que se aplica la tarifa de ${zonesData[viewingZone as keyof typeof INITIAL_ZONES].price}</p>
                </div>
                <button onClick={() => setViewingZone(null)} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh] bg-white text-sm text-gray-700 leading-relaxed column-count-2 sm:column-count-3 gap-8">
                 {zonesData[viewingZone as keyof typeof INITIAL_ZONES].barrios.sort().map((b, i) => (
                    <div key={i} className="mb-2 break-inside-avoid shadow-sm bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-lg flex items-center gap-2 font-medium">
                       <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
                       <span className="truncate">{b}</span>
                    </div>
                 ))}
              </div>
              <div className="p-4 border-t border-gray-100 flex justify-end bg-gray-50">
                 <button onClick={() => setViewingZone(null)} className="btn-primary py-2 px-6">Entendido</button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
}
