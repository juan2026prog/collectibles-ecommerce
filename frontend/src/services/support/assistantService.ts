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
  conversationId?: string | null;
  sessionId?: string;
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  countryCode?: string;
}

export interface AssistantProcessResponse {
  reply: string;
  intent: ChatbotIntent;
  conversationId?: string;
  products?: SearchProductResult[];
  suggestedActions?: string[];
  requiresHumanEscalation?: boolean;
  ticketCreated?: boolean;
}

export interface AssistantSystemConfig {
  chatbot_enabled: boolean;
  openai_enabled: boolean;
  internal_search_enabled: boolean;
  web_research_enabled: boolean;
  order_inquiries_enabled: boolean;
  ticket_creation_enabled: boolean;
  human_support_enabled: boolean;
  model_name: string;
  daily_budget_usd: number;
  monthly_budget_usd: number;
  max_turns_per_conversation: number;
  enabled_countries: string[];
}

/**
 * Verified Customs & Import Guidelines per country
 */
const COUNTRY_IMPORT_GUIDES: Record<string, { summary: string; officialSource: string; verifiedAt: string }> = {
  UY: {
    summary: 'En Uruguay podés importar figuras y coleccionables bajo el régimen de franquicia tributaria (hasta 3 envíos al año de hasta USD 200 cada uno, valor factura en origen, exentos de impuestos de aduana). El producto se adquiere en el retailer oficial o marketplace (Amazon, eBay, etc.), se despacha a Miami y nuestro courier aliado SkyPostal/courier certificado lo entrega en tu domicilio en Montevideo o el interior.',
    officialSource: 'Dirección Nacional de Aduanas (DNA Uruguay) — Decreto 356/014',
    verifiedAt: '2026-10-01'
  },
  AR: {
    summary: 'En Argentina las compras internacionales se procesan bajo el régimen de pequeños envíos o courier oficial puerta a puerta, respetando los topes vigentes de importación personal y tributando el arancel correspondiente según normativa de AFIP/ARCA.',
    officialSource: 'ARCA / AFIP — Régimen Puerta a Puerta y Courier Simplificado',
    verifiedAt: '2026-10-01'
  },
  CL: {
    summary: 'En Chile podés ingresar encomiendas internacionales con exención arancelaria bajo el umbral de minimis vigente o tributando el IVA y arancel aduanero simplificado.',
    officialSource: 'Servicio Nacional de Aduanas de Chile',
    verifiedAt: '2026-10-01'
  },
  PE: {
    summary: 'En Perú las importaciones de uso personal menores a USD 200 están exoneradas de aranceles y tributos de importación bajo el régimen de envíos de entrega rápida de SUNAT.',
    officialSource: 'SUNAT Perú — Envíos de Entrega Rápida D.S. N° 067-2006-EF',
    verifiedAt: '2026-10-01'
  },
  MX: {
    summary: 'En México los paquetes internacionales ingresan por despacho simplificado T-MEC / courier privado con arancel preferencial según el valor del producto.',
    officialSource: 'SAT / Aduanas México — Regla 3.7.5 RCGMCE',
    verifiedAt: '2026-10-01'
  }
};

/**
 * Active Verified Payment Gateways per country
 */
const COUNTRY_PAYMENT_METHODS: Record<string, string> = {
  UY: 'En Uruguay aceptamos pagos locales con Mercado Pago (tarjetas de crédito y débito Visa, Mastercard, OCA, transferencias bancarias y redes de cobranza Abitab/RedPagos) y pagos internacionales autorizados.',
  AR: 'En Argentina aceptamos tarjetas de crédito y débito internacionales y medios de pago autorizados en el checkout.',
  CL: 'En Chile aceptamos tarjetas de crédito/débito y checkout internacional autorizado.',
  PE: 'En Perú aceptamos tarjetas de crédito/débito Visa, Mastercard y pasarela autorizada.',
  MX: 'En México aceptamos tarjetas de crédito/débito y pagos verificados en el checkout.'
};

export class AssistantService {
  private static cachedConfig: AssistantSystemConfig | null = null;
  private static configCacheTime: number = 0;

