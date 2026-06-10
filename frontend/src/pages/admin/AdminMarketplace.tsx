import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Store, ShieldCheck, CreditCard, Link2, Trophy } from 'lucide-react';
import AdminVendors from './AdminVendors';
import AdminVendorKyc from './AdminVendorKyc';
import AdminVendorPayouts from './AdminVendorPayouts';
import AdminLogisticsConnections from './AdminLogisticsConnections';
import AdminMercadoLibre from './AdminMercadoLibre';
import AdminBuyBox from './AdminBuyBox';
import { useFeatures } from '../../contexts/FeatureToggleContext';

export default function AdminMarketplace() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { features } = useFeatures();
  const currentTab = searchParams.get('tab') || 'vendors';

  const setTab = (tab: string) => {
    navigate(`/admin/marketplace?tab=${tab}`, { replace: true });
  };

  const tabs = [
    { id: 'vendors', label: 'Vendors', icon: Store },
    { id: 'kyc', label: 'KYC', icon: ShieldCheck },
    { id: 'liquidaciones', label: 'Liquidaciones', icon: CreditCard },
    { id: 'conexiones', label: 'Conexiones', icon: Link2 },
    { id: 'analytics', label: 'Analytics', icon: Trophy },
  ];

  if (!features.marketplaceEnabled) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        El módulo Marketplace no está habilitado.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Marketplace</h1>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={`
                  whitespace-nowrap flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${isActive 
                    ? 'border-primary-500 text-primary-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon className={`w-5 h-5 mr-2 ${isActive ? 'text-primary-500' : 'text-gray-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-6">
        {currentTab === 'vendors' && <AdminVendors />}
        {currentTab === 'kyc' && <AdminVendorKyc />}
        {currentTab === 'liquidaciones' && <AdminVendorPayouts />}
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
                <p className="mt-2 text-3xl font-bold text-gray-900">Calculando...</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Top Vendors</h3>
                <p className="mt-2 text-3xl font-bold text-gray-900">Calculando...</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Comisiones</h3>
                <p className="mt-2 text-3xl font-bold text-gray-900">Calculando...</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Ventas Marketplace</h3>
                <p className="mt-2 text-3xl font-bold text-gray-900">Calculando...</p>
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
