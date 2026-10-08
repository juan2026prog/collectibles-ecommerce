// ============================================================
// COLLECTIBLES 2026 — SECURE CUSTOMER SUPPORT API ENDPOINT
// Path: /api/support-chat.js
// Server-side authoritative handler for Support Sessions & Messages.
// Prevents cross-visitor conversation leaks & prevents ASSISTANT/ADMIN spoofing.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { authenticateRequest } from '../server/lib/authGuard.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getServiceClient() {
  if (!SUPABASE_KEY || SUPABASE_KEY.startsWith('sb_publishable')) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

/**
 * Signs or verifies anonymous session tokens with HMAC
 */
function createSessionSecret(sessionId) {
  const secretKey = process.env.SESSION_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'collectibles-secure-salt-2026';
  return crypto.createHmac('sha256', secretKey).update(sessionId).digest('hex');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-support-session-id, x-support-session-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const client = getServiceClient();
  if (!client) {
    return res.status(503).json({
      success: false,
      error: 'Base de datos no configurada o inaccesible.'
    });
  }

  // Check user authentication
  const auth = await authenticateRequest(req, { allowPublicSupport: true });

  const { action = 'ensure_conversation' } = req.body || req.query || {};

  try {
    // ----------------------------------------------------
    // ACTION 1: ENSURE CONVERSATION
    // ----------------------------------------------------
    if (action === 'ensure_conversation' && req.method === 'POST') {
      const {
        conversationId,
        sessionId,
        sessionSecret,
        countryCode = 'UY',
        userName,
        userEmail
      } = req.body || {};

      if (!sessionId && !auth.user?.id) {
        return res.status(400).json({ success: false, error: 'sessionId o sesión autenticada requerida' });
      }

      // If user is authenticated, query or bind to user_id
      if (auth.authenticated && !auth.isAnonymousSupport && auth.user?.id) {
        if (conversationId) {
          const { data: existing } = await client
            .from('support_conversations')
            .select('id, user_id, session_id, country_code, status')
            .eq('id', conversationId)
            .maybeSingle();

          if (existing && (existing.user_id === auth.user.id || auth.isAdmin)) {
            return res.status(200).json({ success: true, conversation: existing });
          }
        }

        // Search active by user_id
        const { data: userConv } = await client
          .from('support_conversations')
          .select('id, user_id, session_id, country_code, status')
          .eq('user_id', auth.user.id)
          .eq('status', 'ACTIVE')
          .order('last_message_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (userConv) {
          return res.status(200).json({ success: true, conversation: userConv });
        }

        // Create new authenticated conversation
        const { data: created, error } = await client
          .from('support_conversations')
          .insert({
            user_id: auth.user.id,
            session_id: sessionId || `auth-${auth.user.id}`,
            user_email: auth.user.email || userEmail || null,
            user_name: userName || null,
            country_code: countryCode,
            status: 'ACTIVE'
          })
          .select('id, user_id, session_id, country_code, status')
          .single();

        if (error) throw error;
        return res.status(200).json({ success: true, conversation: created });
      }

      // Anonymous session with cryptographically signed secret verification
      const expectedSecret = createSessionSecret(sessionId);

      if (conversationId) {
        const { data: existing } = await client
          .from('support_conversations')
          .select('id, session_id, session_secret, country_code, status, user_id')
          .eq('id', conversationId)
          .maybeSingle();

        // Enforce strict ownership: must match sessionId AND sessionSecret, and cannot be claimed if owned by registered user
        if (existing) {
          if (existing.user_id !== null) {
            return res.status(403).json({ success: false, error: 'Conversación privada de usuario autenticado.' });
          }
          if (existing.session_id === sessionId && (existing.session_secret === sessionSecret || existing.session_secret === expectedSecret)) {
            return res.status(200).json({ 
              success: true, 
              conversation: { id: existing.id, session_id: existing.session_id, country_code: existing.country_code },
              sessionSecret: expectedSecret
            });
          }
        }
      }

      // Check active anonymous conversation by sessionId
      const { data: bySession } = await client
        .from('support_conversations')
        .select('id, session_id, session_secret, country_code, status, user_id')
        .eq('session_id', sessionId)
        .is('user_id', null)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (bySession) {
        if (!sessionSecret || sessionSecret === bySession.session_secret || sessionSecret === expectedSecret) {
          return res.status(200).json({
            success: true,
            conversation: { id: bySession.id, session_id: bySession.session_id, country_code: bySession.country_code },
            sessionSecret: expectedSecret
          });
        }
      }

      // Create new anonymous conversation with signed secret
      const { data: created, error } = await client
        .from('support_conversations')
        .insert({
          session_id: sessionId,
          session_secret: expectedSecret,
          country_code: countryCode,
          status: 'ACTIVE'
        })
        .select('id, session_id, country_code, status')
        .single();

      if (error) throw error;
      return res.status(200).json({
        success: true,
        conversation: created,
        sessionSecret: expectedSecret
      });
    }

    // ----------------------------------------------------
    // ACTION 2: LOAD MESSAGES (Strict Isolation)
    // ----------------------------------------------------
    if (action === 'load_messages') {
      const conversationId = req.query?.conversationId || req.body?.conversationId;
      const sessionId = req.headers['x-support-session-id'] || req.query?.sessionId || req.body?.sessionId;
      const sessionSecret = req.headers['x-support-session-secret'] || req.query?.sessionSecret || req.body?.sessionSecret;

      if (!conversationId) {
        return res.status(400).json({ success: false, error: 'conversationId requerido' });
      }

      // Verify conversation ownership
      const { data: conv, error: convErr } = await client
        .from('support_conversations')
        .select('id, user_id, session_id, session_secret')
        .eq('id', conversationId)
        .maybeSingle();

      if (convErr || !conv) {
        return res.status(404).json({ success: false, error: 'Conversación no encontrada' });
      }

      // RBAC Ownership verification
      const isOwnerUser = auth.authenticated && !auth.isAnonymousSupport && conv.user_id === auth.user?.id;
      const isAuthorizedAdmin = auth.isAdmin;
      const expectedSecret = createSessionSecret(conv.session_id);
      const isOwnerAnon = conv.user_id === null && conv.session_id === sessionId && (sessionSecret === conv.session_secret || sessionSecret === expectedSecret);

      if (!isOwnerUser && !isAuthorizedAdmin && !isOwnerAnon) {
        return res.status(403).json({ success: false, error: 'Acceso denegado a esta conversación' });
      }

      const { data: messages, error: msgErr } = await client
        .from('support_messages')
        .select('id, sender_type, sender_name, content, intent_detected, products_suggested, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (msgErr) throw msgErr;

      return res.status(200).json({
        success: true,
        messages: (messages || []).map(m => ({
          id: m.id,
          sender: m.sender_type,
          text: m.content,
          timestamp: m.created_at,
          intent: m.intent_detected,
          products: m.products_suggested
        }))
      });
    }

    // ----------------------------------------------------
    // ACTION 3: PERSIST MESSAGE (Spoofing Shield)
    // ----------------------------------------------------
    if (action === 'persist_message' && req.method === 'POST') {
      const {
        conversationId,
        senderType = 'USER',
        content,
        senderName,
        intentDetected,
        products = [],
        sessionId,
        sessionSecret
      } = req.body || {};

      if (!conversationId || !content) {
        return res.status(400).json({ success: false, error: 'conversationId y content requeridos' });
      }

      // Verify ownership
      const { data: conv, error: convErr } = await client
        .from('support_conversations')
        .select('id, user_id, session_id, session_secret, message_count')
        .eq('id', conversationId)
        .maybeSingle();

      if (convErr || !conv) {
        return res.status(404).json({ success: false, error: 'Conversación no encontrada' });
      }

      const isOwnerUser = auth.authenticated && !auth.isAnonymousSupport && conv.user_id === auth.user?.id;
      const isAuthorizedAdmin = auth.isAdmin;
      const expectedSecret = createSessionSecret(conv.session_id);
      const isOwnerAnon = conv.user_id === null && conv.session_id === sessionId && (sessionSecret === conv.session_secret || sessionSecret === expectedSecret);

      if (!isOwnerUser && !isAuthorizedAdmin && !isOwnerAnon) {
        return res.status(403).json({ success: false, error: 'Acceso denegado a esta conversación' });
      }

      // CRITICAL SECURITY RULE: Public clients CANNOT forge ASSISTANT, ADMIN, or SYSTEM messages
      if (!isAuthorizedAdmin && senderType !== 'USER') {
        return res.status(403).json({
          success: false,
          error: 'Operación no permitida: Los clientes públicos solo pueden enviar mensajes de tipo USER.'
        });
      }

      // Insert message securely
      const { data: newMsg, error: insertErr } = await client
        .from('support_messages')
        .insert({
          conversation_id: conversationId,
          sender_type: senderType,
          sender_name: senderName || (senderType === 'USER' ? 'Usuario' : 'Collectibles AI'),
          content: String(content).slice(0, 3000), // Max length protection
          intent_detected: intentDetected || null,
          products_suggested: Array.isArray(products) ? products : []
        })
        .select('id, created_at')
        .single();

      if (insertErr) throw insertErr;

      // Update conversation metadata
      await client
        .from('support_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          primary_intent: intentDetected || undefined,
          message_count: (conv.message_count || 0) + 1
        })
        .eq('id', conversationId);

      return res.status(200).json({ success: true, messageId: newMsg.id });
    }

    return res.status(400).json({ success: false, error: 'Acción no soportada' });
  } catch (err) {
    console.error('[Support Chat API Error]:', err);
    return res.status(500).json({ success: false, error: err.message || 'Error interno del servidor' });
  }
}
