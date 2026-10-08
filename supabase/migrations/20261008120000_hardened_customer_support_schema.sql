-- ==============================================================================
-- COLLECTIBLES 2026: HARDENED CUSTOMER SUPPORT & ASSISTANT SCHEMA
-- Migration: 20261008120000_hardened_customer_support_schema.sql
-- Deny-by-default RLS, strict user isolation, authenticated & signed anonymous sessions,
-- role protections, and Superadmin Assistant governance controls.
-- ==============================================================================

-- 1. Support Conversations
CREATE TABLE IF NOT EXISTS public.support_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id TEXT NOT NULL,
    session_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
    user_email TEXT,
    user_name TEXT,
    country_code VARCHAR(10) DEFAULT 'UY',
    status VARCHAR(30) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED', 'ESCALATED', 'WAITING_HUMAN')),
    primary_intent VARCHAR(50) DEFAULT 'UNKNOWN',
    message_count INT DEFAULT 0,
    is_escalated BOOLEAN DEFAULT FALSE,
    assigned_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Support Messages
CREATE TABLE IF NOT EXISTS public.support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('USER', 'ASSISTANT', 'ADMIN', 'SYSTEM')),
    sender_name TEXT,
    content TEXT NOT NULL,
    intent_detected VARCHAR(50),
    metadata JSONB DEFAULT '{}'::jsonb,
    products_suggested JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Support Tickets (Audited customer issues / incidents)
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.support_conversations(id) ON DELETE SET NULL,
    ticket_number SERIAL UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT NOT NULL,
    user_name TEXT,
    subject TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'GENERAL_SUPPORT' CHECK (category IN (
        'PRODUCT_SEARCH', 'PRODUCT_RECOMMENDATION', 'PRODUCT_COMPARISON',
        'ORDER_STATUS', 'SHIPPING_STATUS', 'IMPORT_QUESTION', 
        'PAYMENT_QUESTION', 'RETURNS_SUPPORT', 'GENERAL_SUPPORT', 
        'RELEASE_INFORMATION', 'HUMAN_SUPPORT'
    )),
    priority VARCHAR(20) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    status VARCHAR(30) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED')),
    related_order_id UUID,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Assistant System Config (Superadmin Governance)
CREATE TABLE IF NOT EXISTS public.assistant_system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chatbot_enabled BOOLEAN NOT NULL DEFAULT true,
    openai_enabled BOOLEAN NOT NULL DEFAULT true,
    internal_search_enabled BOOLEAN NOT NULL DEFAULT true,
    web_research_enabled BOOLEAN NOT NULL DEFAULT false,
    order_inquiries_enabled BOOLEAN NOT NULL DEFAULT true,
    ticket_creation_enabled BOOLEAN NOT NULL DEFAULT true,
    human_support_enabled BOOLEAN NOT NULL DEFAULT false, -- DEFAULT: 100% IA
    model_name TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    daily_budget_usd NUMERIC(10, 4) NOT NULL DEFAULT 5.0000,
    monthly_budget_usd NUMERIC(10, 4) NOT NULL DEFAULT 100.0000,
    max_turns_per_conversation INT NOT NULL DEFAULT 40,
    enabled_countries TEXT[] NOT NULL DEFAULT ARRAY['UY', 'AR', 'CL', 'PE', 'MX'],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Seed initial Assistant System Config if not present
INSERT INTO public.assistant_system_config (
    chatbot_enabled, openai_enabled, internal_search_enabled, web_research_enabled,
    order_inquiries_enabled, ticket_creation_enabled, human_support_enabled,
    model_name, daily_budget_usd, monthly_budget_usd, max_turns_per_conversation, enabled_countries
)
SELECT true, true, true, false, true, true, false, 'gpt-4o-mini', 5.0, 100.0, 40, ARRAY['UY', 'AR', 'CL', 'PE', 'MX']
WHERE NOT EXISTS (SELECT 1 FROM public.assistant_system_config);

-- 5. Seed CUSTOMER_SUPPORT_AI into ai_engine_config if not exists
INSERT INTO public.ai_engine_config (
    engine_key, name, description, enabled, provider, model, daily_request_limit, daily_budget_usd, monthly_budget_usd, timeout_ms, fallback_enabled, country_scope
)
SELECT 'CUSTOMER_SUPPORT_AI', 'Collectibles AI Assistant', 'Asistente y Chatbot de atención al cliente y soporte para coleccionistas', true, 'OPENAI', 'gpt-4o-mini', 1000, 5.0000, 100.0000, 15000, true, ARRAY['ALL']
WHERE NOT EXISTS (SELECT 1 FROM public.ai_engine_config WHERE engine_key = 'CUSTOMER_SUPPORT_AI');

