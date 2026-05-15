import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { Store, RefreshCw } from 'lucide-react';

import VOverview from '../components/vendor/VOverview';
import VProducts from '../components/vendor/VProducts';
import VImports from '../components/vendor/VImports';
import VMercadoLibre from '../components/vendor/VMercadoLibre';
import VInventory from '../components/vendor/VInventory';
import VOrders from '../components/vendor/VOrders';
import VShipping from '../components/vendor/VShipping';
import VSLA from '../components/vendor/VSLA';
import VFinances from '../components/vendor/VFinances';
import VAnalytics from '../components/vendor/VAnalytics';
import VIncidents from '../components/vendor/VIncidents';
import VAudit from '../components/vendor/VAudit';
import VRules from '../components/vendor/VRules';
import VTeam from '../components/vendor/VTeam';
import VSettings from '../components/vendor/VSettings';
import VHelp from '../components/vendor/VHelp';

export default function VendorDashboard() {
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';
  const setActiveTab = (tab: string) => setSearchParams({ tab });

  const [vendorData, setVendorData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function loadVendor() {
      const { data: vendor } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', user!.id)
        .single();
      if (vendor) setVendorData(vendor);
      setLoading(false);
    }
    loadVendor();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-6">
        <RefreshCw className="w-12 h-12 text-[#f00856] animate-spin" />
        <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] animate-pulse">Initializing Protocol...</p>
      </div>
    );
  }

  // Onboarding for non-vendors
  if (!vendorData) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center text-center min-h-[60vh] py-20 px-6">
        <div className="glass p-16 rounded-[3rem] border border-white/10 shadow-2xl relative overflow-hidden group max-w-2xl">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#f00856]/5 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
          
          <div className="w-24 h-24 bg-[#f00856]/10 border border-[#f00856]/20 rounded-[2rem] flex items-center justify-center mx-auto mb-10 shadow-xl relative z-10 group-hover:bg-[#f00856] group-hover:text-white transition-all duration-500">
            <Store className="w-10 h-10 group-hover:scale-110 transition-transform" />
          </div>
          
          <h1 className="text-5xl font-black text-white tracking-tighter mb-6 relative z-10">Activar Panel Seller</h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[11px] mb-12 max-w-md mx-auto leading-relaxed relative z-10">
            Unite al ecosistema de sellers oficiales de Collectibles. Gestioná tu stock, sincronizá con Mercado Libre y escalá tus ventas con logística inteligente.
          </p>
          
          <button onClick={handleInitialize}
            className="bg-white text-black px-12 py-6 rounded-full font-black uppercase tracking-[0.2em] text-[12px] hover:bg-[#f00856] hover:text-white shadow-2xl transition-all hover:scale-105 active:scale-95 border border-white/10 relative z-10">
            Inicializar Mi Tienda
          </button>
        </div>
      </div>
    );
  }

  async function handleInitialize() {
    if (!user?.id) return;
    setLoading(true);
    try {
      const storeName = profile?.first_name ? `Tienda de ${profile.first_name}` : 'Mi Tienda';
      const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + user.id.slice(0, 6);
      const { error } = await supabase.from('vendors').insert({
        id: user.id,
        store_name: storeName,
        slug,
        description: 'Tienda recién creada',
        base_commission_rate: 10,
        status: 'active',
        shipping_mode: 'platform',
      });
      if (error) {
        console.error('Error creating vendor:', error);
      } else {
        const { data: vendor } = await supabase.from('vendors').select('*').eq('id', user.id).single();
        if (vendor) setVendorData(vendor);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animation-fade-in">
      {activeTab === 'overview' && <VOverview onChangeTab={setActiveTab} />}
      {activeTab === 'products' && <VProducts />}
      {activeTab === 'imports' && <VImports />}
      {activeTab === 'mercadolibre' && <VMercadoLibre />}
      {activeTab === 'inventory' && <VInventory mode="inventory" />}
      {activeTab === 'orders' && <VOrders />}
      {activeTab === 'shipping' && <VShipping />}
      {activeTab === 'sla' && <VSLA />}
      {activeTab === 'finances' && <VFinances mode="finances" />}
      {activeTab === 'settlements' && <VFinances mode="settlements" />}
      {activeTab === 'analytics' && <VAnalytics />}
      {activeTab === 'incidents' && <VIncidents />}
      {activeTab === 'audit' && <VAudit />}
      {activeTab === 'rules' && <VRules />}
      {activeTab === 'warehouses' && <VInventory mode="warehouses" />}
      {activeTab === 'team' && <VTeam />}
      {activeTab === 'settings' && <VSettings />}
      {activeTab === 'help' && <VHelp />}
    </div>
  );
}
