import { useState } from 'react';
import { Truck, MapPin, Clock, Settings, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';

const zones = {
  near: { price: 169, label: 'Cercana', zones: {
    'Zona 5': ['Buceo','Carrasco','Carrasco Norte','Flor de Maroñas','Las Canteras','Malvín','Malvín Norte','Maroñas','Playa Verde','Pocitos Nuevo','Puerto Buceo','Punta Gorda','Unión'],
    'Zona 6': ['Aguada','Barrio Sur','Centro','Ciudad Vieja','Cordón','Goes','Jacinto Vera','La Blanqueada','La Comercial','La Figurita','Larrañaga','Palermo','Parque Batlle','Parque Rodó','Pocitos','Punta Carretas','Reducto','Tres Cruces','Villa Biarritz','Villa Dolores','Villa Muñoz'],
    'Zona 7': ['Aires Puros','Arroyo Seco','Atahualpa','Bella Vista','Belvedere','Bolívar','Brazo Oriental','Capurro','Casavalle','Castro','Cerrito','Ituzaingó','Jardines Hipódromo','La Teja','Las Acacias','Lavalleja','Marconi','Paso de las Duranas','Paso Molino','Peñarol','Piedras Blancas','Prado','Sayago','Villa Española'],
  }},
  medium: { price: 200, label: 'Media Distancia', zones: {
    'Zona 1': ['Casabó','Cerro','La Paloma','Nuevo París','Pajas Blancas','Paso de la Arena','Punta Espinillo','Santiago Vázquez','Tres Ombúes','Victoria','Villa del Cerro'],
    'Zona 2': ['Abayubá','Colón','Conciliación','Cuchilla Pereira','Lezica','Melilla'],
    'Zona 3': ['Manga','Toledo Chico','Villa García'],
    'Zona 4': ['Bañados de Carrasco','Bella Italia','Chacarita','Punta Rieles'],
    'Zona 10': ['Ciudad de la Costa','Colinas de Carrasco','El Pinar','Lagomar','Lomas de Solymar','Parque Carrasco','Paso de Carrasco','Shangrilá','Solymar'],
  }},
  far: { price: 290, label: 'Lejana', zones: {
    'Zona 8': ['La Paz','Las Piedras','Progreso'],
    'Zona 9': ['Barros Blancos','Joaquín Suárez','Pando','Toledo'],
    'Zona 11': ['Canelones','Interior'],
  }},
};

export default function VShipping() {
  const [openGroup, setOpenGroup] = useState<string | null>('near');
  const [cutoffGeneral, setCutoffGeneral] = useState('13:00');
  const [cutoffSaturday, setCutoffSaturday] = useState('10:00');
  const [sundayDisabled, setSundayDisabled] = useState(true);

  const methods = [
    { name: 'Retiro en Tienda', operator: 'Propio', status: true, time: 'Inmediato', price: 'Gratis' },
    { name: 'Envío en el Día', operator: 'Soy Delivery', status: true, time: '2-4 horas', price: '$169-$290' },
    { name: 'Envío Programado', operator: 'Soy Delivery', status: true, time: 'Siguiente día', price: '$169-$290' },
    { name: 'Envío Nacional', operator: 'DAC', status: true, time: '3-5 días', price: 'Variable' },
    { name: 'Envío Propio', operator: 'Logística Propia', status: false, time: 'Personalizado', price: 'Personalizado' },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <h2 className="text-2xl font-black text-gray-900">Envíos & Zonas</h2>

      {/* Methods */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50"><h3 className="text-sm font-black text-gray-900">Métodos de Envío</h3></div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
            <tr><th className="p-3 pl-4">Método</th><th className="p-3">Operador</th><th className="p-3">Tiempo</th><th className="p-3">Precio</th><th className="p-3">Estado</th><th className="p-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {methods.map(m => (
              <tr key={m.name} className="hover:bg-gray-50">
                <td className="p-3 pl-4 font-bold text-gray-900">{m.name}</td>
                <td className="p-3 text-gray-600">{m.operator}</td>
                <td className="p-3 text-gray-500 text-xs">{m.time}</td>
                <td className="p-3 font-medium text-gray-700">{m.price}</td>
                <td className="p-3"><span className={`w-2 h-2 rounded-full inline-block ${m.status ? 'bg-green-400' : 'bg-gray-300'}`}></span></td>
                <td className="p-3"><button className="text-[10px] font-bold text-blue-600">Configurar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cutoff Times */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-black text-gray-900 mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" /> Hora de Corte — Envío en el Día</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">General (L-V)</label>
            <input type="time" value={cutoffGeneral} onChange={e => setCutoffGeneral(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm font-bold outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Sábados</label>
            <input type="time" value={cutoffSaturday} onChange={e => setCutoffSaturday(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm font-bold outline-none focus:border-blue-500" />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input type="checkbox" checked={sundayDisabled} onChange={() => setSundayDisabled(!sundayDisabled)} className="rounded" />
              Desactivar domingos/feriados
            </label>
          </div>
        </div>
        <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-800">
          <p className="font-bold">Lógica activa:</p>
          <p>• Pedido antes de las {cutoffGeneral} → elegible para envío hoy</p>
          <p>• Pedido después → pasa al siguiente día hábil</p>
          <p>• Zonas lejanas pueden tener corte más temprano</p>
        </div>
      </div>

      {/* Zones */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50"><h3 className="text-sm font-black text-gray-900 flex items-center gap-2"><MapPin className="w-4 h-4 text-green-500" /> Zonas de Envío — Montevideo & Área Metropolitana</h3></div>
        {Object.entries(zones).map(([key, group]) => (
          <div key={key} className="border-b border-gray-100 last:border-0">
            <button onClick={() => setOpenGroup(openGroup === key ? null : key)} className="w-full p-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <span className={`text-lg font-black ${key === 'near' ? 'text-green-600' : key === 'medium' ? 'text-blue-600' : 'text-orange-600'}`}>${group.price}</span>
                <span className="text-sm font-bold text-gray-900">{group.label}</span>
                <span className="text-xs text-gray-400">({Object.values(group.zones).flat().length} barrios)</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${openGroup === key ? 'rotate-180' : ''}`} />
            </button>
            {openGroup === key && (
              <div className="px-4 pb-4 space-y-3">
                {Object.entries(group.zones).map(([zoneName, barrios]) => (
                  <div key={zoneName}>
                    <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">{zoneName}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {barrios.map(b => (
                        <span key={b} className="text-[11px] bg-gray-50 border border-gray-200 px-2 py-1 rounded text-gray-600">{b}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Interior */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-2"><Truck className="w-4 h-4 text-orange-500" /> Envíos al Interior</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div><label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Operador</label><p className="font-bold">DAC</p></div>
          <div><label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Tarifa</label><p className="font-bold">Variable por departamento</p></div>
          <div><label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Tiempo Estimado</label><p className="font-bold">3-5 días hábiles</p></div>
          <div><label className="text-[10px] font-black text-gray-400 uppercase block mb-1">Express Disponible</label><p className="font-bold text-green-600">Sí ($490)</p></div>
        </div>
      </div>
    </div>
  );
}
