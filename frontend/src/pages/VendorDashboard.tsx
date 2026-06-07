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
import VKyc from '../components/vendor/VKyc';
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
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-4">
        <RefreshCw className="w-8 h-8 text-primary-600 animate-spin" />
        <p className="text-sm font-medium text-gray-500 animate-pulse">Cargando Seller Center...</p>
      </div>
    );
  }

  // Onboarding for non-vendors
  if (!vendorData) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center text-center min-h-[60vh] py-20 px-6 bg-gray-50">
        <div className="bg-white p-12 rounded-2xl border border-gray-200 shadow-sm max-w-xl w-full">
          
          <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-8">
            <Store className="w-10 h-10 text-primary-600" />
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Activar Panel Seller</h1>
          <p className="text-gray-500 mb-10 max-w-md mx-auto">
            Únete al ecosistema de sellers oficiales de Collectibles. Gestiona tu stock, sincroniza con Mercado Libre y escala tus ventas con logística inteligente.
          </p>
          
          <button onClick={handleInitialize}
            className="w-full bg-primary-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-primary-700 transition-colors shadow-sm">
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
      {activeTab === 'kyc' && <VKyc />}
      {activeTab === 'help' && <VHelp />}
    </div>
  );
}
