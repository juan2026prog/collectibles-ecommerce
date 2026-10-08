import { supabase } from '../../lib/supabase';
import { CollectiblesSearchService, type SearchProductResult } from '../search/collectiblesSearchService';
import { executeAI } from '../ai/aiGateway';

export type ChatbotIntent = 
  | 'PRODUCT_SEARCH'
  | 'PRODUCT_RECOMMENDATION'
  | 'PRODUCT_COMPARISON'
  | 'ORDER_STATUS'
  | 'SHIPPING_STATUS'
  | 'IMPORT_QUESTION'
  | 'PAYMENT_QUESTION'
  | 'RETURNS_SUPPORT'
  | 'GENERAL_SUPPORT'
  | 'RELEASE_INFORMATION'
  | 'HUMAN_SUPPORT'
  | 'UNKNOWN';

export interface ChatMessage {
  id: string;
  sender: 'USER' | 'ASSISTANT' | 'ADMIN' | 'SYSTEM';
  text: string;
  timestamp: string;
  intent?: ChatbotIntent;
  products?: SearchProductResult[];
  suggestedActions?: string[];
  isError?: boolean;
}

export interface AssistantProcessOptions {
  userMessage: string;
  conversationHistory: ChatMessage[];
  userId?: string | null;
  userEmail?: string | null;
  countryCode?: string;
}

export interface AssistantProcessResponse {
  reply: string;
  intent: ChatbotIntent;
  products?: SearchProductResult[];
  suggestedActions?: string[];
  requiresHumanEscalation?: boolean;
  ticketCreated?: boolean;
}

/**
 * CUSTOMS & IMPORT GUIDELINES VERIFIED PER COUNTRY
 */
const COUNTRY_IMPORT_GUIDES: Record<string, string> = {
  UY: 'En Uruguay podés importar figuras y coleccionables bajo el régimen de franquicia tributaria (hasta 3 envíos al año de hasta USD 200 cada uno, valor factura en origen, exentos de impuestos de aduana). El producto se adquiere en el retailer oficial o marketplace (Amazon, eBay, etc.), se despacha a Miami y nuestro courier aliado SkyPostal/courier certificado lo entrega en tu domicilio en Montevideo o el interior.',
  AR: 'En Argentina las compras internacionales se procesan bajo el régimen de pequeños envíos o courier oficial puerta a puerta, respetando los topes vigentes de importación personal y tributando el arancel correspondiente según normativa de AFIP/ARCA.',
  CL: 'En Chile podés ingresar encomiendas internacionales con exención arancelaria bajo el umbral de minimis vigente o tributando el IVA y arancel aduanero simplificado.',
  PE: 'En Perú las importaciones de uso personal menores a USD 200 están exoneradas de aranceles y tributos de importación bajo el régimen de envíos de entrega rápida de SUNAT.',
  MX: 'En México los paquetes internacionales ingresan por despacho simplificado T-MEC / courier privado con arancel preferencial según el valor del producto.'
};

/**
 * PAYMENT METHODS TRULY SUPPORTED IN COLLECTIBLES 2026
 */
const PAYMENT_METHODS_EXPLANATION = 
  'En Collectibles aceptamos pagos locales con Mercado Pago (tarjetas de crédito y débito Visa, Mastercard, OCA, transferencias bancarias y redes de cobranza Abitab/RedPagos) y pagos internacionales autorizados.';

