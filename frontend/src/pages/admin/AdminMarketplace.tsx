import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Store, ShieldCheck, CreditCard, Link2, Trophy, Tag, Truck, Award, Sliders, AlertTriangle, FileText, Sparkles } from 'lucide-react';
import AdminVendors from './AdminVendors';
import AdminVendorKyc from './AdminVendorKyc';
import AdminVendorsOnboarding from '../../components/admin/AdminVendorsOnboarding';
import AdminVendorPayouts from './AdminVendorPayouts';
import AdminLogisticsConnections from './AdminLogisticsConnections';
import AdminMercadoLibre from './AdminMercadoLibre';
import AdminBuyBox from './AdminBuyBox';
import AdminCatalogCenter from './AdminCatalogCenter';
import AdminLogisticsLabels from '../../components/admin/AdminLogisticsLabels';
import AdminOfficialStores from './AdminOfficialStores';
import AdminLegalDocuments from '../../components/admin/AdminLegalDocuments';
import { useFeatures } from '../../contexts/FeatureToggleContext';
import { supabase } from '../../lib/supabase';

import { BackofficePageHeader, BackofficeTabs, BackofficeKPI } from '../../components/backoffice';

export default function AdminMarketplace() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { features } = useFeatures();
  const currentTab = searchParams.get('tab') || 'vendors';

  const [stats, setStats] = useState({ gmv: 0, topVendor: 'Ninguno', commissions: 0, salesCount: 0 });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    async function loadStats() {
      setLoadingStats(true);
      try {
        const [kpisRes, topRes] = await Promise.all([
          supabase.rpc('get_marketplace_kpis'),
          supabase.rpc('get_top_vendors', { p_limit: 1 })
        ]);
        
        let topVendorName = 'Ninguno';
        if (!topRes.error && topRes.data && topRes.data.length > 0) {
          topVendorName = topRes.data[0].store_name;
        }

        const { data: metrics } = await supabase.rpc('get_vendor_sales_metrics');
        const salesCount = (metrics || []).reduce((sum: number, m: any) => sum + Number(m.order_count), 0);

        setStats({
          gmv: kpisRes.data?.[0]?.total_gmv || 0,
          commissions: kpisRes.data?.[0]?.total_commissions || 0,
          topVendor: topVendorName,
          salesCount: salesCount
        });
      } catch (err) {
        console.error('Error loading marketplace stats:', err);
      } finally {
        setLoadingStats(false);
      }
    }
    if (currentTab === 'analytics') {
      loadStats();
    }
  }, [currentTab]);

  const setTab = (tab: string) => {
    navigate(`/admin/marketplace?tab=${tab}`, { replace: true });
  };

  const tabs = [
    { key: 'vendors', label: 'Vendors' },
    { key: 'onboarding', label: 'Revisión Onboarding' },
    { key: 'kyc', label: 'KYC' },
    { key: 'stores', label: 'Tiendas Oficiales' },
    { key: 'taxonomias', label: 'Taxonomías' },
    { key: 'logistica', label: 'Logística' },
    { key: 'liquidaciones', label: 'Liquidaciones' },
    { key: 'conexiones', label: 'Conexiones' },
    { key: 'legal', label: 'Términos & Legal' },
    { key: 'analytics', label: 'Analytics' },
  ];

  if (!features.marketplaceEnabled) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        El módulo Marketplace no está habilitado.
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      <BackofficePageHeader
        title="Marketplace"
        subtitle="Gestión centralizada de vendedores, comisiones y tiendas oficiales."
      />

      <BackofficeTabs
        tabs={tabs}
        activeTab={currentTab}
        onChange={setTab}
      />

      <div className="mt-6">
        {currentTab === 'vendors' && <AdminVendors />}
        {currentTab === 'onboarding' && <AdminVendorsOnboarding />}
        {currentTab === 'kyc' && <AdminVendorKyc />}
        {currentTab === 'stores' && <AdminOfficialStores />}
        {currentTab === 'taxonomias' && <AdminCatalogCenter />}
        {currentTab === 'logistica' && <AdminLogisticsLabels />}
        {currentTab === 'liquidaciones' && <AdminVendorPayouts />}
        {currentTab === 'legal' && <AdminLegalDocuments />}
        {currentTab === 'conexiones' && (
          <div className="space-y-12">
            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Link2 className="w-5 h-5 text-gray-500" />
                Conexiones Logísticas
              </h2>
              <AdminLogisticsConnections />
            </section>
            
            <section className="border-t border-gray-200 pt-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Store className="w-5 h-5 text-gray-500" />
                Conexión Mercado Libre
              </h2>
              <AdminMercadoLibre />
            </section>
          </div>
        )}
        {currentTab === 'analytics' && (
          <div className="space-y-8">
             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">GMV Marketplace</h3>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {loadingStats ? 'Cargando...' : `$${stats.gmv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Top Vendors</h3>
                <p className="mt-2 text-2xl font-bold text-teal-600 truncate" title={stats.topVendor}>
                  {loadingStats ? 'Cargando...' : stats.topVendor}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Comisiones</h3>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {loadingStats ? 'Cargando...' : `$${stats.commissions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Ventas Marketplace</h3>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {loadingStats ? 'Cargando...' : stats.salesCount}
                </p>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Buy Box Analytics</h2>
              <AdminBuyBox />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
