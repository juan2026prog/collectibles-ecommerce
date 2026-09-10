import { describe, it, expect, beforeEach } from 'vitest';
import { autopilotCircuitBreaker } from '../services/sourcing/autopilot/circuitBreaker';

describe('Sourcing Autopilot — Circuit Breaker & Kill Switch Tests', () => {
  beforeEach(async () => {
    await autopilotCircuitBreaker.resetCircuitBreaker();
  });

  it('engages Emergency Kill Switch immediately on admin demand', async () => {
    await autopilotCircuitBreaker.engageKillSwitch('Prueba de Kill Switch');
    const status = autopilotCircuitBreaker.getCircuitBreakerStatus();
    expect(status.isKillSwitchEngaged).toBe(true);
    expect(status.visualStatus).toBe('SUSPENDED');
  });

  it('trips Circuit Breaker automatically after 3 consecutive purchase errors', async () => {
    let tripped = await autopilotCircuitBreaker.registerPurchaseError('Error 1');
    expect(tripped).toBe(false);

    tripped = await autopilotCircuitBreaker.registerPurchaseError('Error 2');
    expect(tripped).toBe(false);

    tripped = await autopilotCircuitBreaker.registerPurchaseError('Error 3');
    expect(tripped).toBe(true); // Tripped on 3rd failure!

    const status = autopilotCircuitBreaker.getCircuitBreakerStatus();
    expect(status.isSuspended).toBe(true);
    expect(status.visualStatus).toBe('SUSPENDED');
  });

  it('trips Circuit Breaker automatically after 5 consecutive retailer API errors', async () => {
    for (let i = 1; i <= 4; i++) {
      const tripped = await autopilotCircuitBreaker.registerRetailerError('amazon', `API Timeout ${i}`);
      expect(tripped).toBe(false);
    }

    const finalTrip = await autopilotCircuitBreaker.registerRetailerError('amazon', 'API Timeout 5');
    expect(finalTrip).toBe(true);

    const status = autopilotCircuitBreaker.getCircuitBreakerStatus();
    expect(status.isSuspended).toBe(true);
  });

  it('resets error counters upon clean execution success', async () => {
    await autopilotCircuitBreaker.registerPurchaseError('Error 1');
    autopilotCircuitBreaker.registerSuccess();
    const status = autopilotCircuitBreaker.getCircuitBreakerStatus();
    expect(status.consecutivePurchaseErrors).toBe(0);
  });
});
