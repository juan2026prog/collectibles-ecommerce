import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { CONTRACTUAL_RATE_CARDS } from '../lib/skypostal/skypostalPricing';

describe('SkyPostal Contractual Rates — Programmatic Parity vs Official Excel Spreadsheets', () => {
  const rateFiles = [
    { code: 'CL-340', file: 'C:/Users/juanm/Downloads/SkyPostal 2026 FMA Rates - CL Custom.xlsx' },
    { code: 'PE-340', file: 'C:/Users/juanm/Downloads/SkyPostal 2026 FMA Rates - PE Custom.xlsx' },
    { code: 'BR-340', file: 'C:/Users/juanm/Downloads/SkyPostal 2026 FMA Rates - BR Custom.xlsx' },
    { code: 'CO-340', file: 'C:/Users/juanm/Downloads/SkyPostal 2026 FMA Rates - CO Custom.xlsx' },
    { code: 'EC-340', file: 'C:/Users/juanm/Downloads/SkyPostal 2026 FMA Rates - EC Custom.xlsx' },
    { code: 'MX-340', file: 'C:/Users/juanm/Downloads/SkyPostal 2026 FMA Rates - MX Custom.xlsx' },
    { code: 'MX-340-R', file: 'C:/Users/juanm/Downloads/SkyPostal 2026 FMA Rates - MX Regulated Custom.xlsx' }
  ];

  rateFiles.forEach(rf => {
    it(`verifies 100% bracket and metadata equality for ${rf.code}`, () => {
      const codeCard = CONTRACTUAL_RATE_CARDS[rf.code];
      expect(codeCard).toBeDefined();

      const wb = XLSX.readFile(rf.file);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      let gateway = '', clearance = '', delivery = '', serviceCode = 0, add500g = 0;
      const excelBrackets: { weight_kg: number; price_usd: number }[] = [];

      data.forEach(r => {
        if (!r) return;
        if (r[0] === 'Gateway') gateway = String(r[2]).trim();
        if (r[0] === 'Clearance') clearance = String(r[2]).trim();
        if (r[0] === 'Delivery') delivery = String(r[2]).trim();
        if (r[0] === 'Service Code') serviceCode = Number(r[2]);
        if (typeof r[0] === 'string' && r[0].toLowerCase().includes("add'l 500")) {
          add500g = Number(Number(r[2]).toFixed(2));
        }
        if (typeof r[1] === 'number' && typeof r[2] === 'number') {
          excelBrackets.push({ weight_kg: Number(r[1].toFixed(1)), price_usd: Number(r[2].toFixed(2)) });
        }
      });

      expect(codeCard.gateway).toBe(gateway);
      expect(codeCard.clearanceType).toBe(clearance);
      expect(codeCard.deliveryType).toBe(delivery);
      expect(codeCard.serviceCode).toBe(serviceCode);
      expect(codeCard.additional500gPrice).toBe(add500g);

      expect(codeCard.brackets.length).toBe(excelBrackets.length);
      excelBrackets.forEach((eb, idx) => {
        const cb = codeCard.brackets[idx];
        expect(cb.weight_kg).toBe(eb.weight_kg);
        expect(cb.price_usd).toBe(eb.price_usd);
      });
    });
  });
});
