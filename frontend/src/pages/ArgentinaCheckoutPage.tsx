import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Sparkles, AlertCircle, ShoppingBag, Truck, Info, RefreshCw } from 'lucide-react';
import { ArgentinaCheckoutFlow, ArgentinaCheckoutItem } from '../components/argentina/ArgentinaCheckoutFlow';
import { DEFAULT_DEBLEX_TARIFFS } from '../lib/argentina/pricingEngine';
import { DeblexTariffConfig } from '../lib/argentina/types';

const DEMO_PRESETS: { name: string; description: string; items: ArgentinaCheckoutItem[] }[] = [
  {
    name: 'Pedido Ligero CABA (0.5 kg - USD 24.99)',
    description: '1 Funko Pop (0.50 kg). Demuestra Flete USD 9.50 + Logistic Pack CABA USD 20 = Total logística USD 29.50.',
    items: [
      {
        id: 'demo-1',
        title: 'Funko Pop! Marvel: Spider-Man (Exclusivo)',
        price_usd: 24.99,
        weight_kg: 0.50,
        quantity: 1,
        species_category: 'figuras',
        image: 'https://images.unsplash.com/photo-1608889175123-8ee362201f81?w=150&auto=format&fit=crop&q=80',
      },
    ],
  },
  {
    name: 'Pedido Estándar AMBA (1.75 kg - USD 89.90)',
    description: 'Figura de acción NECA + Figura Bandai (1.75 kg total). Flete USD 33.25 + Logistic Pack AMBA USD 34 = USD 67.25.',
    items: [
      {
        id: 'demo-2',
        title: 'NECA Back to the Future Marty McFly 7-Inch Action Figure',
        price_usd: 44.95,
        weight_kg: 1.00,
        quantity: 1,
        species_category: 'figuras',
        image: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=150&auto=format&fit=crop&q=80',
      },
      {
        id: 'demo-3',
        title: 'Bandai Spirits Ichibansho Dragon Ball Son Goku',
        price_usd: 44.95,
        weight_kg: 0.75,
        quantity: 1,
        species_category: 'figuras',
        image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=150&auto=format&fit=crop&q=80',
      },
    ],
  },
  {
    name: 'Límite Máximo Modalidad A (50.00 kg - USD 380.00)',
    description: 'Lote de colección de exactamente 50.00 kg y FOB USD 380.00. Demuestra que 50.00 kg es permitido.',
    items: [
      {
        id: 'demo-4',
        title: 'Estatua Escala 1/4 Premium Masterpiece Collector Edition',
        price_usd: 380.00,
        weight_kg: 50.00,
        quantity: 1,
        species_category: 'estatuas',
        image: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=150&auto=format&fit=crop&q=80',
      },
    ],
  },
  {
    name: 'Bloqueo Exceso de Peso (50.01 kg - Bloqueado)',
    description: 'Demuestra bloqueo estricto con el mensaje oficial: "Tu envío supera el límite de 50 kg permitido por Deblex..."',
    items: [
      {
        id: 'demo-5',
        title: 'Caja Grande de Coleccionismo Pesado',
        price_usd: 250.00,
        weight_kg: 50.01,
        quantity: 1,
        species_category: 'estatuas',
      },
    ],
  },
  {
    name: 'FOB > USD 400 (Modalidad B - Cotización Especial)',
    description: 'FOB USD 550.00. Demuestra el bloqueo de Modalidad A y botón "Solicitar cotización para importación especial".',
    items: [
      {
        id: 'demo-6',
        title: 'Sideshow Star Wars Darth Vader Premium Format Figure',
        price_usd: 550.00,
        weight_kg: 8.50,
        quantity: 1,
        species_category: 'estatuas',
      },
    ],
  },
];

export const ArgentinaCheckoutPage: React.FC = () => {
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
  const [orderCompletedId, setOrderCompletedId] = useState<string | null>(null);

  const currentPreset = DEMO_PRESETS[selectedPresetIndex];

  const handleCompleteOrder = async (orderPayload: any) => {
    // Mode demo / certification: Simulate persistent audit log
    await new Promise(res => setTimeout(res, 800));
    const fakeOrderId = 'COL-AR-' + Math.floor(100000 + Math.random() * 900000);
    setOrderCompletedId(fakeOrderId);
    return { success: true, orderId: fakeOrderId };
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pt-8 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            to="/shop"
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-amber-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a la tienda
          </Link>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-950/80 text-sky-300 border border-sky-800">
              <Truck className="w-3.5 h-3.5 text-sky-400" />
              Circuito Argentina / Deblex Courier
            </span>
            <Link
              to="/deblex"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
            >
              Portal Operativo Deblex →
            </Link>
          </div>
        </div>

        {/* Demo Selector Header */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-white">
                Selector de Escenarios de Prueba para Compradores Argentinos
              </h2>
            </div>
            <span className="text-[11px] text-gray-400">Certificación Bloque 2</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs">
            {DEMO_PRESETS.map((preset, idx) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  setSelectedPresetIndex(idx);
                  setOrderCompletedId(null);
                }}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  selectedPresetIndex === idx
                    ? 'bg-amber-500/10 border-amber-500 text-amber-300 shadow-sm'
                    : 'bg-gray-950/60 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200'
                }`}
              >
                <span className="font-semibold block truncate">{preset.name.split(' (')[0]}</span>
                <span className="text-[10px] opacity-75 truncate block mt-0.5">
                  {preset.name.includes('(') ? preset.name.substring(preset.name.indexOf('(')) : ''}
                </span>
              </button>
            ))}
          </div>

          <p className="text-xs text-gray-400 bg-gray-950/60 p-2.5 rounded border border-gray-800/80">
            <strong>Escenario activo:</strong> {currentPreset.description}
          </p>
        </div>

        {orderCompletedId ? (
          <div className="bg-gray-900 border border-emerald-800/80 rounded-xl p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-950/80 border border-emerald-600 rounded-full flex items-center justify-center mx-auto text-emerald-400 font-bold text-lg">
              ✓
            </div>
            <h2 className="text-xl font-bold text-white">¡Demostración de Pedido Confirmado!</h2>
            <p className="text-xs text-gray-300 max-w-md mx-auto">
              Se ha simulado exitosamente la creación del pedido con código <strong className="font-mono text-amber-400">{orderCompletedId}</strong> para el circuito Deblex Courier.
            </p>
            <div className="pt-2">
              <button
                onClick={() => setOrderCompletedId(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reiniciar simulación
              </button>
            </div>
          </div>
        ) : (
          <ArgentinaCheckoutFlow
            items={currentPreset.items}
            onCompleteOrder={handleCompleteOrder}
            isLiveCheckoutEnabled={false}
            tariffs={DEFAULT_DEBLEX_TARIFFS}
          />
        )}
      </div>
    </div>
  );
};
