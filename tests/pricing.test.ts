import { describe, it, expect } from 'vitest';
import { roundTo, calculatePrices, formatCurrency } from '../src/utils/pricing';
import type { Product, AppSettings } from '../src/types';

describe('Pricing utilities (Finding 6 - Arbitrary precision & Float mitigation)', () => {
  describe('roundTo', () => {
    it('handles IEEE 754 precision issues accurately', () => {
      // 0.1 + 0.2 in JS float is 0.30000000000000004
      expect(roundTo(0.1 + 0.2, 2)).toBe(0.3);
      expect(roundTo(1.005, 2)).toBe(1.01);
      expect(roundTo(35.255, 2)).toBe(35.26);
    });

    it('safely handles zero, negative, and invalid values', () => {
      expect(roundTo(0, 2)).toBe(0);
      expect(roundTo(-5.456, 2)).toBe(-5.46);
      expect(roundTo(NaN, 2)).toBe(0);
      expect(roundTo(Infinity, 2)).toBe(0);
    });
  });

  describe('formatCurrency', () => {
    it('formats USD, BS, and COP correctly', () => {
      expect(formatCurrency(1250.5, 'USD')).toBe('$1,250.50');
      expect(formatCurrency(50000, 'COP')).toContain('50.000 COP');
      expect(formatCurrency(450.75, 'BS')).toContain('450,75');
    });
  });

  describe('calculatePrices', () => {
    const mockSettings: AppSettings = {
      companyName: 'Test Corp',
      rif: 'J-12345678-9',
      rifType: 'J',
      address: 'Calle Principal',
      defaultMargin: 30, // 30%
      defaultVAT: 16,    // 16%
      tasaBCV: 60.00,
      tasaMonitor: 70.00,
      tasaTH: 70.00,
      tasaCOP: 4000,
      marginMayorista: 10,
      marginEspecial: 15,
    };

    const mockProduct: Product = {
      id: 'prod-1',
      sku: 'SKU-001',
      name: 'Filtro de Aceite',
      category: 'Repuestos',
      cost: 10.00,
      costType: 'BCV',
      freight: 2.00, // Total cost = $12.00
      stock: 50,
      minStock: 5,
    };

    it('calculates standard prices with cost, freight, margin, and VAT', () => {
      const prices = calculatePrices(mockProduct, mockSettings);

      // costUSD = 10 + 2 = 12.00
      expect(prices.baseCost).toBe(12.00);

      // priceBeforeVat = 12 * 1.30 = 15.60
      // basePrice = 15.60 * 1.16 = 18.096 -> roundTo 18.10
      expect(prices.basePrice).toBe(18.10);
      expect(prices.finalPriceUSD).toBe(18.10);

      // VED = 18.10 * 60 = 1086.00
      expect(prices.finalPriceVED).toBe(1086.00);

      // COP = 18.10 * 4000 = 72400
      expect(prices.finalPriceCOP).toBe(72400);
    });

    it('applies price list discounts when no custom margin exists', () => {
      const pricesMayorista = calculatePrices(mockProduct, mockSettings, 'Mayorista');
      // priceBeforeVat = 15.60, discounted 10% = 14.04, + 16% VAT = 16.2864 -> 16.29
      expect(pricesMayorista.basePrice).toBe(16.29);

      const pricesEspecial = calculatePrices(mockProduct, mockSettings, 'Especial');
      // priceBeforeVat = 15.60, discounted 15% = 13.26, + 16% VAT = 15.3816 -> 15.38
      expect(pricesEspecial.basePrice).toBe(15.38);
    });

    it('preserves custom margin without price list discount overriding it', () => {
      const customProduct: Product = {
        ...mockProduct,
        customMargin: 50, // 50%
      };

      const prices = calculatePrices(customProduct, mockSettings, 'Mayorista');
      // cost = 12.00, margin = 50% -> 18.00, no discount applied because customMargin exists
      // basePrice = 18.00 * 1.16 = 20.88
      expect(prices.margin).toBe(50);
      expect(prices.basePrice).toBe(20.88);
    });

    it('correctly executes TH logic (Finding 7 - Business logic preserved)', () => {
      const thProduct: Product = {
        ...mockProduct,
        costType: 'TH',
      };

      const prices = calculatePrices(thProduct, mockSettings);
      // basePrice = 18.10
      // bolivaresExact = 18.10 * 70 = 1267.00
      expect(prices.finalPriceVED).toBe(1267.00);
      // finalPriceUSD = 1267.00 / 60 = 21.1166... -> 21.12
      expect(prices.finalPriceUSD).toBe(21.12);
    });
  });
});
