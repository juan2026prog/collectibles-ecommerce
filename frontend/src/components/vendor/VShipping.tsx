import React, { useState } from 'react';
import { Truck, MapPin, Clock, Save, QrCode, FileText, CheckCircle2, ArrowRight } from 'lucide-react';

const ZONES_DATA = {
  near: { price: 169, label: 'Zonas cercanas', id: 'near', subzones: ['Zona 5', 'Zona 6', 'Zona 7'] },
  medium: { price: 200, label: 'Zonas de media distancia', id: 'medium', subzones: ['Zona 1', 'Zona 2', 'Zona 3', 'Zona 4', 'Zona 10'] },
  far: { price: 290, label: 'Zonas lejanas', id: 'far', subzones: ['Zona 8', 'Zona 9', 'Zona 11'] }
};

export default function VShipping() {
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
    alert("Configuración de envíos guardada.");
  }

  return (
    <div className="max-w-7xl space-y-8 animation-fade-in pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
        <div>
           <div className="text-[11px] text-[#f00856] font-black uppercase tracking-[0.4em] mb-3">Logistics Control</div>
           <h2 className="text-5xl font-black text-white">Configuración de Despacho</h2>
           <p className="text-sm text-slate-500 font-bold mt-3 uppercase tracking-[0.2em]">Gestión de rutas SoyDelivery, zonas Flex y envíos nacionales</p>
        </div>
        <button onClick={handleSave} className="bg-white text-black text-[11px] font-black uppercase tracking-widest px-10 py-5 rounded-full hover:bg-[#f00856] hover:text-white transition-all shadow-xl active:scale-[0.98]">
           Save Logistics Config
        </button>
      </div>

      {/* ENVÍOS FLEX */}
      <div className="glass rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl">
        <div className="p-10 md:p-12 border-b border-white/5 bg-white/[0.03] flex flex-col sm:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-8">
            <div className="w-16 h-16 bg-[#f00856] text-white rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(240,8,86,0.2)]">
              <Truck className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-black text-white text-2xl uppercase tracking-widest">Envíos Flex (SoyDelivery)</h3>
              <p className="text-[11px] text-slate-500 font-black uppercase tracking-widest mt-2">Entregas ultra-rápidas en Montevideo y Canelones</p>
            </div>
          </div>
          <div className="flex items-center gap-6 bg-white/5 px-6 py-4 rounded-full border border-white/5">
             <span className={`text-[11px] font-black uppercase tracking-widest ${flexActive ? 'text-[#f00856]' : 'text-slate-600'}`}>{flexActive ? 'Service Active' : 'Offline'}</span>
             <label className="relative inline-flex items-center cursor-pointer group">
               <input type="checkbox" className="sr-only peer" checked={flexActive} onChange={() => setFlexActive(!flexActive)} />
               <div className="w-14 h-8 bg-black/40 border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-slate-600 after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:after:bg-white peer-checked:bg-[#f00856]"></div>
             </label>
          </div>
        </div>

        {flexActive && (
          <div className="p-10 md:p-12 space-y-16">
            {/* ZONAS DE COBERTURA */}
            <div>
              <div className="flex items-center gap-4 mb-10">
                 <div className="w-1.5 h-8 bg-[#f00856] rounded-full"></div>
                 <h4 className="text-[11px] font-black text-white uppercase tracking-[0.4em]">Zonas de Cobertura Activas</h4>
              </div>
              
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="soft border border-white/5 rounded-[2rem] overflow-hidden shadow-xl">
                  <div className="bg-white/5 p-8 border-b border-white/5 flex justify-between items-center">
                    <label className="flex items-center gap-5 cursor-pointer text-[11px] font-black text-white uppercase tracking-widest hover:text-[#f00856] transition-colors">
                      <input 
                        type="checkbox" 
                        checked={selectedZones.length === Object.keys(ZONES_DATA).length} 
                        onChange={() => {
                          if (selectedZones.length === Object.keys(ZONES_DATA).length) setSelectedZones([]);
                          else setSelectedZones(Object.keys(ZONES_DATA));
                        }}
                        className="w-5 h-5 bg-transparent border-white/20 rounded-md checked:bg-[#f00856] cursor-pointer"
                      /> 
                      Select All Districts
                    </label>
                    <span className="badge">{selectedZones.length} / {Object.keys(ZONES_DATA).length} zones</span>
                  </div>
                  
                  <div className="divide-y divide-white/5">
                    {Object.values(ZONES_DATA).map(zone => (
                      <div key={zone.id} className="p-10 hover:bg-white/[0.02] transition-colors group">
                        <div className="flex justify-between items-center mb-6">
                          <label className="flex items-center gap-5 text-[16px] font-black text-white uppercase tracking-widest cursor-pointer group-hover:text-[#f00856] transition-colors">
                            <input type="checkbox" checked={selectedZones.includes(zone.id)} onChange={() => toggleZone(zone.id)} className="w-5 h-5 bg-transparent border-white/20 rounded-md checked:bg-[#f00856] cursor-pointer" />
                            {zone.label}
                          </label>
                          <span className="font-black text-2xl text-white group-hover:scale-110 transition-transform group-hover:text-[#f00856]">${zone.price}</span>
                        </div>
                        <div className="pl-10 flex flex-wrap gap-2">
                          {zone.subzones.map(sz => (
                            <span key={sz} className="text-[9px] uppercase font-black text-slate-500 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 group-hover:border-[#f00856]/30 group-hover:text-slate-300 transition-all">{sz}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="soft border border-white/5 rounded-[2rem] bg-black/40 relative overflow-hidden flex items-center justify-center p-16 shadow-xl group">
                  <div className="absolute inset-0 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity" style={{ backgroundImage: 'radial-gradient(#f00856 2px, transparent 2px)', backgroundSize: '40px 40px' }}></div>
                  <div className="text-center z-10">
                    <MapPin className="w-24 h-24 text-[#f00856] mx-auto mb-8 opacity-20 group-hover:opacity-40 group-hover:scale-110 transition-all" />
                    <p className="text-[12px] font-black text-white uppercase tracking-[0.5em] mb-3">Coverage Engine Active</p>
                    <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest leading-loose">Geofencing: Montevideo & Metropolitan Hubs</p>
                  </div>
                </div>
              </div>
            </div>

            {/* TIEMPOS DE ENTREGA */}
            <div className="pt-16 border-t border-white/5">
              <div className="flex items-center gap-4 mb-10">
                 <div className="w-1.5 h-8 bg-[#f00856] rounded-full"></div>
                 <h4 className="text-[11px] font-black text-white uppercase tracking-[0.4em]">Optimización de Despacho</h4>
              </div>
              
              <div className="mb-10 flex flex-col xl:flex-row gap-8">
                <div className="soft border border-white/5 p-10 rounded-[2rem] xl:w-[400px] shadow-xl">
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-8">Same Day Delivery Status</p>
                  <div className="flex bg-black/40 p-1.5 rounded-full border border-white/5">
                    <button onClick={() => setSameday(true)} className={`flex-1 py-4 text-[11px] font-black transition-all rounded-full ${sameday ? 'bg-white text-black shadow-xl' : 'text-slate-500 hover:text-white'}`}>ENABLED</button>
                    <button onClick={() => setSameday(false)} className={`flex-1 py-4 text-[11px] font-black transition-all rounded-full ${!sameday ? 'bg-white text-black shadow-xl' : 'text-slate-500 hover:text-white'}`}>DISABLED</button>
                  </div>
                  <div className="mt-10 space-y-4">
                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                       <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                       <span className="text-[11px] font-black uppercase text-slate-300 tracking-widest">Arrivals: Arrives Today</span>
                    </div>
                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                       <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                       <span className="text-[11px] font-black uppercase text-slate-300 tracking-widest">Direct API Integration</span>
                    </div>
                  </div>
                </div>

                <div className="soft border border-white/5 rounded-[2rem] overflow-hidden flex-1 shadow-xl">
                   <div className="grid divide-y divide-white/5">
                      <div className="grid grid-cols-1 md:grid-cols-3 items-center p-10 bg-white/[0.02]">
                         <div className="text-[12px] font-black text-white uppercase tracking-widest mb-6 md:mb-0">Mon - Fri Cycle</div>
                         <div className="flex flex-col gap-3">
                            <label className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Cutoff Time</label>
                            <input type="time" value={weekdayCutoff} onChange={e => setWeekdayCutoff(e.target.value)} className="bg-black/40 border border-white/10 text-white font-black p-4 rounded-xl outline-none focus:border-[#f00856] w-full max-w-[160px] text-[16px] transition-all" />
                         </div>
                         <div className="flex flex-col gap-3">
                            <label className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Max Load / Day</label>
                            <input type="number" value={maxOrders} onChange={e => setMaxOrders(e.target.value)} className="bg-black/40 border border-white/10 text-white font-black p-4 rounded-xl outline-none focus:border-[#f00856] w-full max-w-[160px] text-[16px] transition-all" />
                         </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 items-center p-10">
                         <label className="flex items-center gap-5 text-[12px] font-black text-white uppercase tracking-widest cursor-pointer group mb-6 md:mb-0 hover:text-[#f00856] transition-colors">
                            <input type="checkbox" checked={saturdayActive} onChange={() => setSaturdayActive(!saturdayActive)} className="w-5 h-5 bg-transparent border-white/20 rounded-md checked:bg-[#f00856] cursor-pointer" />
                            Saturday Cycle
                         </label>
                         <div className={`flex flex-col gap-3 ${!saturdayActive && 'opacity-20 pointer-events-none'}`}>
                            <label className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Cutoff Time</label>
                            <input type="time" value={saturdayCutoff} onChange={e => setSaturdayCutoff(e.target.value)} className="bg-black/40 border border-white/10 text-white font-black p-4 rounded-xl outline-none focus:border-[#f00856] w-full max-w-[160px] text-[16px] transition-all" />
                         </div>
                         <div className={`flex flex-col gap-3 ${!saturdayActive && 'opacity-20 pointer-events-none'}`}>
                            <label className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Max Load / Day</label>
                            <input type="number" value={maxOrders} onChange={e => setMaxOrders(e.target.value)} className="bg-black/40 border border-white/10 text-white font-black p-4 rounded-xl outline-none focus:border-[#f00856] w-full max-w-[160px] text-[16px] transition-all" />
                         </div>
                      </div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* INTERIOR Y COSTO FIJO */}
        <div className="soft rounded-[2.5rem] p-12 border border-white/5 hover:bg-white/[0.02] transition-all group shadow-xl">
          <div className="flex items-start gap-10">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 text-orange-500 border border-orange-500/20 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(249,115,22,0.1)] group-hover:scale-110 transition-transform">
              <MapPin className="w-8 h-8" />
            </div>
            <div className="flex-1">
              <h3 className="font-black text-white text-2xl uppercase tracking-widest mb-3">Resto del País (Interior)</h3>
              <p className="text-[11px] text-slate-500 font-black uppercase tracking-widest leading-relaxed mb-10">Tarifa plana para departamentos fuera del hub metropolitano</p>
              <div className="flex items-center gap-6 bg-black/40 p-8 rounded-3xl border border-white/10 w-full group-hover:border-orange-500/40 transition-all shadow-inner">
                <span className="text-2xl font-black text-slate-700">$</span>
                <input type="number" value={interiorPrice} onChange={e => setInteriorPrice(e.target.value)} className="bg-transparent font-black text-5xl text-white outline-none w-full tracking-tighter" />
              </div>
            </div>
          </div>
        </div>
        
        {/* ETIQUETAS DE ENVÍO */}
        <div className="soft rounded-[2.5rem] p-12 border border-white/5 hover:bg-white/[0.02] transition-all group shadow-xl">
           <div className="flex items-start gap-10 h-full">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 text-purple-500 border border-purple-500/20 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(168,85,247,0.1)] group-hover:scale-110 transition-transform">
                <QrCode className="w-8 h-8" />
              </div>
              <div className="flex-1 flex flex-col justify-between h-full">
                 <div>
                    <h3 className="font-black text-white text-2xl uppercase tracking-widest mb-3">Formato de Etiquetas</h3>
                    <p className="text-[11px] text-slate-500 font-black uppercase tracking-widest leading-relaxed mb-10">Optimización para hardware Zebra o estándar láser</p>
                 </div>
                 <div className="space-y-3">
                    <button onClick={() => setLabelFormat('zebra')} className={`w-full p-6 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all text-left flex justify-between items-center ${labelFormat === 'zebra' ? 'bg-[#f00856] text-white border-[#f00856] shadow-lg scale-[1.02]' : 'bg-black/40 text-slate-500 border-white/10 hover:bg-white/5 hover:text-white'}`}>
                       Thermal (Zebra 10x15)
                       {labelFormat === 'zebra' && <CheckCircle2 className="w-5 h-5 animate-in zoom-in duration-300" />}
                    </button>
                    <button onClick={() => setLabelFormat('a4')} className={`w-full p-6 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all text-left flex justify-between items-center ${labelFormat === 'a4' ? 'bg-[#f00856] text-white border-[#f00856] shadow-lg scale-[1.02]' : 'bg-black/40 text-slate-500 border-white/10 hover:bg-white/5 hover:text-white'}`}>
                       Laser (A4 Quad-Label)
                       {labelFormat === 'a4' && <CheckCircle2 className="w-5 h-5 animate-in zoom-in duration-300" />}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* PREVIEW ETIQUETA */}
      <div className="glass rounded-[2.5rem] border border-white/10 overflow-hidden relative shadow-2xl">
         <div className="p-10 md:p-12 border-b border-white/5 bg-white/[0.03] flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="w-12 h-12 rounded-2xl bg-[#f00856]/10 flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(240,8,86,0.1)]">
                 <FileText className="w-6 h-6 text-[#f00856]" />
              </div>
              <div>
                 <h4 className="text-[11px] font-black text-[#f00856] uppercase tracking-[0.4em] mb-1">Print Preview</h4>
                 <h3 className="text-2xl font-black text-white uppercase tracking-widest">Validación de Layout</h3>
              </div>
            </div>
            <button className="text-[11px] font-black text-white uppercase tracking-widest border border-white/10 px-8 py-4 rounded-full hover:bg-white hover:text-black transition-all active:scale-95">Test Label Print</button>
         </div>
         <div className="p-16 md:p-32 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white p-12 w-full max-w-[480px] rounded-3xl shadow-[0_60px_120px_rgba(0,0,0,0.6)] transform hover:rotate-1 transition-all duration-500 cursor-pointer group/label">
               <div className="flex justify-between items-start border-b-4 border-black pb-6 mb-6">
                  <div className="flex items-center gap-6">
                     <div className="w-16 h-16 bg-black text-white flex items-center justify-center rounded-xl shrink-0">
                        <Truck className="w-8 h-8" />
                     </div>
                     <div className="text-[12px] leading-tight font-black uppercase tracking-tighter text-black">
                        <p className="text-sm">Remitente #63700367</p>
                        <p className="text-slate-500 mt-1 font-bold">Ruta 101 - Capitan Artigas</p>
                        <p className="text-slate-500 font-bold">Barros Blancos Canelones</p>
                        <p className="mt-3 text-black border-t-2 border-black pt-2 font-black">Pack ID: <span className="text-lg">2000012349445877</span></p>
                     </div>
                  </div>
               </div>
               <div className="bg-black text-white p-6 rounded-xl flex justify-between items-center mb-8">
                  <p className="text-4xl font-black italic tracking-tighter">XMV01</p>
                  <p className="text-[11px] font-black text-right uppercase tracking-[0.2em] leading-tight opacity-80">Despachar<br/><span className="text-sm">lun 6/abr 16:00 hs</span></p>
               </div>
               <div className="py-10 border-b-4 border-black flex justify-center flex-col items-center">
                  <div className="h-32 w-full opacity-90 group-hover/label:scale-y-110 transition-transform" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #000, #000 4px, transparent 4px, transparent 8px, #000 8px, #000 10px, transparent 10px, transparent 14px)', backgroundSize: '100% 100%' }}></div>
                  <p className="text-3xl font-black tracking-[0.6em] mt-6 text-black">467831 24991</p>
               </div>
               <div className="py-8 flex justify-between items-center border-b-4 border-black">
                  <p className="text-8xl font-black tracking-tighter text-black">STB1</p>
                  <p className="text-5xl font-black bg-black text-white px-6 py-3 rounded-xl">00:00</p>
               </div>
               <div className="pt-8 flex justify-between gap-10">
                  <div className="flex-1">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Destinatario</p>
                     <p className="text-2xl font-black uppercase leading-tight mb-4 text-black">Victor Sueiro<br/><span className="text-lg opacity-60">(SUVI5690187)</span></p>
                     <div className="text-[12px] font-black uppercase tracking-tighter text-slate-700 space-y-1">
                        <p>Jose Pedro Varela 365</p>
                        <p>CP: 45000 | Tacuarembó</p>
                        <p className="mt-4 text-black bg-yellow-400 px-3 py-1.5 inline-block rounded-md shadow-sm">Ref: Comercio ceramicas castro</p>
                     </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-center">
                     <QrCode className="w-24 h-24 mb-4 text-black" />
                     <p className="bg-black text-white w-full text-center font-black text-2xl py-2 rounded-lg">C</p>
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
