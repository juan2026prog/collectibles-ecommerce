import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { 
  ImportCourier, 
  CustomsRule, 
  UserImportDeclaration, 
  UserSavedSimulation, 
  UserImportProfile, 
  UserImportShipment,
  LandedCostSimulation
} from '../../plugins/collector-import-hub/types';
import { DEFAULT_URUGUAY_2026_RULE } from '../../plugins/collector-import-hub/core/customsEngine';
import { DEFAULT_COURIERS } from '../../plugins/collector-import-hub/core/courierEngine';

// Components
import { ImportHubDashboard } from '../../components/importhub/ImportHubDashboard';
import { ImportSimulator } from '../../components/importhub/ImportSimulator';
import { MyFranchiseSection } from '../../components/importhub/MyFranchiseSection';
import { MySimulationsSection } from '../../components/importhub/MySimulationsSection';
import { MyShipmentsSection } from '../../components/importhub/MyShipmentsSection';
import { ImportGuideSection } from '../../components/importhub/ImportGuideSection';
import { ImportAIConsultantChat } from '../../components/importhub/ImportAIConsultantChat';
import { DeclareExternalPurchaseModal } from '../../components/importhub/DeclareExternalPurchaseModal';
import { UserCourierProfileModal } from '../../components/importhub/UserCourierProfileModal';

import { 
  ShieldCheck, 
  Calculator, 
  Bookmark, 
  Truck, 
  BookOpen, 
  MessageSquare, 
  LayoutDashboard,
  MapPin,
  Sparkles
} from 'lucide-react';

