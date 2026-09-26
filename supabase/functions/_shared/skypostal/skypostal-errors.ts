// supabase/functions/_shared/skypostal/skypostal-errors.ts

export class SkyPostalError extends Error {
  public code: string;
  public details?: any;

  constructor(message: string, code: string = 'SKYPOSTAL_ERROR', details?: any) {
    super(message);
    this.name = 'SkyPostalError';
    this.code = code;
    this.details = details;
  }
}

export class SkyPostalAuthError extends SkyPostalError {
  constructor(message: string = 'Invalid or missing SkyPostal authentication credentials', details?: any) {
    super(message, 'AUTH_ERROR', details);
    this.name = 'SkyPostalAuthError';
  }
}

export class SkyPostalValidationError extends SkyPostalError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'SkyPostalValidationError';
  }
}

export class SkyPostalPreviewBlockedError extends SkyPostalError {
  constructor(marketCountry: string) {
    super(
      `Operación bloqueada: el mercado ${marketCountry} se encuentra en modo PREVIEW. No se permiten envíos ni transacciones reales.`,
      'PREVIEW_MODE_BLOCKED',
      { country: marketCountry }
    );
    this.name = 'SkyPostalPreviewBlockedError';
  }
}

export class SkyPostalKillSwitchActiveError extends SkyPostalError {
  constructor(scope: 'global' | 'market', target?: string) {
    super(
      `SkyPostal logistics kill-switch is ACTIVE (${scope}${target ? `: ${target}` : ''}). Shipments and carrier calls are paused.`,
      'KILL_SWITCH_ACTIVE',
      { scope, target }
    );
    this.name = 'SkyPostalKillSwitchActiveError';
  }
}
