import { LandedCostEngine } from './landedCostEngine';
import { CourierEngine, DEFAULT_COURIERS } from './courierEngine';
import { CustomsEngine, DEFAULT_UY_CUSTOMS_RULE } from './customsEngine';
import type { LandedCostSimulation } from '../types';

export interface AIConsultantResponse {
  answer: string;
  suggestedAction?: 'SIMULATE' | 'VIEW_FRANCHISE' | 'COMPARE_COURIERS' | 'VIEW_SHIPMENTS';
  simulationResult?: LandedCostSimulation;
  directHighlights?: {
    label: string;
    value: string;
  }[];
}

export class ImportAIConsultant {
  public static processQuery({
    query,
    userState = { usedShipments: 0, usedAmountUsd: 0, preferredCourier: 'puntomio' },
    productContext
  }: {
    query: string;
    userState?: { usedShipments: number; usedAmountUsd: number; preferredCourier?: string };
    productContext?: { priceUsd: number; weightKg: number; title: string };
  }): AIConsultantResponse {
    const q = (query || '').toLowerCase().trim();
    const customsEngine = new CustomsEngine(DEFAULT_UY_CUSTOMS_RULE);
    const courierEngine = new CourierEngine(DEFAULT_COURIERS);
    const landedEngine = new LandedCostEngine(DEFAULT_UY_CUSTOMS_RULE, DEFAULT_COURIERS);

    const summary = customsEngine.getSummary(userState);

    // 1. Preguntas sobre franquicias restantes o cupos
    if (q.includes('franquicia') && (q.includes('cuanta') || q.includes('cuánta') || q.includes('quedan') || q.includes('disponible') || q.includes('tengo'))) {
      return {
        answer: `Tenés **${summary.remainingShipments} franquicia(s) disponible(s)** de las ${summary.maxShipments} anuales permitidas para 2026. Tu saldo disponible para compras exentas de aranceles es de **USD ${summary.remainingQuotaUsd.toFixed(2)}** (del tope anual de USD 800.00).`,
        suggestedAction: 'VIEW_FRANCHISE',
        directHighlights: [
          { label: 'Franquicias restantes', value: `${summary.remainingShipments} de ${summary.maxShipments}` },
          { label: 'Cupo disponible', value: `USD ${summary.remainingQuotaUsd.toFixed(2)}` },
          { label: 'Monto utilizado', value: `USD ${summary.usedAmountUsd.toFixed(2)}` }
        ]
      };
    }

    // 2. Preguntas sobre gasto acumulado o saldo anual
    if (q.includes('gastado') || q.includes('llevo') || q.includes('saldo') || q.includes('acumulado')) {
      return {
        answer: `Llevás acumulado un consumo de **USD ${summary.usedAmountUsd.toFixed(2)}** en **${summary.usedShipments} envío(s)** durante el año 2026. Te queda un saldo estimado de **USD ${summary.remainingQuotaUsd.toFixed(2)}** y **${summary.remainingShipments} envío(s)** restantes con 0% de tributos aduaneros.`,
        suggestedAction: 'VIEW_FRANCHISE',
        directHighlights: [
          { label: 'Consumido 2026', value: `USD ${summary.usedAmountUsd.toFixed(2)}` },
          { label: 'Saldo anual restante', value: `USD ${summary.remainingQuotaUsd.toFixed(2)}` }
        ]
      };
    }

    // 3. ¿Qué pasa si ya no tengo franquicias?
    if (q.includes('sin franquicia') || q.includes('agot') || q.includes('si ya usé') || q.includes('si ya use') || q.includes('todas mis franquicias')) {
      return {
        answer: '¡No te preocupes! **No disponer de franquicias NO te impide comprar**. En Uruguay podés ingresar productos bajo el **Régimen Simplificado**, abonando el 60% de tributos sobre el valor factura (con un mínimo de USD 20). Import Hub calcula automáticamente ambos escenarios para que siempre elijas la opción más conveniente.',
        suggestedAction: 'SIMULATE',
        directHighlights: [
          { label: 'Alternativa principal', value: 'Régimen Simplificado (60%)' },
          { label: 'Bloqueo aduanero', value: 'No existe impedimento' }
        ]
      };
    }

    // 4. Comparación de couriers para un peso específico (ej. "más barato para 2.5 kg")
    const weightMatch = q.match(/(\d+[.,]?\d*)\s*kg/i);
    if (q.includes('courier') || q.includes('barato') || q.includes('costo por kg') || q.includes('efectivo')) {
      const targetWeight = weightMatch ? parseFloat(weightMatch[1].replace(',', '.')) : (productContext?.weightKg || 1.5);
      const compared = courierEngine.compareAll(targetWeight);
      const best = compared[0];

      return {
        answer: `Para un peso de **${targetWeight} kg**, la opción de menor costo total es **${best?.courierName || 'PuntoMio'}** con **USD ${best?.totalCourierUsd.toFixed(2)}** (costo efectivo de **USD ${best?.effectiveCostPerKgUsd.toFixed(2)}/kg**). A continuación podés ver la comparativa de todas las empresas:`,
        suggestedAction: 'COMPARE_COURIERS',
        directHighlights: compared.map(c => ({
          label: `${c.courierName} (${c.physicalWeightKg} kg)`,
          value: `USD ${c.totalCourierUsd.toFixed(2)} (USD ${c.effectiveCostPerKgUsd.toFixed(2)}/kg)`
        }))
      };
    }

    // 5. Presupuesto total: "Tengo USD 150 en total. ¿Qué podría traer?"
    const budgetMatch = q.match(/(?:usd|\$)\s*(\d+)/i) || q.match(/(\d+)\s*(?:usd|dolares|dólares)/i);
    if (q.includes('presupuesto') || q.includes('tengo') || q.includes('puedo comprar') || budgetMatch) {
      const budget = budgetMatch ? parseFloat(budgetMatch[1]) : 150;
      const estimatedFreight = 20; // Average 1kg item
      const maxProductValue = Math.max(10, budget - estimatedFreight);

      return {
        answer: `Con un presupuesto total de **USD ${budget}** puesto en Uruguay, podés buscar productos de hasta aproximadamente **USD ${maxProductValue}** en origen (asumiendo un flete estimado de ~USD ${estimatedFreight} con tu franquicia activa). Podés usar el buscador con el filtro de presupuesto para ver opciones disponibles.`,
        suggestedAction: 'SIMULATE',
        directHighlights: [
          { label: 'Presupuesto total', value: `USD ${budget.toFixed(2)}` },
          { label: 'Valor máximo producto', value: `USD ${maxProductValue.toFixed(2)}` },
          { label: 'Flete estimado', value: `~USD ${estimatedFreight.toFixed(2)}` }
        ]
      };
    }

    // 6. Simulación basada en producto o fallback general
    const prodPrice = productContext?.priceUsd || 89.00;
    const prodWeight = productContext?.weightKg || 1.20;
    const prodTitle = productContext?.title || 'Figura Coleccionable';

    const sim = landedEngine.simulate({
      productPriceUsd: prodPrice,
      weightKg: prodWeight,
      courierCode: userState.preferredCourier || 'puntomio',
      usedShipments: userState.usedShipments,
      usedAmountUsd: userState.usedAmountUsd
    });

    return {
      answer: `Para **${prodTitle}** (USD ${prodPrice.toFixed(2)}, peso aprox. ${prodWeight} kg), el flete con **${sim.courier.courierName}** es de **USD ${sim.courier.totalCourierUsd.toFixed(2)}** (costo efectivo: USD ${sim.courier.effectiveCostPerKgUsd.toFixed(2)}/kg).`,
      suggestedAction: 'SIMULATE',
      simulationResult: sim,
      directHighlights: [
        { label: 'Producto', value: `USD ${prodPrice.toFixed(2)}` },
        { label: 'Courier', value: `USD ${sim.courier.totalCourierUsd.toFixed(2)}` },
        { label: 'Tributos aduaneros', value: sim.customs.taxUsd === 0 ? 'USD 0.00 (Franquicia)' : `USD ${sim.customs.taxUsd.toFixed(2)}` },
        { label: 'Total puesto en Uruguay', value: `USD ${sim.totalLandedCostUsd.toFixed(2)} (~$${sim.totalLandedCostUyu} UYU)` }
      ]
    };
  }
}
