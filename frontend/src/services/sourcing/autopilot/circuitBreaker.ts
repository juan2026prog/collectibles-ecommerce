import { auditService } from './auditService';
import type { AutopilotVisualStatus } from '../../../types/sourcingAutopilot';

export class AutopilotCircuitBreaker {
  private consecutivePurchaseErrors = 0;
  private consecutiveRetailerErrors = 0;
  private isSuspended = false;
  private isKillSwitchEngaged = false;

  /**
   * Triggers Emergency Kill Switch (Manual Admin Stop).
   */
  async engageKillSwitch(reason = 'Interrupción manual de emergencia por el administrador.'): Promise<void> {
    this.isKillSwitchEngaged = true;

    await auditService.logAuditEntry({
      action: 'KILL_SWITCH_ENGAGED',
      previous_state: 'ACTIVE',
      new_state: 'SUSPENDED',
      reason,
      actor: 'ADMIN',
      mode: 'OFF',
      result: 'SUCCESS'
    });

    await auditService.createAlert({
      priority: 'CRITICAL',
      title: 'EMERGENCIA: KILL SWITCH ACTIVADO',
      message: reason,
      code: 'KILL_SWITCH_ENGAGED'
    });
  }

  /**
   * Resets Emergency Kill Switch and Circuit Breaker errors.
   */
  async resetCircuitBreaker(): Promise<void> {
    this.consecutivePurchaseErrors = 0;
    this.consecutiveRetailerErrors = 0;
    this.isSuspended = false;
    this.isKillSwitchEngaged = false;

    await auditService.logAuditEntry({
      action: 'CIRCUIT_BREAKER_RESET',
      previous_state: 'SUSPENDED',
      new_state: 'ACTIVE',
      reason: 'Circuit Breaker rearmado por el administrador.',
      actor: 'ADMIN',
      mode: 'OFF',
      result: 'SUCCESS'
    });
  }

  /**
   * Registers a purchase attempt failure.
   */
  async registerPurchaseError(errorMessage: string): Promise<boolean> {
    this.consecutivePurchaseErrors += 1;

    if (this.consecutivePurchaseErrors >= 3) {
      await this.tripCircuitBreaker(
        `Circuit Breaker Disparado: 3 errores consecutivos de compra. Último error: ${errorMessage}`
      );
      return true; // Tripped
    }
    return false;
  }

  /**
   * Registers a retailer API failure.
   */
  async registerRetailerError(retailer: string, errorMessage: string): Promise<boolean> {
    this.consecutiveRetailerErrors += 1;

    if (this.consecutiveRetailerErrors >= 5) {
      await this.tripCircuitBreaker(
        `Circuit Breaker Disparado: 5 fallos consecutivos en retailer ${retailer}. Error: ${errorMessage}`
      );
      return true; // Tripped
    }
    return false;
  }

  /**
   * Resets error count after a clean successful execution.
   */
  registerSuccess(): void {
    this.consecutivePurchaseErrors = 0;
    this.consecutiveRetailerErrors = 0;
  }

  /**
   * Status check.
   */
  getCircuitBreakerStatus(): {
    isSuspended: boolean;
    isKillSwitchEngaged: boolean;
    consecutivePurchaseErrors: number;
    consecutiveRetailerErrors: number;
    visualStatus: AutopilotVisualStatus;
  } {
    const suspended = this.isSuspended || this.isKillSwitchEngaged;
    return {
      isSuspended: this.isSuspended,
      isKillSwitchEngaged: this.isKillSwitchEngaged,
      consecutivePurchaseErrors: this.consecutivePurchaseErrors,
      consecutiveRetailerErrors: this.consecutiveRetailerErrors,
      visualStatus: suspended ? 'SUSPENDED' : 'ACTIVE'
    };
  }

  private async tripCircuitBreaker(reason: string): Promise<void> {
    this.isSuspended = true;

    await auditService.logAuditEntry({
      action: 'CIRCUIT_BREAKER_TRIPPED',
      previous_state: 'ACTIVE',
      new_state: 'SUSPENDED',
      reason,
      actor: 'SYSTEM',
      mode: 'OFF',
      result: 'BLOCKED',
      error_message: reason
    });

    await auditService.createAlert({
      priority: 'CRITICAL',
      title: 'AUTOPILOT SUSPENDIDO (Circuit Breaker)',
      message: reason,
      code: 'CIRCUIT_BREAKER_TRIPPED'
    });
  }
}

export const autopilotCircuitBreaker = new AutopilotCircuitBreaker();
