// supabase/functions/_shared/logistics-rules.ts

export interface RuleCondition {
  field: string;      // 'total_weight', 'destination_department', 'vendor_id'
  operator: string;   // '>', '<', '=', '!=', 'includes'
  value: any;
}

export interface RuleAction {
  type: string;       // 'exclude_provider', 'force_provider', 'add_charge'
  value: any;
}

export interface LogisticsRule {
  id: string;
  name: string;
  trigger_event: 'checkout_rate' | 'shipment_routing';
  conditions: RuleCondition[];
  actions: RuleAction[];
}

/**
 * Evaluates conditions against a given context object
 */
function evaluateConditions(conditions: RuleCondition[], context: any): boolean {
  if (!conditions || conditions.length === 0) return true;

  for (const cond of conditions) {
    const contextValue = context[cond.field];
    if (contextValue === undefined) return false;

    let match = false;
    switch (cond.operator) {
      case '>':
        match = Number(contextValue) > Number(cond.value);
        break;
      case '<':
        match = Number(contextValue) < Number(cond.value);
        break;
      case '=':
      case '==':
        match = String(contextValue).toLowerCase() === String(cond.value).toLowerCase();
        break;
      case '!=':
        match = String(contextValue).toLowerCase() !== String(cond.value).toLowerCase();
        break;
      case 'includes':
        match = Array.isArray(contextValue) 
          ? contextValue.includes(cond.value) 
          : String(contextValue).toLowerCase().includes(String(cond.value).toLowerCase());
        break;
      default:
        match = false;
    }

    // All conditions in a rule must match (AND logical mapping)
    if (!match) return false;
  }

  return true;
}

/**
 * Main function to evaluate logistics rules from database
 */
export async function evaluateLogisticsRules(
  supabaseClient: any,
  triggerEvent: 'checkout_rate' | 'shipment_routing',
  context: {
    total_weight?: number;
    destination_department?: string;
    destination_city?: string;
    vendor_id?: string;
    [key: string]: any;
  }
): Promise<RuleAction[]> {
  try {
    const { data: rules, error } = await supabaseClient
      .from('logistics_rules')
      .select('*')
      .eq('trigger_event', triggerEvent)
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error || !rules) {
      console.warn("[Rules Engine] Error fetching logistics rules:", error?.message);
      return [];
    }

    const appliedActions: RuleAction[] = [];

    for (const rule of rules) {
      const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
      if (evaluateConditions(conditions, context)) {
        console.log(`[Rules Engine] Rule matched: "${rule.name}"`);
        const actions = Array.isArray(rule.actions) ? rule.actions : [];
        appliedActions.push(...actions);
      }
    }

    return appliedActions;
  } catch (err: any) {
    console.error("[Rules Engine Error]:", err.message);
    return [];
  }
}

/**
 * Pre-validation checks for shipments before dispatching to couriers
 */
export function validateShipmentBeforeDispatch(
  shipment: any,
  creds: any
): { valid: boolean; error?: string } {
  
  if (!shipment) return { valid: false, error: "Objeto shipment no definido." };

  // 1. Recipient Address validation
  if (!shipment.customer_address || shipment.customer_address.trim().length < 5) {
    return { valid: false, error: "Dirección de destino inválida o muy corta (mínimo 5 caracteres)." };
  }

  // 2. Recipient Name validation
  if (!shipment.customer_name || shipment.customer_name.trim().length < 2) {
    return { valid: false, error: "Nombre de destinatario inválido o faltante." };
  }

  // 3. Recipient Phone validation
  const phoneClean = String(shipment.customer_phone || "").replace(/\s/g, "");
  if (phoneClean.length < 7) {
    return { valid: false, error: "El teléfono del destinatario es obligatorio y debe tener al menos 7 dígitos." };
  }

  // 4. Weight validation
  if (Number(shipment.package_weight) <= 0) {
    return { valid: false, error: "El peso del paquete debe ser mayor a 0 kg." };
  }

  // 5. Credentials check
  if (!creds) {
    return { valid: false, error: "Credenciales del transportista no configuradas." };
  }

  return { valid: true };
}