  /**
   * Fetches Assistant System Config from Supabase with 60s memory cache
   */
  public static async getSystemConfig(): Promise<AssistantSystemConfig> {
    const now = Date.now();
    if (this.cachedConfig && now - this.configCacheTime < 60000) {
      return this.cachedConfig;
    }

    try {
      const { data } = await supabase
        .from('assistant_system_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (data) {
        this.cachedConfig = {
          chatbot_enabled: data.chatbot_enabled ?? true,
          openai_enabled: data.openai_enabled ?? true,
          internal_search_enabled: data.internal_search_enabled ?? true,
          web_research_enabled: data.web_research_enabled ?? false,
          order_inquiries_enabled: data.order_inquiries_enabled ?? true,
          ticket_creation_enabled: data.ticket_creation_enabled ?? true,
          human_support_enabled: data.human_support_enabled ?? false, // 100% IA
          model_name: data.model_name || 'gpt-4o-mini',
          daily_budget_usd: Number(data.daily_budget_usd || 5),
          monthly_budget_usd: Number(data.monthly_budget_usd || 100),
          max_turns_per_conversation: Number(data.max_turns_per_conversation || 40),
          enabled_countries: data.enabled_countries || ['UY', 'AR', 'CL', 'PE', 'MX']
        };
        this.configCacheTime = now;
        return this.cachedConfig;
      }
    } catch (_) {}

    return {
      chatbot_enabled: true,
      openai_enabled: true,
      internal_search_enabled: true,
      web_research_enabled: false,
      order_inquiries_enabled: true,
      ticket_creation_enabled: true,
      human_support_enabled: false, // 100% IA
      model_name: 'gpt-4o-mini',
      daily_budget_usd: 5,
      monthly_budget_usd: 100,
      max_turns_per_conversation: 40,
      enabled_countries: ['UY', 'AR', 'CL', 'PE', 'MX']
    };
  }

