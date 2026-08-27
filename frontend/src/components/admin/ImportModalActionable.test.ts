import { describe, it, expect } from 'vitest';

export function calculateActionableRows(rows: any[], importMode: 'update_only' | 'create_only' | 'upsert') {
  if (!rows) return [];
  return rows.filter(r => {
    if (r.operation === 'invalid' || (r.errors && r.errors.length > 0)) return false;
    if (importMode === 'update_only') return r.operation === 'update';
    if (importMode === 'create_only') return r.operation === 'create';
    return r.operation === 'create' || r.operation === 'update';
  });
}

export function getConfirmButtonText(actionableCount: number): string {
  if (actionableCount === 0) return 'NO HAY CAMBIOS PARA IMPORTAR';
  if (actionableCount === 1) return 'CONFIRMAR E IMPORTAR 1 PRODUCTO';
  return `CONFIRMAR E IMPORTAR ${actionableCount} PRODUCTOS`;
}

describe('ImportModal Actionable Rows & Button State Logic', () => {
  it('TEST 0 CAMBIOS (update_only mode, 456 rows all unchanged)', () => {
    const rows = Array.from({ length: 456 }).map((_, i) => ({
      rowIndex: i + 2,
      operation: 'unchanged',
      errors: []
    }));

    const actionable = calculateActionableRows(rows, 'update_only');
    expect(actionable.length).toBe(0);

    const btnText = getConfirmButtonText(actionable.length);
    expect(btnText).toBe('NO HAY CAMBIOS PARA IMPORTAR');

    const isDisabled = actionable.length === 0;
    expect(isDisabled).toBe(true);
  });

  it('TEST 1 UPDATE (update_only mode, 1 update out of 456 rows)', () => {
    const rows = Array.from({ length: 455 }).map((_, i) => ({
      rowIndex: i + 2,
      operation: 'unchanged',
      errors: []
    }));
    rows.push({ rowIndex: 457, operation: 'update', errors: [] });

    const actionable = calculateActionableRows(rows, 'update_only');
    expect(actionable.length).toBe(1);

    const btnText = getConfirmButtonText(actionable.length);
    expect(btnText).toBe('CONFIRMAR E IMPORTAR 1 PRODUCTO');

    const isDisabled = actionable.length === 0;
    expect(isDisabled).toBe(false);
  });

  it('TEST N CREATES (create_only mode, 5 creates out of 10 rows)', () => {
    const rows = [
      ...Array.from({ length: 5 }).map((_, i) => ({ rowIndex: i + 2, operation: 'create', errors: [] })),
      ...Array.from({ length: 5 }).map((_, i) => ({ rowIndex: i + 7, operation: 'unchanged', errors: [] }))
    ];

    const actionable = calculateActionableRows(rows, 'create_only');
    expect(actionable.length).toBe(5);

    const btnText = getConfirmButtonText(actionable.length);
    expect(btnText).toBe('CONFIRMAR E IMPORTAR 5 PRODUCTOS');

    const isDisabled = actionable.length === 0;
    expect(isDisabled).toBe(false);
  });

  it('TEST REJECTED / INVALID ROWS ARE EXCLUDED FROM ACTIONABLE ROWS', () => {
    const rows = [
      { rowIndex: 2, operation: 'invalid', errors: ['Marca inexistente'] },
      { rowIndex: 3, operation: 'update', errors: ['Precio negativo'] }
    ];

    const actionable = calculateActionableRows(rows, 'update_only');
    expect(actionable.length).toBe(0);

    const btnText = getConfirmButtonText(actionable.length);
    expect(btnText).toBe('NO HAY CAMBIOS PARA IMPORTAR');
  });
});
