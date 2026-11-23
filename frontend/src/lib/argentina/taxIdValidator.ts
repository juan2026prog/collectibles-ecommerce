// frontend/src/lib/argentina/taxIdValidator.ts
/**
 * Validator for Argentine Tax Identifiers (CUIT / CUIL / CDI / DNI / Pasaporte)
 * Standard Luhn-like algorithm for CUIT/CUIL:
 * Prefix (2 digits) + DNI (8 digits) + Check Digit (1 digit) = 11 digits
 * Multipliers: [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
 */

import { CustomerTaxIdValidation } from './types';

export function validateArgentineTaxId(
  input: string,
  expectedType: 'CUIT' | 'CUIL' | 'CDI' | 'PASAPORTE' = 'CUIT'
): CustomerTaxIdValidation {
  const raw = (input || '').trim();
  const clean = raw.replace(/\D/g, '');

  if (expectedType === 'PASAPORTE') {
    const isValidPassport = raw.length >= 6 && raw.length <= 15;
    return {
      document_type: 'PASAPORTE',
      document_number: raw,
      clean_number: raw.toUpperCase(),
      is_valid_format: isValidPassport,
      error: isValidPassport ? undefined : 'El formato del pasaporte es inválido (6-15 caracteres).',
    };
  }

  // CUIT / CUIL / CDI validation
  if (clean.length !== 11) {
    return {
      document_type: expectedType,
      document_number: raw,
      clean_number: clean,
      is_valid_format: false,
      error: `${expectedType} debe contener exactamente 11 dígitos.`,
    };
  }

  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i], 10) * multipliers[i];
  }

  const mod11 = sum % 11;
  let checkDigit = 11 - mod11;
  if (checkDigit === 11) checkDigit = 0;
  if (checkDigit === 10) checkDigit = 9;

  const providedCheckDigit = parseInt(clean[10], 10);
  const isValid = checkDigit === providedCheckDigit;

  return {
    document_type: expectedType,
    document_number: raw,
    clean_number: clean,
    is_valid_format: isValid,
    error: isValid ? undefined : `El dígito verificador del ${expectedType} no es válido.`,
  };
}

/**
 * Formats a clean 11-digit CUIT into XX-XXXXXXXX-X
 */
export function formatCUIT(cuit: string): string {
  const clean = (cuit || '').replace(/\D/g, '');
  if (clean.length !== 11) return cuit;
  return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`;
}
