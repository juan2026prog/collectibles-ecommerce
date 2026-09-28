import { describe, expect, it } from 'vitest';
import { autopilotPolicyEngine } from '../services/sourcing/autopilot/policyEngine';

describe('Part 4 controlled automation', () => {
  it('keeps autopilot execution dependent on explicit feature toggles', () => {
    const settings:any = { mode:'AUTOPILOT', is_kill_switch_active:false, auto_publish:false, auto_purchase:false };
    const product:any = {
      brand:'Hasbro', category_name:'Figures', product_type:'STANDARD', opportunity_score:100,
      offers:[{id:'o1',source:'amazon',price:20,seller_rating:100,stock:5,condition:'new'}],
      selected_source_id:'o1', authenticity:{status:'VERIFIED_OFFICIAL'},
      financials:{real_cost_puesto_usd:25,current_sale_price_usd:40,margin_percent:37.5,profit_usd:15},
      uruguay_market:{match_confidence:1,total_listings:0,market_position:'CHEAPER'}
    };
    const rules:any[]=[{scope:'GLOBAL',identifier:'all',is_active:true,min_margin_percent:15,min_profit_usd:2,min_opportunity_score:80,min_seller_score:90,min_stock:1}];
    const result=autopilotPolicyEngine.evaluateProduct(product,settings,rules);
    expect(result.decision).toBe('PUBLICAR');
    expect(result.executionMode).toBe('REQUIRES_APPROVAL');
  });
});