export class AssistantService {
  /**
   * Deterministic Intent Classifier
   */
  public static classifyIntent(text: string): ChatbotIntent {
    const lower = text.toLowerCase();

    if (/(humano|persona|agente|operador|atencion humana|asesor|hablar con alguien)/i.test(lower)) {
      return 'HUMAN_SUPPORT';
    }
    if (/(mi pedido|mis pedidos|d[oó]nde est[aá] mi pedido|numero de orden|orden|estado de pedido|rastreo|tracking|trackear)/i.test(lower)) {
      return 'ORDER_STATUS';
    }
    if (/(envio|envío|miami|courier|demora|cuanto tarda|cuándo llega|cuando llega|skypostal|aduana|despacho)/i.test(lower)) {
      return 'SHIPPING_STATUS';
    }
    if (/(franquicia|importar|importaci[oó]n|traer de usa|amazon|ebay|comprar afuera|usd 200)/i.test(lower)) {
      return 'IMPORT_QUESTION';
    }
    if (/(pago|pagar|tarjeta|mercadopago|mercado pago|cuotas|transferencia|efectivo|abitab|redpagos)/i.test(lower)) {
      return 'PAYMENT_QUESTION';
    }
    if (/(devoluci[oó]n|devolver|cambio|cambiar|roto|dañado|falla|garant[ií]a|reembolso)/i.test(lower)) {
      return 'RETURNS_SUPPORT';
    }
    if (/(preventa|lanzamiento|radar|sale|saldra|saldrá|anuncio|fecha de salida)/i.test(lower)) {
      return 'RELEASE_INFORMATION';
    }
    if (/(vs|comparar|diferencia entre|cu[aá]l es mejor|mafex o|shf o)/i.test(lower)) {
      return 'PRODUCT_COMPARISON';
    }
    if (/(recomiendame|recomiendas|regalo|para alguien|empezar a coleccionar|consejo)/i.test(lower)) {
      return 'PRODUCT_RECOMMENDATION';
    }
    if (/(busco|figura|precio|cuanto cuesta|tienen|hay|stock|muestrame|mostrame|neca|hot toys|batman|dragon ball|marvel|spiderman)/i.test(lower)) {
      return 'PRODUCT_SEARCH';
    }

    return 'GENERAL_SUPPORT';
  }