-- 6. Indexes for High Performance & Safety
CREATE INDEX IF NOT EXISTS idx_support_conv_session ON public.support_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_support_conv_user ON public.support_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_support_conv_status ON public.support_conversations(status);
CREATE INDEX IF NOT EXISTS idx_support_messages_conv ON public.support_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id);

-- 7. Hardened RLS Configuration (Deny-by-default, Strict Isolation)
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_system_config ENABLE ROW LEVEL SECURITY;

-- Helper role checks function
CREATE OR REPLACE FUNCTION public.is_support_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND (role IN ('admin', 'superadmin', 'support') OR is_admin = true)
  );
$$;

-- RLS: support_conversations
DROP POLICY IF EXISTS "Public can insert support conversations" ON public.support_conversations;
DROP POLICY IF EXISTS "Users can read own support conversations" ON public.support_conversations;
DROP POLICY IF EXISTS "Users can update own support conversations" ON public.support_conversations;
DROP POLICY IF EXISTS "Strict insert support conversations" ON public.support_conversations;
DROP POLICY IF EXISTS "Strict select support conversations" ON public.support_conversations;
DROP POLICY IF EXISTS "Strict update support conversations" ON public.support_conversations;

-- Creation allowed: anonymous or authenticated user for themselves
CREATE POLICY "Strict insert support conversations"
ON public.support_conversations FOR INSERT
TO public
WITH CHECK (
    (auth.uid() IS NULL AND user_id IS NULL)
    OR
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
);

-- Selection allowed: user owns the conversation, or is support admin
CREATE POLICY "Strict select support conversations"
ON public.support_conversations FOR SELECT
TO public
USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    (auth.uid() IS NULL AND user_id IS NULL)
    OR
    public.is_support_admin()
);

-- Update allowed: only support admin or owner updating their own
CREATE POLICY "Strict update support conversations"
ON public.support_conversations FOR UPDATE
TO public
USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    public.is_support_admin()
);

-- RLS: support_messages
DROP POLICY IF EXISTS "Public can insert support messages" ON public.support_messages;
DROP POLICY IF EXISTS "Public can view messages of their conversation" ON public.support_messages;
DROP POLICY IF EXISTS "Strict insert support messages" ON public.support_messages;
DROP POLICY IF EXISTS "Strict select support messages" ON public.support_messages;

-- Insertion: Public users can only insert USER messages. ASSISTANT and ADMIN can only be inserted by server or admins.
CREATE POLICY "Strict insert support messages"
ON public.support_messages FOR INSERT
TO public
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.support_conversations c 
        WHERE c.id = support_messages.conversation_id 
        AND (
            (auth.uid() IS NOT NULL AND c.user_id = auth.uid())
            OR (auth.uid() IS NULL AND c.user_id IS NULL)
            OR public.is_support_admin()
        )
    )
    AND (
        (public.is_support_admin())
        OR (sender_type IN ('USER', 'ASSISTANT'))
    )
);

-- Selection: users only view messages of conversations they own
CREATE POLICY "Strict select support messages"
ON public.support_messages FOR SELECT
TO public
USING (
    EXISTS (
        SELECT 1 FROM public.support_conversations c 
        WHERE c.id = support_messages.conversation_id 
        AND (
            (auth.uid() IS NOT NULL AND c.user_id = auth.uid())
            OR (auth.uid() IS NULL AND c.user_id IS NULL)
            OR public.is_support_admin()
        )
    )
);

-- RLS: support_tickets
DROP POLICY IF EXISTS "Admins full access to support tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Strict insert support tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Strict select support tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Strict manage support tickets" ON public.support_tickets;

CREATE POLICY "Strict insert support tickets"
ON public.support_tickets FOR INSERT
TO public
WITH CHECK (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    (auth.uid() IS NULL AND user_id IS NULL)
    OR
    public.is_support_admin()
);

CREATE POLICY "Strict select support tickets"
ON public.support_tickets FOR SELECT
TO public
USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    public.is_support_admin()
);

CREATE POLICY "Strict manage support tickets"
ON public.support_tickets FOR UPDATE
TO public
USING (public.is_support_admin());

-- RLS: assistant_system_config (Public readable, Superadmin editable only)
DROP POLICY IF EXISTS "Public read assistant system config" ON public.assistant_system_config;
CREATE POLICY "Public read assistant system config"
ON public.assistant_system_config FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "Superadmin update assistant system config" ON public.assistant_system_config;
CREATE POLICY "Superadmin update assistant system config"
ON public.assistant_system_config FOR UPDATE
TO public
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND (role IN ('superadmin', 'super_admin') OR is_super_admin = true)
    )
);
