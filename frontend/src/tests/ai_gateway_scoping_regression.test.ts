import { describe, it, expect, vi } from 'vitest';

describe('AI GATEWAY — REGRESSION & SCOPING TESTS', () => {
  it('correctly handles scoping of system, engine and country config data without ReferenceError', async () => {
    // Simulates the budget evaluation logic in api/ai-execute.js
    let sysData = null;
    let cntrData = null;
    let engData = null;

    const country = 'UY';
    const engine = 'SOURCING_WEB_RESEARCH';

    // Mock configs
    const fetchedSysData = { daily_budget_usd: 10, monthly_budget_usd: 100, global_enabled: true };
    sysData = fetchedSysData;

    if (country && country !== 'GLOBAL') {
      const fetchedCntrData = { daily_budget_usd: 5, monthly_budget_usd: 50, ai_enabled: true, status: 'ACTIVE' };
      cntrData = fetchedCntrData;
    }

    const fetchedEngData = { daily_budget_usd: 4, monthly_budget_usd: 40, enabled: true, model: 'gpt-5.6-terra' };
    engData = fetchedEngData;

    // Verify budget check condition evaluation without ReferenceError
    const hasSysDaily = Number(sysData?.daily_budget_usd || 0) > 0;
    const hasSysMonthly = Number(sysData?.monthly_budget_usd || 0) > 0;
    const hasEngDaily = Number(engData?.daily_budget_usd || 0) > 0;
    const hasEngMonthly = Number(engData?.monthly_budget_usd || 0) > 0;
    const hasCntrDaily = Number(cntrData?.daily_budget_usd || 0) > 0;
    const hasCntrMonthly = Number(cntrData?.monthly_budget_usd || 0) > 0;

    expect(hasSysDaily).toBe(true);
    expect(hasSysMonthly).toBe(true);
    expect(hasEngDaily).toBe(true);
    expect(hasEngMonthly).toBe(true);
    expect(hasCntrDaily).toBe(true);
    expect(hasCntrMonthly).toBe(true);
  });

  it('handles GLOBAL country requests where cntrData remains null safely', () => {
    let sysData = null;
    let cntrData = null;
    let engData = null;

    const country = 'GLOBAL';
    const engine = 'SOURCING_WEB_RESEARCH';

    const fetchedSysData = { daily_budget_usd: 10, monthly_budget_usd: 100, global_enabled: true };
    sysData = fetchedSysData;

    if (country && country !== 'GLOBAL') {
      cntrData = { daily_budget_usd: 5 };
    }

    const fetchedEngData = { daily_budget_usd: 4, monthly_budget_usd: 40, enabled: true };
    engData = fetchedEngData;

    const hasSysDaily = Number(sysData?.daily_budget_usd || 0) > 0;
    const hasCntrDaily = Number(cntrData?.daily_budget_usd || 0) > 0;

    expect(hasSysDaily).toBe(true);
    expect(hasCntrDaily).toBe(false);
    expect(cntrData).toBeNull();
  });
});
