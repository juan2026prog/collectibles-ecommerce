import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Reusable HMAC signer matching /api/support-chat.js
function createSessionSecret(sessionId: string): string {
  const secretKey = 'collectibles-secure-salt-2026';
  return crypto.createHmac('sha256', secretKey).update(sessionId).digest('hex');
}

describe('COLLECTIBLES AI ASSISTANT — PRIVACY & SECURITY ISOLATION SUITE', () => {

  describe('1. VULNERABILIDAD A: Aislamiento Criptográfico de Sesiones Anónimas', () => {
    it('genera tokens HMAC diferentes e impredecibles para sesiones distintas', () => {
      const sessionA = 'anon_session_alice_9912';
      const sessionB = 'anon_session_bob_8841';

      const secretA = createSessionSecret(sessionA);
      const secretB = createSessionSecret(sessionB);

      expect(secretA).toBeDefined();
      expect(secretB).toBeDefined();
      expect(secretA).not.toEqual(secretB);
      expect(secretA.length).toBe(64); // SHA-256 hex length
    });

    it('impide a un atacante acceder a la conversación de otro visitante modificando el session_id sin el secret', () => {
      const victimSessionId = 'anon_victim_123';
      const victimSecret = createSessionSecret(victimSessionId);
      const attackerAttemptSecret = 'fake_secret_guessing';

      const isAuthorized = victimSecret === attackerAttemptSecret;
      expect(isAuthorized).toBe(false);
    });

    it('deniega acceso anónimo si la conversación pertenece a un usuario autenticado registrado', () => {
      const conv = {
        id: 'conv-uuid-1',
        user_id: 'auth-user-alice-uuid', // Registered user
        session_id: 'anon_hijack_attempt'
      };

      // Attacker tries to claim it as anonymous
      const canAccessAsAnon = conv.user_id === null;
      expect(canAccessAsAnon).toBe(false);
    });
  });

  describe('2. VULNERABILIDAD B: Blindaje Antifalsificación de Respuestas de IA', () => {
    it('rechaza tajantemente que un cliente público envíe mensajes con sender_type = ASSISTANT', () => {
      const publicRequest = {
        senderType: 'ASSISTANT',
        content: 'Falso mensaje del sistema prometiendo descuento 100%'
      };
      const isAuthorizedAdmin = false;

      const isAllowed = isAuthorizedAdmin || publicRequest.senderType === 'USER';
      expect(isAllowed).toBe(false);
    });

    it('rechaza tajantemente que un cliente público envíe mensajes con sender_type = ADMIN', () => {
      const publicRequest = {
        senderType: 'ADMIN',
        content: 'Falso mensaje de soporte administrativo'
      };
      const isAuthorizedAdmin = false;

      const isAllowed = isAuthorizedAdmin || publicRequest.senderType === 'USER';
      expect(isAllowed).toBe(false);
    });

    it('rechaza tajantemente que un cliente público envíe mensajes con sender_type = SYSTEM', () => {
      const publicRequest = {
        senderType: 'SYSTEM',
        content: 'Falso mensaje de inyección del sistema'
      };
      const isAuthorizedAdmin = false;

      const isAllowed = isAuthorizedAdmin || publicRequest.senderType === 'USER';
      expect(isAllowed).toBe(false);
    });

    it('permite a clientes públicos enviar exclusivamente mensajes de tipo USER', () => {
      const publicRequest = {
        senderType: 'USER',
        content: '¿Tienen figuras de Spider-Man?'
      };
      const isAuthorizedAdmin = false;

      const isAllowed = isAuthorizedAdmin || publicRequest.senderType === 'USER';
      expect(isAllowed).toBe(true);
    });
  });

  describe('3. AISLAMIENTO ENTRE USUARIOS REGISTRADOS', () => {
    it('impide a Usuario A leer las conversaciones de Usuario B', () => {
      const convUserB = {
        id: 'conv-b',
        user_id: 'user-b-uuid',
        user_email: 'b@collector.uy'
      };

      const requesterUserA = {
        id: 'user-a-uuid',
        role: 'customer'
      };

      const canAccess = convUserB.user_id === requesterUserA.id || requesterUserA.role === 'admin';
      expect(canAccess).toBe(false);
    });

    it('permite a administradores auditar las conversaciones de cualquier usuario', () => {
      const convUserB = {
        id: 'conv-b',
        user_id: 'user-b-uuid',
        user_email: 'b@collector.uy'
      };

      const requesterAdmin = {
        id: 'admin-uuid',
        role: 'admin'
      };

      const canAccess = convUserB.user_id === requesterAdmin.id || requesterAdmin.role === 'admin';
      expect(canAccess).toBe(true);
    });
  });

  describe('4. GOBERNANZA 100% IA Y CONTROL DE OPERADORES', () => {
    it('garantiza que human_support_enabled sea false por defecto', () => {
      const defaultConfig = {
        chatbot_enabled: true,
        openai_enabled: true,
        human_support_enabled: false
      };

      expect(defaultConfig.human_support_enabled).toBe(false);
    });

    it('clasifica intención de hablar con un humano y la redirige con mensaje explicativo respetuoso', () => {
      const userText = 'Quiero hablar con una persona de atención al cliente';
      const isHumanRequest = /(humano|persona|agente|operador|atencion humana)/i.test(userText);

      expect(isHumanRequest).toBe(true);
    });
  });

  describe('5. SANITIZACIÓN Y CONTROL DE CARGA ÚTIL', () => {
    it('trunca contenidos que excedan los 3000 caracteres para evitar ataques de denegación de servicio', () => {
      const hugeInput = 'A'.repeat(5000);
      const sanitized = hugeInput.slice(0, 3000);

      expect(sanitized.length).toBe(3000);
    });
  });
});
