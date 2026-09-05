export interface GuideTopic {
  id: string;
  title: string;
  summary: string;
  icon: string;
  category: 'FRANQUICIA' | 'COURIERS' | 'LOGISTICA' | 'COSTOS';
  keyPoints: string[];
}

export interface ImportTip {
  title: string;
  description: string;
}

export const IMPORT_GUIDE_TOPICS: GuideTopic[] = [
  {
    id: 'que-es-una-franquicia',
    title: '¿Qué es una Franquicia Aduanera?',
    summary: 'Beneficio legal en Uruguay que permite a mayores de 18 años ingresar hasta 3 encomiendas internacionales al año libres de tributos.',
    icon: '🛡️',
    category: 'FRANQUICIA',
    keyPoints: [
      'Cada persona física cuenta con un cupo anual de hasta 3 envíos que no pagan tributos ni aranceles de importación.',
      'El monto acumulado máximo en el año civil es de USD 800.',
      'El límite individual por envío es de hasta USD 200 de valor de factura en origen.',
      'El peso físico máximo permitido por envío es de 20 kg (no aplica peso volumétrico).'
    ]
  },
  {
    id: 'como-funciona-casilla-usa',
    title: '¿Cómo funciona una casilla postal en Miami?',
    summary: 'Tu dirección física en Florida para recibir compras de tiendas internacionales y enviarlas a Uruguay.',
    icon: '📦',
    category: 'COURIERS',
    keyPoints: [
      'Al registrarte en un courier (USX, PuntoMio, Urubox), te asignan una dirección en Miami con tu número de Suite personal.',
      'Al comprar en Amazon, eBay o Sideshow, colocas esa dirección como tu Shipping Address.',
      'El courier recibe tu paquete, lo clasifica, emite la guía aérea y gestiona el ingreso aduanero ante la DNA.'
    ]
  },
  {
    id: 'costo-efectivo-por-kg',
    title: 'Diferencia: Tarifa publicada vs. Costo Efectivo por kg',
    summary: 'Por qué el courier con la tarifa publicada más baja no siempre es el más económico.',
    icon: '⚖️',
    category: 'COSTOS',
    keyPoints: [
      'Muchos couriers publican tarifas de USD 14/kg, pero luego suman cargos de handling (USD 5), tasas URSEC, seguro y despacho local.',
      'El Costo Efectivo por kg real se calcula como: (Costo Total Facturado por el Courier) / (Peso Físico Real).',
      'Collectibles Import Hub calcula el costo efectivo exacto de cada empresa para que no tengas sorpresas.'
    ]
  },
  {
    id: 'que-pasa-sin-franquicia',
    title: '¿Qué ocurre si ya utilicé mis 3 franquicias?',
    summary: 'Alternativas aduaneras permitidas: nunca quedas bloqueado para comprar coleccionables.',
    icon: '🔄',
    category: 'FRANQUICIA',
    keyPoints: [
      'Haber agotado tus 3 franquicias anuales no significa que no puedas seguir trayendo figuras o cartas.',
      'Aplica el Régimen Simplificado (Decreto 60%): tributas el 60% sobre el valor factura del producto (con un mínimo de USD 20).',
      'El trámite sigue siendo 100% express a través de tu courier de confianza sin requerir despachante de aduana privado para envíos de hasta USD 200 y 20 kg.'
    ]
  },
  {
    id: 'regulaciones-ursec-baterias',
    title: 'Regulaciones Especiales: URSEC y Baterías',
    summary: 'Requisitos para figuras con luces LED, control remoto o módulos inalámbricos.',
    icon: '⚡',
    category: 'LOGISTICA',
    keyPoints: [
      'Las figuras con luces LED simples no requieren permiso URSEC.',
      'Los artículos con conectividad Bluetooth, WiFi o radiofrecuencia (ej. drones o robots) requieren tramitar el permiso VUCE/URSEC antes del arribo.',
      'La mayoría de los couriers ofrecen el servicio de gestión de URSEC por una pequeña tasa adicional.'
    ]
  }
];

export const COLLECTIBLE_IMPORT_TIPS: ImportTip[] = [
  {
    title: 'Consolidación Inteligente de Cajas',
    description: 'Si compras figuras pequeñas o cómics en distintas tiendas, pide a tu courier que las consolide en un solo paquete para gastar solo una franquicia y optimizar los tramos de peso.'
  },
  {
    title: 'Factura Comercial Detallada (Invoice)',
    description: 'Asegúrate de que la factura de eBay o Amazon detalle el valor real del producto y no incluya cobros de impuestos locales de USA que puedan inflar el valor en aduana.'
  },
  {
    title: 'Protección para Coleccionistas (Double Box)',
    description: 'Solicita a tu courier empaque reforzado o "double boxing" para estatuas de resina, cajas selladas de Funko Pop o cajas de figuras de edición limitada para evitar daños en tránsito.'
  },
  {
    title: 'Monitorea el Límite de USD 800',
    description: 'Distribuye el valor de tus compras a lo largo del año para no exceder los USD 800 de cupo acumulado entre tus 3 franquicias.'
  }
];
