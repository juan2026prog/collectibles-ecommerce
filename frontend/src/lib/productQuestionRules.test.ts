import { describe, it, expect } from 'vitest';
import { canAskProductQuestion } from './productQuestionRules';
import { notificationTemplates } from '../../../supabase/functions/_shared/notificationTemplates';

describe('Product Q&A System — Unit & Integration Tests', () => {
  describe('Rule 1: canAskProductQuestion (Canonical Exclusion & Inclusion)', () => {
    it('allows questions for official Collectibles products in Uruguay', () => {
      const officialProduct = {
        id: 'prod-uy-1',
        name: 'Camiseta Oficial Celeste 2026',
        vendor_id: null,
        is_international: false,
        source_provider: null,
        inventory_tracking: true,
      };
      const result = canAskProductQuestion(officialProduct);
      expect(result.allowed).toBe(true);
      expect(result.isCollectiblesProduct).toBe(true);
      expect(result.isVendorProduct).toBe(false);
    });

    it('allows questions for local Vendor catalog products', () => {
      const vendorProduct = {
        id: 'prod-vendor-1',
        name: 'Figura de Acción Goku SSJ',
        vendor_id: 'vendor-uuid-123',
        is_international: false,
        source_provider: null,
      };
      const result = canAskProductQuestion(vendorProduct);
      expect(result.allowed).toBe(true);
      expect(result.isVendorProduct).toBe(true);
      expect(result.isCollectiblesProduct).toBe(false);
    });

    it('blocks questions for international catalog items (flag is_international = true)', () => {
      const intlProduct = {
        id: 'prod-intl-1',
        name: 'Funko Pop Exclusivo US',
        is_international: true,
        source_provider: null,
      };
      const result = canAskProductQuestion(intlProduct);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('internacional');
    });

    it('blocks questions for Zinc / Amazon / eBay / BestBuy scraped items', () => {
      const amazonItem = {
        id: 'prod-zinc-1',
        name: 'Lego Star Wars Millennium Falcon',
        is_international: false,
        source_provider: 'zinc',
      };
      expect(canAskProductQuestion(amazonItem).allowed).toBe(false);

      const amazonProvider = {
        id: 'prod-amz-1',
        name: 'Hot Toys Batman',
        source_provider: 'amazon',
      };
      expect(canAskProductQuestion(amazonProvider).allowed).toBe(false);

      const ebayProvider = {
        id: 'prod-ebay-1',
        name: 'Vintage Card 1999',
        source_provider: 'ebay',
      };
      expect(canAskProductQuestion(ebayProvider).allowed).toBe(false);
    });

    it('blocks questions if international_products table record is linked', () => {
      const linkedIntl = {
        id: 'prod-linked-1',
        name: 'Imported Statue',
        international_products: [{ id: 'intl-rec-1', source_url: 'https://amazon.com/dp/xyz' }],
      };
      expect(canAskProductQuestion(linkedIntl).allowed).toBe(false);
    });

    it('returns false for null or undefined product', () => {
      expect(canAskProductQuestion(null).allowed).toBe(false);
      expect(canAskProductQuestion(undefined).allowed).toBe(false);
    });
  });

  describe('Rule 2: Notification Templates & Deep Links', () => {
    it('generates correct vendor notification payload with deep link for received question', () => {
      const rendered = notificationTemplates.product_question_received({
        productTitle: 'Figura Goku',
        productId: 'q-999',
        questionText: '¿Viene en caja cerrada?',
        isVendor: true,
      });

      expect(rendered.push.title).toContain('Nueva pregunta sobre un producto');
      expect(rendered.push.body).toContain('Figura Goku');
      expect(rendered.push.body).toContain('¿Viene en caja cerrada?');
      expect(rendered.deepLink).toBe('https://collectibles.uy/vendor?tab=questions');
      expect(rendered.email.subject).toContain('Nueva pregunta en: Figura Goku');
      expect(rendered.email.html).toContain('Responder pregunta');
      expect(rendered.email.html).toContain('https://collectibles.uy/vendor?tab=questions');
    });

    it('generates correct admin notification payload for official product questions', () => {
      const rendered = notificationTemplates.product_question_received({
        productTitle: 'Camiseta Oficial',
        productId: 'q-100',
        questionText: '¿Tienen talle XL disponible?',
        isVendor: false,
      });

      expect(rendered.deepLink).toBe('https://collectibles.uy/admin/questions');
      expect(rendered.email.html).toContain('https://collectibles.uy/admin/questions');
    });

    it('generates correct customer notification payload with #pregunta-{id} anchor deep link', () => {
      const rendered = notificationTemplates.product_question_answered({
        productTitle: 'Figura Goku',
        productSlug: 'figura-goku-ssj',
        questionId: 'q-999',
        questionText: '¿Viene en caja cerrada?',
        answerText: 'Sí, viene sellada de fábrica con holograma de autenticidad.',
        answeredBy: 'Collectibles',
      });

      expect(rendered.push.title).toContain('Respondieron tu pregunta');
      expect(rendered.push.body).toContain('Figura Goku');
      expect(rendered.push.body).toContain('Sí, viene sellada de fábrica con holograma de autenticidad.');
      expect(rendered.deepLink).toBe('https://collectibles.uy/p/figura-goku-ssj#pregunta-q-999');
      expect(rendered.email.subject).toContain('Respondieron tu pregunta en: Figura Goku');
      expect(rendered.email.html).toContain('https://collectibles.uy/p/figura-goku-ssj#pregunta-q-999');
      expect(rendered.email.html).toContain('Ver producto');
    });
  });

  describe('Rule 3: Question and Answer Constraints Validation', () => {
    it('validates question length boundaries (min 5, max 1000)', () => {
      const validateQuestion = (q: string) => {
        const trimmed = q.trim();
        if (trimmed.length < 5) return 'La pregunta debe tener al menos 5 caracteres.';
        if (trimmed.length > 1000) return 'La pregunta no puede superar los 1000 caracteres.';
        return null;
      };

      expect(validateQuestion('Hola')).toBe('La pregunta debe tener al menos 5 caracteres.');
      expect(validateQuestion('¿Hay stock?')).toBeNull();
      expect(validateQuestion('A'.repeat(1001))).toBe('La pregunta no puede superar los 1000 caracteres.');
    });

    it('validates answer length boundaries (min 2, max 2000)', () => {
      const validateAnswer = (a: string) => {
        const trimmed = a.trim();
        if (trimmed.length < 2) return 'La respuesta debe tener al menos 2 caracteres.';
        if (trimmed.length > 2000) return 'La respuesta no puede superar los 2000 caracteres.';
        return null;
      };

      expect(validateAnswer(' ')).toBe('La respuesta debe tener al menos 2 caracteres.');
      expect(validateAnswer('Sí')).toBeNull();
      expect(validateAnswer('A'.repeat(2001))).toBe('La respuesta no puede superar los 2000 caracteres.');
    });
  });

  describe('Rule 4: Multi-portal & Multi-channel Isolation', () => {
    it('verifies Vendor Questions are tagged and mapped correctly', () => {
      const vendorA_Question = {
        id: 'q-1',
        product_id: 'prod-vendor-a',
        vendor_id: 'vendor-A',
        status: 'pending',
        answers: [],
      };

      const vendorB_Id = 'vendor-B';
      const isAuthorizedToAnswer = (q: typeof vendorA_Question, currentVendorId: string, isAdmin: boolean) => {
        if (isAdmin) return true;
        return q.vendor_id === currentVendorId;
      };

      expect(isAuthorizedToAnswer(vendorA_Question, 'vendor-A', false)).toBe(true);
      expect(isAuthorizedToAnswer(vendorA_Question, vendorB_Id, false)).toBe(false);
      expect(isAuthorizedToAnswer(vendorA_Question, vendorB_Id, true)).toBe(true); // Admin moderation
    });
  });
});
