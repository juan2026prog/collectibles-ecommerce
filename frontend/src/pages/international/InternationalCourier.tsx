import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, ExternalLink, Box, Truck } from 'lucide-react';
import { useInternationalCartContext } from '../../contexts/InternationalCartContext';

type CourierOption = 'urubox_new' | 'urubox_existing' | 'other';

export default function InternationalCourier() {
  const navigate = useNavigate();
  const { items } = useInternationalCartContext();
  const [selectedOption, setSelectedOption] = useState<CourierOption | null>(null);
  
  const [suite, setSuite] = useState('');
  const [address, setAddress] = useState({
    fullName: '',
    address1: '',
    address2: '',
    city: 'Miami',
    state: 'FL',
    zip: '',
    phone: ''
  });

  if (items.length === 0) {
    navigate('/internacional/cart');
    return null;
  }

  const handleContinue = () => {
    let payload = {};
    if (selectedOption === 'urubox_new' || selectedOption === 'urubox_existing') {
      if (!suite) return alert('Por favor ingresa tu número de Suite (ej. UYXXXXX)');
      payload = { type: 'urubox', suite };
    } else if (selectedOption === 'other') {
      if (!address.fullName || !address.address1 || !address.zip) {
        return alert('Por favor completa los datos obligatorios de la dirección.');
      }
      payload = { type: 'other', address };
    } else {
      return alert('Selecciona una opción.');
    }

    localStorage.setItem('collectibles_international_courier', JSON.stringify(payload));
    navigate('/internacional/checkout/review');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white flex items-center gap-2 mb-8">
        <ArrowLeft className="w-4 h-4" /> Volver al carrito
      </button>

      <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-8">¿Dónde enviamos tus compras?</h1>

      <div className="grid md:grid-cols-3 gap-6 mb-12">
        {/* Opción 1 */}
        <div 
          onClick={() => setSelectedOption('urubox_new')}
          className={`glass p-6 rounded-2xl border-2 transition-all cursor-pointer ${
            selectedOption === 'urubox_new' ? 'border-[#f00856] bg-[#f00856]/5' : 'border-white/10 hover:border-white/30'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-[#f00856]/20 flex items-center justify-center text-[#f00856] mb-4">
            <Box className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No tengo courier</h3>
          <p className="text-sm text-slate-400">Recomendamos Urubox. Creá tu cuenta gratis y obtené tu dirección en Miami.</p>
        </div>

        {/* Opción 2 */}
        <div 
          onClick={() => setSelectedOption('urubox_existing')}
          className={`glass p-6 rounded-2xl border-2 transition-all cursor-pointer ${
            selectedOption === 'urubox_existing' ? 'border-[#f00856] bg-[#f00856]/5' : 'border-white/10 hover:border-white/30'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 mb-4">
            <Box className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Ya uso Urubox</h3>
          <p className="text-sm text-slate-400">Perfecto, solo necesitamos tu número de Suite para enviar los paquetes.</p>
        </div>

        {/* Opción 3 */}
        <div 
          onClick={() => setSelectedOption('other')}
          className={`glass p-6 rounded-2xl border-2 transition-all cursor-pointer ${
            selectedOption === 'other' ? 'border-[#f00856] bg-[#f00856]/5' : 'border-white/10 hover:border-white/30'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center text-slate-300 mb-4">
            <Truck className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Tengo otro courier</h3>
          <p className="text-sm text-slate-400">Ingresá la dirección de tu courier de preferencia en USA.</p>
        </div>
      </div>

      {/* Dinamic Forms */}
      <div className="glass p-8 rounded-3xl border border-white/10 mb-8 min-h-[300px]">
        {!selectedOption && (
          <div className="flex items-center justify-center h-full text-slate-500 text-center py-12">
            Seleccioná una opción arriba para continuar.
          </div>
        )}

        {selectedOption === 'urubox_new' && (
          <div className="max-w-md mx-auto space-y-6">
            <div className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-2xl text-center">
              <h4 className="text-blue-400 font-bold text-lg mb-2">Paso 1: Creá tu cuenta</h4>
              <p className="text-sm text-slate-300 mb-4">Abrí Urubox en una nueva pestaña y registrate. Te darán un número de Suite.</p>
              <a href="https://urubox.com.uy" target="_blank" rel="noopener noreferrer" className="btn-primary w-full py-3 rounded-xl flex justify-center items-center gap-2 text-sm">
                Registrarse en Urubox <ExternalLink className="w-4 h-4" />
              </a>
            </div>
            
            <div className="pt-4 border-t border-white/10">
              <h4 className="text-white font-bold text-lg mb-4">Paso 2: Ingresá tu Suite</h4>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Número de Suite Urubox</label>
              <input 
                type="text" 
                placeholder="Ej. UY12345"
                value={suite}
                onChange={e => setSuite(e.target.value.toUpperCase())}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#f00856] transition-colors"
              />
            </div>
          </div>
        )}

        {selectedOption === 'urubox_existing' && (
          <div className="max-w-md mx-auto">
            <h4 className="text-white font-bold text-lg mb-6 text-center">Ingresá tu número de Suite</h4>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Número de Suite Urubox</label>
            <input 
              type="text" 
              placeholder="Ej. UY12345"
              value={suite}
              onChange={e => setSuite(e.target.value.toUpperCase())}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#f00856] transition-colors text-center text-xl tracking-widest"
            />
          </div>
        )}

        {selectedOption === 'other' && (
          <div className="max-w-2xl mx-auto space-y-4">
            <h4 className="text-white font-bold text-lg mb-6">Dirección de tu Courier en USA</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-400 mb-1">Nombre Completo + ID/Suite</label>
                <input type="text" value={address.fullName} onChange={e => setAddress({...address, fullName: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white" placeholder="Ej. Juan Perez UY9999" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-400 mb-1">Dirección (Línea 1)</label>
                <input type="text" value={address.address1} onChange={e => setAddress({...address, address1: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-400 mb-1">Dirección (Línea 2 / Opcional)</label>
                <input type="text" value={address.address2} onChange={e => setAddress({...address, address2: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Ciudad</label>
                <input type="text" value={address.city} onChange={e => setAddress({...address, city: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Estado</label>
                <input type="text" value={address.state} onChange={e => setAddress({...address, state: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Código Postal (Zip Code)</label>
                <input type="text" value={address.zip} onChange={e => setAddress({...address, zip: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Teléfono (USA)</label>
                <input type="text" value={address.phone} onChange={e => setAddress({...address, phone: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button 
          onClick={handleContinue}
          disabled={!selectedOption}
          className={`px-8 py-4 rounded-xl flex items-center gap-2 font-black uppercase tracking-widest text-sm transition-all ${
            selectedOption ? 'btn-primary shadow-xl shadow-[#f00856]/20 hover:-translate-y-1' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          Continuar <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