export const ImportHubPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'dashboard';

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [couriers, setCouriers] = useState<ImportCourier[]>(DEFAULT_COURIERS);
  const [customsRule, setCustomsRule] = useState<CustomsRule>(DEFAULT_URUGUAY_2026_RULE);
  
  // Stored / State data (mock / persistent fallback)
  const [declarations, setDeclarations] = useState<UserImportDeclaration[]>([
    {
      id: 'decl-1',
      user_id: 'user-1',
      year: 2026,
      origin_type: 'SYSTEM_CONFIRMED',
      description: 'Hot Toys Iron Man Mark VII Diecast',
      product_price_usd: 145.00,
      weight_kg: 2.3,
      courier_name: 'USX Cargo',
      purchase_date: '2026-03-15',
      created_at: new Date().toISOString()
    }
  ]);

  const [savedSimulations, setSavedSimulations] = useState<UserSavedSimulation[]>([
    {
      id: 'sim-1',
      user_id: 'user-1',
      product_title: 'Spider-Man 2 Collector Edition Statue',
      product_price_usd: 120.00,
      product_weight_kg: 1.8,
      is_weight_estimated: false,
      courier_code: 'USX',
      courier_name: 'USX Cargo',
      base_freight_usd: 30.60,
      handling_usd: 0,
      other_fees_usd: 0,
      total_courier_usd: 30.60,
      effective_cost_per_kg_usd: 17.00,
      applied_regime: 'FRANQUICIA',
      customs_tax_usd: 0,
      total_landed_cost_usd: 150.60,
      total_landed_cost_uyu: 6325,
      exchange_rate: 42.0,
      created_at: new Date().toISOString()
    }
  ]);

  const [activeShipments, setActiveShipments] = useState<UserImportShipment[]>([
    {
      id: 'ship-1',
      user_id: 'user-1',
      title: 'Charizard Base Set PSA 9 Graded Card',
      courier_name: 'USX Cargo',
      tracking_code: '940011189922334455',
      current_status: 'IN_INTERNATIONAL_TRANSIT',
      estimated_delivery: '10 de Septiembre, 2026',
      origin_city: 'Miami, FL',
      destination_city: 'Montevideo, UY',
      last_checkpoint_detail: 'Vuelo de carga internacional despachado hacia MVD',
      last_checkpoint_at: '2026-09-04 18:30',
      created_at: new Date().toISOString()
    }
  ]);

  const [userProfile, setUserProfile] = useState<UserImportProfile>({
    user_id: 'user-1',
    preferred_courier_code: 'USX',
    suite_number: 'UY-89241',
    account_name: 'Juan Perez',
    usa_address_line1: '8298 NW 68th St',
    usa_city: 'Miami',
    usa_state: 'FL',
    usa_zip: '33166',
    phone: '+1 (305) 592-0839'
  });

  // Simulator preset state from URL params if clicked from product detail
  const initialPriceUsd = parseFloat(searchParams.get('price') || '85');
  const initialWeightKg = parseFloat(searchParams.get('weight') || '1.2');
  const initialTitle = searchParams.get('title') || 'Figura Coleccionable';

  // Modals
  const [isDeclareModalOpen, setIsDeclareModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', tabId);
      return next;
    });
  };

  const handleSaveDeclaration = (decl: Omit<UserImportDeclaration, 'id' | 'created_at'>) => {
    const newDecl: UserImportDeclaration = {
      ...decl,
      id: `decl-${Date.now()}`,
      created_at: new Date().toISOString()
    };
    setDeclarations(prev => [newDecl, ...prev]);
  };

  const handleDeleteDeclaration = (id: string) => {
    setDeclarations(prev => prev.filter(d => d.id !== id));
  };

  const handleSaveSimulation = (sim: LandedCostSimulation, title: string) => {
    const newSaved: UserSavedSimulation = {
      id: `sim-${Date.now()}`,
      user_id: 'user-1',
      product_title: title,
      product_price_usd: sim.productPriceUsd,
      product_weight_kg: sim.productWeightKg,
      is_weight_estimated: sim.isWeightEstimated,
      courier_code: sim.courier.courierCode,
      courier_name: sim.courier.courierName,
      base_freight_usd: sim.courier.baseFreightUsd,
      handling_usd: sim.courier.handlingFeeUsd,
      other_fees_usd: sim.courier.ursecFeeUsd + sim.courier.insuranceFeeUsd + sim.courier.localDeliveryFeeUsd,
      total_courier_usd: sim.courier.totalCourierUsd,
      effective_cost_per_kg_usd: sim.courier.effectiveCostPerKgUsd,
      applied_regime: sim.customs.regime,
      customs_tax_usd: sim.customs.taxUsd,
      total_landed_cost_usd: sim.totalLandedCostUsd,
      total_landed_cost_uyu: sim.totalLandedCostUyu,
      exchange_rate: sim.exchangeRate,
      created_at: new Date().toISOString()
    };
    setSavedSimulations(prev => [newSaved, ...prev]);
  };

  const handleDeleteSimulation = (id: string) => {
    setSavedSimulations(prev => prev.filter(s => s.id !== id));
  };

  const handleLoadSimulation = (sim: UserSavedSimulation) => {
    handleTabChange('simulator');
  };

  const handleSaveProfile = (updated: Partial<UserImportProfile>) => {
    setUserProfile(prev => ({ ...prev, ...updated }));
  };

  const tabs = [
    { id: 'dashboard', label: 'Resumen Hub', icon: LayoutDashboard },
    { id: 'simulator', label: 'Simulador de Costo', icon: Calculator },
    { id: 'franchise', label: 'Mis Franquicias', icon: ShieldCheck },
    { id: 'simulations', label: 'Cotizaciones Guardadas', icon: Bookmark },
    { id: 'shipments', label: 'Seguimiento de Envíos', icon: Truck },
    { id: 'guide', label: 'Guía de Importación', icon: BookOpen },
    { id: 'ai-chat', label: 'Consultor IA', icon: MessageSquare }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Navigation Tabs Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 overflow-x-auto gap-2">
          <div className="flex items-center gap-1.5 min-w-max">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setIsProfileModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-amber-400 font-bold text-xs rounded-xl shrink-0 transition-colors"
          >
            <MapPin className="w-4 h-4" />
            <span>Suite: {userProfile.suite_number}</span>
          </button>
        </div>

        {/* Tab Content Display */}
        <div>
          {activeTab === 'dashboard' && (
            <ImportHubDashboard
              rule={customsRule}
              declarations={declarations}
              savedSimulations={savedSimulations}
              activeShipments={activeShipments}
              onNavigateTab={handleTabChange}
              onOpenDeclareModal={() => setIsDeclareModalOpen(true)}
              onOpenProfileModal={() => setIsProfileModalOpen(true)}
            />
          )}

          {activeTab === 'simulator' && (
            <ImportSimulator
              couriers={couriers}
              customsRule={customsRule}
              declarations={declarations}
              initialPriceUsd={initialPriceUsd}
              initialWeightKg={initialWeightKg}
              initialTitle={initialTitle}
              onSaveSimulation={handleSaveSimulation}
            />
          )}

          {activeTab === 'franchise' && (
            <MyFranchiseSection
              rule={customsRule}
              declarations={declarations}
              onOpenDeclareModal={() => setIsDeclareModalOpen(true)}
              onDeleteDeclaration={handleDeleteDeclaration}
            />
          )}

          {activeTab === 'simulations' && (
            <MySimulationsSection
              simulations={savedSimulations}
              onDeleteSimulation={handleDeleteSimulation}
              onLoadSimulation={handleLoadSimulation}
            />
          )}

          {activeTab === 'shipments' && (
            <MyShipmentsSection shipments={activeShipments} />
          )}

          {activeTab === 'guide' && (
            <ImportGuideSection />
          )}

          {activeTab === 'ai-chat' && (
            <ImportAIConsultantChat
              couriers={couriers}
              customsRule={customsRule}
              userDeclarations={declarations}
            />
          )}
        </div>

        {/* Modals */}
        <DeclareExternalPurchaseModal
          isOpen={isDeclareModalOpen}
          onClose={() => setIsDeclareModalOpen(false)}
          onSave={handleSaveDeclaration}
          currentYear={customsRule.year}
        />

        <UserCourierProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          profile={userProfile}
          couriers={couriers}
          onSaveProfile={handleSaveProfile}
        />

      </div>
    </div>
  );
};