  /**
   * Updates Assistant System Config (Superadmin only)
   */
  public static async updateSystemConfig(updates: Partial<AssistantSystemConfig>): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: session } = await supabase.auth.getSession();
      const current = await this.getSystemConfig();

      const { error } = await supabase
        .from('assistant_system_config')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
          updated_by: session?.session?.user?.id || null
        })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;
      this.cachedConfig = null;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error al actualizar configuración' };
    }
  }

  /**
   * Intent Classifier
   */
  public static classifyIntent(text: string): ChatbotIntent {
    const lower = text.toLowerCase();

    if (/(humano|persona|agente|operador|atencion humana|asesor|hablar con alguien|humana)/i.test(lower)) {
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
    if (/(devoluci[oó]n|devolver|cambio|cambiar|roto|dañado|falla|garant[ií]a|reembolso|ticket|reclamo|incidencia)/i.test(lower)) {
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
   * Loads or creates a persistent conversation session in Supabase
   */
  public static async ensureConversation(params: {
    conversationId?: string | null;
    sessionId: string;
    userId?: string | null;
    userEmail?: string | null;
    userName?: string | null;
    countryCode?: string;
  }): Promise<{ id: string; sessionSecret?: string } | null> {
    try {
      // 1. Try to fetch existing
      if (params.conversationId) {
        const { data: existing } = await supabase
          .from('support_conversations')
          .select('id, session_secret')
          .eq('id', params.conversationId)
          .maybeSingle();

        if (existing) return existing;
      }

      // 2. Fetch by session_id
      const { data: bySession } = await supabase
        .from('support_conversations')
        .select('id, session_secret')
        .eq('session_id', params.sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (bySession) return bySession;

      // 3. Create new conversation
      const { data: created, error } = await supabase
        .from('support_conversations')
        .insert({
          session_id: params.sessionId,
          user_id: params.userId || null,
          user_email: params.userEmail || null,
          user_name: params.userName || null,
          country_code: params.countryCode || 'UY',
          status: 'ACTIVE',
          primary_intent: 'GENERAL_SUPPORT'
        })
        .select('id, session_secret')
        .single();

      if (error || !created) return null;
      return created;
    } catch (_) {
      return null;
    }
  }

  /**
   * Persists message to database
   */
  public static async persistMessage(params: {
    conversationId: string;
    senderType: 'USER' | 'ASSISTANT' | 'ADMIN' | 'SYSTEM';
    content: string;
    senderName?: string;
    intentDetected?: string;
    products?: any[];
  }): Promise<void> {
    try {
      await supabase.from('support_messages').insert({
        conversation_id: params.conversationId,
        sender_type: params.senderType,
        sender_name: params.senderName || (params.senderType === 'USER' ? 'Usuario' : 'Collectibles AI'),
        content: params.content,
        intent_detected: params.intentDetected || null,
        products_suggested: params.products || []
      });

      // Update conversation metadata
      await supabase
        .from('support_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          primary_intent: params.intentDetected || undefined
        })
        .eq('id', params.conversationId);
    } catch (_) {}
  }

  /**
   * Loads recent messages for a conversation
   */
  public static async loadMessages(conversationId: string): Promise<ChatMessage[]> {
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error || !data) return [];
      return data.map(item => ({
        id: item.id,
        sender: item.sender_type,
        text: item.content,
        timestamp: item.created_at,
        intent: item.intent_detected as any,
        products: item.products_suggested
      }));
    } catch {
      return [];
    }
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
    const { 
      userMessage, 
      conversationHistory, 
      userId, 
      userEmail, 
      userName,
      countryCode = 'UY' 
    } = options;

    const config = await this.getSystemConfig();

    // 0. CHECK MASTER SWITCH FOR CHATBOT
    if (!config.chatbot_enabled) {
      return {
        reply: 'El Asistente Virtual se encuentra en mantenimiento temporal programado. Podés buscar directamente en el catálogo mediante la barra superior.',
        intent: 'GENERAL_SUPPORT',
        suggestedActions: ['Ver catálogo']
      };
    }

    const intent = this.classifyIntent(userMessage);

    // Ensure conversation record in DB
    const convRecord = await this.ensureConversation({
      conversationId: options.conversationId,
      sessionId: options.sessionId || 'session-default',
      userId,
      userEmail,
      userName,
      countryCode
    });
    const currentConvId = convRecord?.id;

    // Persist incoming USER message
    if (currentConvId) {
      await this.persistMessage({
        conversationId: currentConvId,
        senderType: 'USER',
        content: userMessage,
        senderName: userName || userEmail || 'Usuario',
        intentDetected: intent
      });
    }

    // 1. HUMAN SUPPORT ESCALATION HANDLING (Strict 100% IA Policy)
    if (intent === 'HUMAN_SUPPORT') {
      let reply: string;
      let requiresHumanEscalation = false;
      let suggestedActions = ['Consultar sobre un producto', 'Consultar sobre importaciones', 'Ver estado de mi pedido'];

      if (config.human_support_enabled) {
        reply = 'Te estamos conectando con un operador humano de atención al cliente. Un asesor revisará tu caso en breve.';
        requiresHumanEscalation = true;
        suggestedActions = ['Ver mis tickets', 'Volver al catálogo'];
      } else {
        reply = 'Actualmente la atención al cliente de Collectibles funciona 100% mediante Inteligencia Artificial especializada. No contamos con operadores humanos en vivo en este momento, pero puedo ayudarte a resolver consultas sobre compras, importaciones, estado de pedidos, productos o registrar una incidencia para el equipo.';
        requiresHumanEscalation = false;
      }

      if (currentConvId) {
        await this.persistMessage({
          conversationId: currentConvId,
          senderType: 'ASSISTANT',
          content: reply,
          intentDetected: intent
        });
      }

      return {
        reply,
        intent: 'HUMAN_SUPPORT',
        conversationId: currentConvId,
        requiresHumanEscalation,
        suggestedActions
      };
    }

    // 2. ORDER / SHIPPING STATUS
    if (intent === 'ORDER_STATUS' || intent === 'SHIPPING_STATUS') {
      let reply: string;
      let suggestedActions: string[];

      if (!config.order_inquiries_enabled) {
        reply = 'La consulta automática de pedidos está temporalmente deshabilitada. Podés ver el estado completo en la sección "Mis Pedidos" de tu cuenta.';
        suggestedActions = ['Ir a mis pedidos', 'Consultar sobre importaciones'];
      } else if (!userId) {
        reply = 'Para consultar el estado de tus pedidos y rastreos con total privacidad y seguridad, por favor iniciá sesión en tu cuenta de Collectibles.';
        suggestedActions = ['Iniciar sesión', 'Consultar sobre importaciones'];
      } else {
        const orders = await this.fetchUserOrders(userId);
        if (orders.length === 0) {
          reply = 'No encontramos pedidos activos asociados a tu cuenta en este momento. Si realizaste una compra reciente como invitado, indicanos el número de orden.';
          suggestedActions = ['Buscar figuras', 'Preguntar sobre envíos'];
        } else {
          const latest = orders[0];
          const trackingInfo = latest.tracking_number 
            ? `Número de seguimiento: ${latest.tracking_number}.` 
            : 'Tu paquete está siendo preparado para despacho.';
          const itemsList = latest.items?.map((it: any) => `${it.quantity}x ${it.title}`).join(', ') || 'Productos';

          reply = `Tu último pedido #${latest.order_number || latest.id.slice(0, 8)} (${itemsList}) se encuentra en estado "${latest.status || 'PROCESANDO'}". ${trackingInfo}`;
          suggestedActions = ['Ver detalle del pedido', 'Consultar otro producto'];
        }
      }

      if (currentConvId) {
        await this.persistMessage({
          conversationId: currentConvId,
          senderType: 'ASSISTANT',
          content: reply,
          intentDetected: intent
        });
      }

      return {
        reply,
        intent,
        conversationId: currentConvId,
        suggestedActions
      };
    }

    // 3. IMPORT / FRANCHISE QUESTIONS (Dynamic per country)
    if (intent === 'IMPORT_QUESTION') {
      const guideData = COUNTRY_IMPORT_GUIDES[countryCode] || COUNTRY_IMPORT_GUIDES.UY;
      const reply = `${guideData.summary}\n\n(Información verificada conforme a: ${guideData.officialSource}, vigencia ${guideData.verifiedAt})`;

      if (currentConvId) {
        await this.persistMessage({
          conversationId: currentConvId,
          senderType: 'ASSISTANT',
          content: reply,
          intentDetected: intent
        });
      }

      return {
        reply,
        intent: 'IMPORT_QUESTION',
        conversationId: currentConvId,
        suggestedActions: ['Ver catálogo internacional', 'Ver figuras en stock local']
      };
    }

    // 4. PAYMENT QUESTIONS (Dynamic per country)
    if (intent === 'PAYMENT_QUESTION') {
      const reply = COUNTRY_PAYMENT_METHODS[countryCode] || COUNTRY_PAYMENT_METHODS.UY;

      if (currentConvId) {
        await this.persistMessage({
          conversationId: currentConvId,
          senderType: 'ASSISTANT',
          content: reply,
          intentDetected: intent
        });
      }

      return {
        reply,
        intent: 'PAYMENT_QUESTION',
        conversationId: currentConvId,
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
        userLocale: `es-${countryCode}`
      });

      const matchedProducts = searchRes.products.slice(0, 6);

      // Contextual window: last 4 messages for multi-turn conversational memory
      const recentTurns = conversationHistory.slice(-4).map(m => ({
        role: m.sender === 'USER' ? 'user' : 'assistant',
        content: m.text
      }));

      // Call OpenAI Customer Support AI if enabled
      if (config.openai_enabled) {
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
              conversationContext: recentTurns,
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
              countryCode,
              sessionId: options.sessionId
            },
            fallbackHandler: async () => ({
              reply: searchRes.editorialAnswer?.summary || (matchedProducts.length > 0 ? `Encontré ${matchedProducts.length} opciones en nuestro catálogo.` : 'No encontré figuras exactas con esa descripción, pero podés explorar estas alternativas.'),
              intent,
              suggestedActions: searchRes.relatedQuestions.slice(0, 3)
            })
          });

          if (aiResponse.success && aiResponse.data?.reply) {
            const finalReply = aiResponse.data.reply;
            const finalActions = Array.isArray(aiResponse.data.suggestedActions) ? aiResponse.data.suggestedActions : searchRes.relatedQuestions.slice(0, 3);

            if (currentConvId) {
              await this.persistMessage({
                conversationId: currentConvId,
                senderType: 'ASSISTANT',
                content: finalReply,
                intentDetected: intent,
                products: matchedProducts
              });
            }

            return {
              reply: finalReply,
              intent,
              conversationId: currentConvId,
              products: matchedProducts,
              suggestedActions: finalActions
            };
          }
        } catch (_) {}
      }

      // Grounded deterministic fallback
      const summary = searchRes.editorialAnswer?.summary || (matchedProducts.length > 0 
        ? `Encontré estas opciones para tu consulta:` 
        : `No encontré resultados exactos para "${userMessage}". Podés ver opciones similares a continuación o consultarme por otra figura:`);

      const returnProducts = matchedProducts.length > 0 ? matchedProducts : searchRes.relaxedProducts.slice(0, 4);
      const returnActions = searchRes.relatedQuestions.slice(0, 3);

      if (currentConvId) {
        await this.persistMessage({
          conversationId: currentConvId,
          senderType: 'ASSISTANT',
          content: summary,
          intentDetected: intent,
          products: returnProducts
        });
      }

      return {
        reply: summary,
        intent,
        conversationId: currentConvId,
        products: returnProducts,
        suggestedActions: returnActions
      };
    }

    // 6. DEFAULT GENERAL SUPPORT
    const defaultReply = '¡Hola! Soy el Asistente de Collectibles 2026. Puedo ayudarte a encontrar figuras locales e internacionales, consultar fechas de lanzamiento en Radar, verificar el estado de tus compras o resolver dudas sobre franquicias aduaneras. ¿En qué puedo ayudarte hoy?';
    const defaultActions = [
      'Figuras de Spider-Man',
      'Preventas de Dragon Ball',
      '¿Cómo funciona la franquicia de USD 200?',
      '¿Dónde está mi pedido?'
    ];

    if (currentConvId) {
      await this.persistMessage({
        conversationId: currentConvId,
        senderType: 'ASSISTANT',
        content: defaultReply,
        intentDetected: 'GENERAL_SUPPORT'
      });
    }

    return {
      reply: defaultReply,
      intent: 'GENERAL_SUPPORT',
      conversationId: currentConvId,
      suggestedActions: defaultActions
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
