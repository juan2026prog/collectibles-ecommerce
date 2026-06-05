import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Bot, LayoutTemplate, Settings, Users, Megaphone, LineChart
} from 'lucide-react';
import TemplateEditor from '../../components/admin/automations/TemplateEditor';
import SegmentBuilder from '../../components/admin/automations/SegmentBuilder';
import AutomationsDashboard from '../../components/admin/automations/AutomationsDashboard';
import CampaignManager from '../../components/admin/automations/CampaignManager';
// We need a Customers view and Preorders view. Let's import them or create placeholders.
import AdminUsers from './AdminUsers';
import AdminPreorders from './AdminPreorders';

export default function AdminAutomations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'dashboard';

  const setTab = (tab: string) => {
    setSearchParams({ tab });
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LineChart },
    { id: 'customers', label: 'Clientes', icon: Users },
    { id: 'templates', label: 'Plantillas', icon: LayoutTemplate },
    { id: 'segments', label: 'Segmentos', icon: Users },
    { id: 'campaigns', label: 'Campañas', icon: Megaphone },
    { id: 'preorders', label: 'Preventas', icon: Bot }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary-500" />
            Clientes & Automatizaciones
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Gestiona la comunicación, el CRM y las reglas comerciales.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit overflow-x-auto border border-white/10">
        {tabs.map(tab => (
          <button 
            key={tab.id} 
            onClick={() => setTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-colors whitespace-nowrap ${
              currentTab === tab.id 
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {currentTab === 'dashboard' && <AutomationsDashboard />}
        {currentTab === 'customers' && <AdminUsers />}
        {currentTab === 'templates' && <TemplateEditor />}
        {currentTab === 'segments' && <SegmentBuilder />}
        {currentTab === 'campaigns' && <CampaignManager />}
        {currentTab === 'preorders' && <AdminPreorders />}
      </div>
    </div>
  );
}
