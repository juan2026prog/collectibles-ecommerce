import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldCheck, Upload, FileText, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

export default function VKyc() {
  const { user } = useAuth();
  const [vendor, setVendor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [taxId, setTaxId] = useState('');
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    if (!user) return;
    loadVendor();
  }, [user]);

  async function loadVendor() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('tax_id, company_name, kyc_status, kyc_documents')
        .eq('id', user!.id)
        .single();

      if (!error && data) {
        setVendor(data);
        setTaxId(data.tax_id || '');
        setCompanyName(data.company_name || '');
      }
    } catch (err) {
      console.error('Error loading KYC:', err);
    }
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    
    try {
      const { error } = await supabase
        .from('vendors')
        .update({
          tax_id: taxId,
          company_name: companyName,
          // If they update details, status goes back to pending to be reviewed
          kyc_status: 'pending' 
        })
        .eq('id', user.id);

      if (error) throw error;
      
      alert('Datos guardados y enviados a revisión.');
      loadVendor();
    } catch (err) {
      console.error(err);
      alert('Error guardando los datos.');
    }
    setSaving(false);
  }

  if (loading) return <div className="text-gray-900">Cargando datos KYC...</div>;

  return (
    <div className="space-y-8 animation-fade-in max-w-4xl">
      <div>
         <div className="text-[11px] text-primary-600 font-black uppercase tracking-[0.4em] mb-3">Identity Verification</div>
         <h2 className="text-5xl font-black text-gray-900 flex items-center gap-4">
            KYC & Legal
            {vendor?.kyc_status === 'approved' && <CheckCircle className="w-10 h-10 text-emerald-500" />}
            {vendor?.kyc_status === 'pending' && <Clock className="w-10 h-10 text-yellow-500" />}
            {vendor?.kyc_status === 'rejected' && <AlertTriangle className="w-10 h-10 text-red-500" />}
         </h2>
         <p className="text-sm text-gray-500 font-bold mt-3 uppercase tracking-[0.2em]">Verificación requerida para operar el marketplace</p>
      </div>

      <div className="bg-white rounded-[2rem] border border-gray-200 p-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
           <ShieldCheck className="w-48 h-48 text-gray-900 -rotate-12" />
        </div>
        
        <form onSubmit={handleSave} className="space-y-6 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Razón Social / Nombre Comercial</label>
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                disabled={vendor?.kyc_status === 'approved'}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-primary-600 transition-colors disabled:opacity-50"
                placeholder="Ej. Tienda Demo S.R.L."
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">RUT / Tax ID</label>
              <input
                type="text"
                value={taxId}
                onChange={e => setTaxId(e.target.value)}
                disabled={vendor?.kyc_status === 'approved'}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-primary-600 transition-colors disabled:opacity-50"
                placeholder="21XXXXXXXXXX"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Documentos Adjuntos (BETA)</label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-white/20 transition-colors">
              <Upload className="w-8 h-8 text-gray-500 mx-auto mb-3" />
              <p className="text-sm font-bold text-gray-500">La subida de archivos directos está deshabilitada en esta demo.</p>
              <p className="text-xs text-gray-500 mt-1">Por favor contacta al administrador para el envío manual de DNI y RUT.</p>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100">
            {vendor?.kyc_status === 'approved' ? (
              <p className="text-emerald-500 text-sm font-bold flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> Tus datos han sido aprobados. No puedes modificarlos.
              </p>
            ) : (
              <button
                type="submit"
                disabled={saving}
                className="bg-primary-600 text-gray-900 px-8 py-4 rounded-xl font-black uppercase tracking-[0.2em] text-xs hover:bg-[#d00040] transition-colors disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Enviar a Revisión'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