  /**
   * Handles authenticated Order and Shipping inquiries safely
   */
  public static async fetchUserOrders(userId?: string | null): Promise<any[]> {
    if (!userId) return [];
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, status, total, shipping_status, tracking_number, created_at, items:order_items(title, quantity, price)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error || !data) return [];
      return data;
    } catch {
      return [];
    }
  }

  /**
   * Main Dispatcher for the Assistant conversation
   */
  public static async processMessage(options: AssistantProcessOptions): Promise<AssistantProcessResponse> {
    const { userMessage, userId, userEmail, countryCode = 'UY' } = options;
    const intent = this.classifyIntent(userMessage);

    // 1. HUMAN SUPPORT ESCALATION
    if (intent === 'HUMAN_SUPPORT') {
      return {
        reply: 'Te estoy conectando con nuestro equipo humano de atención al cliente. Un asesor de coleccionables revisará tu consulta a la brevedad.',
        intent: 'HUMAN_SUPPORT',
        requiresHumanEscalation: true,
        suggestedActions: ['Ver mis tickets', 'Volver a buscar figuras']
      };
    }

    // 2. ORDER / SHIPPING STATUS
    if (intent === 'ORDER_STATUS' || intent === 'SHIPPING_STATUS') {
      if (!userId) {
        return {
          reply: 'Para ver el estado de tus pedidos y envíos en curso con total privacidad, por favor iniciá sesión en tu cuenta de Collectibles.',
          intent,
          suggestedActions: ['Iniciar sesión', 'Consultar sobre importaciones']
        };
      }

      const orders = await this.fetchUserOrders(userId);
      if (orders.length === 0) {
        return {
          reply: 'No encontramos pedidos activos asociados a tu cuenta en este momento. Si realizaste una compra reciente como invitado, indicanos el número de orden.',
          intent,
          suggestedActions: ['Buscar figuras', 'Preguntar sobre envíos']
        };
      }

      const latest = orders[0];
      const trackingInfo = latest.tracking_number 
        ? `Número de seguimiento: ${latest.tracking_number}.` 
        : 'Tu paquete está siendo preparado para despacho.';
      const itemsList = latest.items?.map((it: any) => `${it.quantity}x ${it.title}`).join(', ') || 'Productos';

      return {
        reply: `Tu último pedido #${latest.order_number || latest.id.slice(0, 8)} (${itemsList}) se encuentra en estado "${latest.status || 'PROCESANDO'}". ${trackingInfo}`,
        intent,
        suggestedActions: ['Ver detalle del pedido', 'Consultar otro producto']
      };
    }

    // 3. IMPORT / FRANCHISE QUESTIONS
    if (intent === 'IMPORT_QUESTION') {
      const guide = COUNTRY_IMPORT_GUIDES[countryCode] || COUNTRY_IMPORT_GUIDES.UY;
      return {
        reply: guide,
        intent: 'IMPORT_QUESTION',
        suggestedActions: ['Ver catálogo internacional', 'Ver figuras en stock local']
      };
    }

    // 4. PAYMENT QUESTIONS
    if (intent === 'PAYMENT_QUESTION') {
      return {
        reply: PAYMENT_METHODS_EXPLANATION,
        intent: 'PAYMENT_QUESTION',
        suggestedActions: ['Ver figuras disponibles', 'Consultar formas de envío']
      };
    }

    // 5. PRODUCT SEARCH, RECOMMENDATION, COMPARISON OR RELEASES
    if (intent === 'PRODUCT_SEARCH' || intent === 'PRODUCT_RECOMMENDATION' || intent === 'PRODUCT_COMPARISON' || intent === 'RELEASE_INFORMATION') {
      const searchRes = await CollectiblesSearchService.search({
        query: userMessage,
        limitLocal: 6,
        limitInternational: 6,
        limitRadar: 4,
        enableAIEditorial: true,
        userLocale: 'es-UY'
      });

      const matchedProducts = searchRes.products.slice(0, 6);

      // Call OpenAI Customer Support AI for enriched response if available
      try {
        const aiResponse = await executeAI<{
          reply: string;
          intent: string;
          suggestedActions: string[];
        }>({
          engine: 'CUSTOMER_SUPPORT_AI',
          country: (countryCode as any) || 'UY',
          operation: 'customer_support_reply',
          payload: {
            userQuery: userMessage,
            intent,
            productsFound: matchedProducts.map(p => ({
              title: p.title,
              price: p.price,
              currency: p.currency,
              price_usd: p.price_in_usd,
              brand: p.brand?.name,
              is_international: p.is_international
            })),
            radarCount: searchRes.radarDrops.length
          },
          context: {
            userEmail,
            countryCode
          },
          fallbackHandler: async () => ({
            reply: searchRes.editorialAnswer?.summary || (matchedProducts.length > 0 ? `Encontré ${matchedProducts.length} opciones en nuestro catálogo.` : 'No encontré figuras exactas con esa descripción, pero podés explorar estas alternativas.'),
            intent,
            suggestedActions: searchRes.relatedQuestions.slice(0, 3)
          })
        });

        if (aiResponse.success && aiResponse.data?.reply) {
          return {
            reply: aiResponse.data.reply,
            intent,
            products: matchedProducts,
            suggestedActions: Array.isArray(aiResponse.data.suggestedActions) ? aiResponse.data.suggestedActions : searchRes.relatedQuestions.slice(0, 3)
          };
        }
      } catch (_) {}

      // Fallback response grounded in verified database results
      const summary = searchRes.editorialAnswer?.summary || (matchedProducts.length > 0 
        ? `Encontré estas opciones para tu consulta:` 
        : `No encontré resultados exactos para "${userMessage}". Podés ver opciones similares a continuación o consultarme por otra figura:`);

      return {
        reply: summary,
        intent,
        products: matchedProducts.length > 0 ? matchedProducts : searchRes.relaxedProducts.slice(0, 4),
        suggestedActions: searchRes.relatedQuestions.slice(0, 3)
      };
    }

    // 6. DEFAULT GENERAL SUPPORT
    return {
      reply: '¡Hola! Soy el Asistente de Collectibles 2026. Puedo ayudarte a encontrar figuras locales e internacionales, consultar fechas de lanzamiento en Radar, verificar el estado de tus compras o resolver dudas sobre franquicias aduaneras. ¿En qué puedo ayudarte hoy?',
      intent: 'GENERAL_SUPPORT',
      suggestedActions: [
        'Figuras de Spider-Man',
        'Preventas de Dragon Ball',
        '¿Cómo funciona la franquicia de USD 200?',
        '¿Dónde está mi pedido?'
      ]
    };
  }

  /**
   * Creates a formal Support Ticket in Supabase
   */
  public static async createSupportTicket(params: {
    userId?: string | null;
    userEmail: string;
    userName?: string;
    subject: string;
    category?: string;
    conversationId?: string;
    relatedOrderId?: string;
  }): Promise<{ success: boolean; ticketId?: string; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          user_id: params.userId || null,
          user_email: params.userEmail,
          user_name: params.userName || null,
          subject: params.subject,
          category: params.category || 'GENERAL_SUPPORT',
          conversation_id: params.conversationId || null,
          related_order_id: params.relatedOrderId || null,
          status: 'OPEN',
          priority: 'MEDIUM'
        })
        .select('id')
        .single();

      if (error) throw error;
      return { success: true, ticketId: data.id };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error al crear ticket' };
    }
  }
}
