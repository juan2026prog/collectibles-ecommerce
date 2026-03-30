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
      <div className="min-h-[60vh] flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  // Onboarding for non-vendors
  if (!vendorData) {
    return (
      <div className="flex-1 p-10 max-w-4xl mx-auto flex flex-col justify-center items-center text-center min-h-[60vh]">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-6">
          <Store className="w-10 h-10 text-blue-500" />
        </div>
        <h1 className="text-3xl font-black text-gray-900 mb-2">Panel de Vendedor</h1>
        <p className="text-gray-500 mb-8 max-w-md">Gestioná tu tienda, productos, pedidos, envíos, finanzas y más desde un solo lugar.</p>
        <button onClick={handleInitialize}
          className="bg-blue-600 text-white px-10 py-4 rounded-full font-black hover:bg-blue-700 shadow-xl transition-all hover:scale-105">
          Activar Mi Tienda
        </button>
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
    <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
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
