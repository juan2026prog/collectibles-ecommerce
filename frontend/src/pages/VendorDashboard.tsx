import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams, useOutletContext } from 'react-router-dom';
import { Store, RefreshCw, AlertTriangle, ShieldAlert } from 'lucide-react';

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

import VCategories from '../components/vendor/VCategories';
import VBrands from '../components/vendor/VBrands';
import VStores from '../components/vendor/VStores';
import VPromotions from '../components/vendor/VPromotions';
import VMedia from '../components/vendor/VMedia';
import VCollections from '../components/vendor/VCollections';

export default function VendorDashboard() {
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeStoreId, stores } = useOutletContext<any>() || {};
  const activeTab = searchParams.get('tab') || 'overview';
  const setActiveTab = (tab: string) => setSearchParams({ tab });

  const [vendorData, setVendorData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

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

  // If the vendor is suspended
  if (vendorData?.status === 'suspended') {
    return (
      <div className="flex-1 flex flex-col justify-center items-center text-center min-h-[60vh] py-20 px-6 bg-gray-50">
        <div className="bg-white p-12 rounded-2xl border border-red-200 shadow-sm max-w-xl w-full">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Cuenta Suspendida</h1>
          <p className="text-gray-500 mb-6">
            Tu cuenta de vendedor ha sido suspendida. Por favor, contacta a soporte para más información.
          </p>
          <a href="/contact" className="px-6 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors inline-block">
            Contactar Soporte
          </a>
        </div>
      </div>
    );
  }

  // Onboarding for non-vendors (should be rare since ProtectedRoute and accept invite handle this, but just in case)
  if (!vendorData) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center text-center min-h-[60vh] py-20 px-6 bg-gray-50">
        <div className="bg-white p-12 rounded-2xl border border-gray-200 shadow-sm max-w-xl w-full">
          
          <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-8">
            <Store className="w-10 h-10 text-primary-600" />
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Activar Panel Seller</h1>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Tu cuenta ha sido habilitada por un administrador. Haz clic abajo para crear tu tienda en el ecosistema de Collectibles.
          </p>

          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700 text-left">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-500" />
              <div className="text-sm font-semibold">{errorMsg}</div>
            </div>
          )}
          
          <button 
            onClick={handleInitialize}
            disabled={loading}
            className="w-full bg-primary-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-primary-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? 'Inicializando...' : 'Inicializar Mi Tienda'}
          </button>
        </div>
      </div>
    );
  }

  async function handleInitialize() {
    if (!user?.id) return;
    setLoading(true);
    setErrorMsg('');
    try {
      // 1. Antes de crear, verificar si ya existe el vendor para este ID de usuario
      const { data: existingVendor } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (existingVendor) {
        if (existingVendor.status === 'pending') {
          await supabase.from('vendors').update({ status: 'active' }).eq('id', user.id);
          const { data: activated } = await supabase.from('vendors').select('*').eq('id', user.id).single();
          if (activated) setVendorData(activated);
        } else {
          setVendorData(existingVendor);
        }
        return;
      }

      // 2. Generar store_name dinámico y no usar nombres genéricos fijos
      const timestamp = Math.floor(1000 + Math.random() * 9000);
      const rawName = profile?.first_name ? profile.first_name : (user.email?.split('@')[0] || 'Seller');
      const cleanName = rawName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+/g, ' ').trim();
      const storeName = `Tienda-${cleanName.replace(/\s+/g, '-')}-${timestamp}`;
      const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + user.id.slice(0, 6);
      
      // 3. Validar si el nombre ya existe por casualidad
      const { data: nameConflict } = await supabase
        .from('vendors')
        .select('id')
        .eq('store_name', storeName)
        .maybeSingle();

      if (nameConflict) {
        setErrorMsg("La tienda ya existe. Elija otro nombre.");
        return;
      }

      // Step 1: Insert as pending to satisfy RLS policy
      const { error: insertError } = await supabase.from('vendors').insert({
        id: user.id,
        store_name: storeName,
        slug,
        description: 'Tienda recién creada',
        base_commission_rate: 10,
        status: 'pending',
        shipping_mode: 'platform',
      });
      
      if (insertError) {
        console.error('Error creating vendor:', insertError);
        if (insertError.code === '23505') {
          setErrorMsg("La tienda ya existe. Elija otro nombre.");
        } else {
          setErrorMsg(`Error al inicializar tienda: ${insertError.message}`);
        }
      } else {
        // Step 2: Immediately update to active since they are already authorized
        await supabase.from('vendors').update({ status: 'active' }).eq('id', user.id);
        
        const { data: vendor } = await supabase.from('vendors').select('*').eq('id', user.id).single();
        if (vendor) setVendorData(vendor);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Ocurrió un error inesperado al intentar activar tu tienda.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animation-fade-in">
      {activeTab === 'overview' && <VOverview onChangeTab={setActiveTab} activeStoreId={activeStoreId} />}
      {activeTab === 'products' && <VProducts activeStoreId={activeStoreId} />}
      {activeTab === 'imports' && <VImports activeStoreId={activeStoreId} />}
      {activeTab === 'mercadolibre' && <VMercadoLibre activeStoreId={activeStoreId} />}
      {activeTab === 'inventory' && <VInventory mode="inventory" activeStoreId={activeStoreId} />}
      {activeTab === 'orders' && <VOrders activeStoreId={activeStoreId} />}
      {activeTab === 'shipping' && <VShipping activeStoreId={activeStoreId} />}
      {activeTab === 'sla' && <VSLA activeStoreId={activeStoreId} />}
      {activeTab === 'finances' && <VFinances mode="finances" activeStoreId={activeStoreId} />}
      {activeTab === 'settlements' && <VFinances mode="settlements" activeStoreId={activeStoreId} />}
      {activeTab === 'analytics' && <VAnalytics activeStoreId={activeStoreId} />}
      {activeTab === 'incidents' && <VIncidents />}
      {activeTab === 'audit' && <VAudit />}
      {activeTab === 'rules' && <VRules />}
      {activeTab === 'warehouses' && <VInventory mode="warehouses" activeStoreId={activeStoreId} />}
      {activeTab === 'team' && <VTeam />}
      {activeTab === 'settings' && <VSettings />}
      {activeTab === 'kyc' && <VKyc />}
      {activeTab === 'help' && <VHelp />}

      {activeTab === 'categories' && <VCategories />}
      {activeTab === 'brands' && <VBrands />}
      {activeTab === 'stores' && <VStores activeStoreId={activeStoreId} />}
      {activeTab === 'promotions' && <VPromotions />}
      {activeTab === 'media' && <VMedia />}
      {activeTab === 'collections' && <VCollections activeStoreId={activeStoreId} />}
    </div>
  );
}
