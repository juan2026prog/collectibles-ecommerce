import React, { useState } from 'react';
import { Settings, Shield, DollarSign, Truck, AlertTriangle, Layers, Save, CheckCircle } from 'lucide-react';
import { DeblexTariffConfig, MiamiCentralSuiteConfig } from '../../lib/argentina/types';
import { DEFAULT_DEBLEX_TARIFFS } from '../../lib/argentina/pricingEngine';
import { PIXEL_CODES_MIAMI_SUITE } from '../../lib/argentina/suiteConfig';

interface AdminArgentinaLogisticsProps {
  initialTariffs?: DeblexTariffConfig;
  suiteConfig?: MiamiCentralSuiteConfig;
  onSaveTariffs?: (tariffs: DeblexTariffConfig) => Promise<void>;
}

export const AdminArgentinaLogistics: React.FC<AdminArgentinaLogisticsProps> = ({
  initialTariffs = DEFAULT_DEBLEX_TARIFFS,
  suiteConfig = PIXEL_CODES_MIAMI_SUITE,
  onSaveTariffs,
}) => {
  const [tariffs, setTariffs] = useState<DeblexTariffConfig>(initialTariffs);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = async () => {
    if (!onSaveTariffs) return;
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      await onSaveTariffs(tariffs);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Error al guardar tarifas:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-700/60 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-amber-400" />
            Administración — Argentina & Courier Deblex
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Configuración de suite única en Miami, tarifario versionado, reglas aduaneras de Modalidad A y gobernanza.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-sm rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
        >
          {savedSuccess ? <CheckCircle className="w-4 h-4 text-emerald-950" /> : <Save className="w-4 h-4" />}
          {savedSuccess ? 'Guardado Exitoso' : isSaving ? 'Guardando...' : 'Guardar Parámetros'}
        </button>
      </div>

      {/* Central Suite Protected Info */}
      <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            Suite Central de Miami — Pixel & Codes / Deblex
          </span>
          <span className="text-[10px] bg-amber-950/80 text-amber-300 border border-amber-800 px-2 py-0.5 rounded-full font-mono">
            ÚNICA SUITE PROTEGIDA
          </span>
        </div>
        <p className="text-xs text-gray-400">
          Todas las compras destinadas al circuito argentino se reciben en esta dirección física única. No se crean suites por comprador.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs bg-gray-900/60 p-4 rounded-lg border border-gray-700/40 font-mono">
          <div>
            <span className="text-gray-500 block text-[10px] uppercase">Empresa Operadora</span>
            <span className="text-white font-medium">{suiteConfig.company_name}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-[10px] uppercase">Dirección Línea 1</span>
            <span className="text-white font-medium">{suiteConfig.address_line_1}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-[10px] uppercase">Dirección Línea 2 / Suite</span>
            <span className="text-white font-medium">{suiteConfig.address_line_2}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-[10px] uppercase">Ciudad, Estado & Zip</span>
            <span className="text-white font-medium">
              {suiteConfig.city}, {suiteConfig.state} {suiteConfig.zip_code}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block text-[10px] uppercase">Teléfono de Contacto</span>
            <span className="text-white font-medium">{suiteConfig.phone}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-[10px] uppercase">Partner Logístico</span>
            <span className="text-white font-medium">{suiteConfig.courier_partner}</span>
          </div>
        </div>
      </div>

      {/* Deblex Tariffs Form */}
      <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-5 space-y-4">
        <span className="text-sm font-semibold text-white flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-400" />
          Tarifario Deblex (Versión Activa)
        </span>
        <p className="text-xs text-gray-400">
          Los cambios en el tarifario rigen para futuras cotizaciones y no modifican retroactivamente órdenes ya confirmadas.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block text-gray-400 mb-1 font-medium">Flete Internacional (USD / kg)</label>
            <input
              type="number"
              step="0.5"
              value={tariffs.international_freight_usd_per_kg}
              onChange={e => setTariffs({ ...tariffs, international_freight_usd_per_kg: parseFloat(e.target.value) || 0 })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500 font-mono"
            />
            <span className="text-[10px] text-gray-500 mt-1 block">Regla oficial: USD 19/kg exacto</span>
          </div>

          <div>
            <label className="block text-gray-400 mb-1 font-medium">Logistic Pack CABA (USD)</label>
            <input
              type="number"
              step="1"
              value={tariffs.logistic_pack_caba_usd}
              onChange={e => setTariffs({ ...tariffs, logistic_pack_caba_usd: parseFloat(e.target.value) || 0 })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500 font-mono"
            />
            <span className="text-[10px] text-gray-500 mt-1 block">Fijo por envío: USD 20</span>
          </div>

          <div>
            <label className="block text-gray-400 mb-1 font-medium">Logistic Pack AMBA (USD)</label>
            <input
              type="number"
              step="1"
              value={tariffs.logistic_pack_amba_usd}
              onChange={e => setTariffs({ ...tariffs, logistic_pack_amba_usd: parseFloat(e.target.value) || 0 })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500 font-mono"
            />
            <span className="text-[10px] text-gray-500 mt-1 block">Fijo por envío: USD 34</span>
          </div>

          <div>
            <label className="block text-gray-400 mb-1 font-medium">Logistic Pack Interior (USD)</label>
            <input
              type="number"
              step="1"
              value={tariffs.logistic_pack_interior_usd}
              onChange={e => setTariffs({ ...tariffs, logistic_pack_interior_usd: parseFloat(e.target.value) || 0 })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500 font-mono"
            />
            <span className="text-[10px] text-gray-500 mt-1 block">Fijo por envío: USD 43</span>
          </div>
        </div>
      </div>

      {/* Modalidad A & Customs Rules */}
      <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-5 space-y-4">
        <span className="text-sm font-semibold text-white flex items-center gap-2">
          <Layers className="w-4 h-4 text-sky-400" />
          Límites Normativos de Modalidad A (Pequeño Envío Franquiciado)
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block text-gray-400 mb-1 font-medium">Límite FOB Modalidad A (USD)</label>
            <input
              type="number"
              value={tariffs.max_fob_modalidad_a}
              onChange={e => setTariffs({ ...tariffs, max_fob_modalidad_a: parseFloat(e.target.value) || 0 })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500 font-mono"
            />
            <span className="text-[10px] text-gray-500 mt-1 block">Máximo USD 400.00</span>
          </div>

          <div>
            <label className="block text-gray-400 mb-1 font-medium">Límite de Peso (kg)</label>
            <input
              type="number"
              value={tariffs.max_weight_modalidad_a_kg}
              onChange={e => setTariffs({ ...tariffs, max_weight_modalidad_a_kg: parseFloat(e.target.value) || 0 })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500 font-mono"
            />
            <span className="text-[10px] text-gray-500 mt-1 block">Máximo 50 kg</span>
          </div>

          <div>
            <label className="block text-gray-400 mb-1 font-medium">Unidades por Especie</label>
            <input
              type="number"
              value={tariffs.max_units_per_species_modalidad_a}
              onChange={e => setTariffs({ ...tariffs, max_units_per_species_modalidad_a: parseInt(e.target.value, 10) || 0 })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500 font-mono"
            />
            <span className="text-[10px] text-gray-500 mt-1 block">Máximo 3 unidades</span>
          </div>

          <div>
            <label className="block text-gray-400 mb-1 font-medium">Envíos Anuales por CUIT</label>
            <input
              type="number"
              value={tariffs.max_operations_per_year_modalidad_a}
              onChange={e => setTariffs({ ...tariffs, max_operations_per_year_modalidad_a: parseInt(e.target.value, 10) || 0 })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500 font-mono"
            />
            <span className="text-[10px] text-gray-500 mt-1 block">Máximo 5 operaciones</span>
          </div>
        </div>
      </div>
    </div>
  );
};
