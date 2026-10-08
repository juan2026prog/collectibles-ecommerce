-- ==============================================================================
-- COLLECTIBLES 2026: CUSTOMER SUPPORT & AI ASSISTANT SCHEMA
-- Migration: 20271008000000_customer_support_and_assistant.sql
-- ==============================================================================

-- 1. Support Conversations (sessions of chat with users / visitors)
CREATE TABLE IF NOT EXISTS public.support_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id TEXT NOT NULL,
    user_email TEXT,
    user_name TEXT,
    country_code VARCHAR(2) DEFAULT 'UY',
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

-- 3. Support Tickets (Escalated issues / inquiries needing human staff follow-up)
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.support_conversations(id) ON DELETE SET NULL,
    ticket_number SERIAL UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT NOT NULL,
    user_name TEXT,
    subject TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'GENERAL_SUPPORT' CHECK (category IN (
        'PRODUCT_SEARCH', 'PRODUCT_RECOMMENDATION', 'ORDER_STATUS', 
        'SHIPPING_STATUS', 'IMPORT_QUESTION', 'PAYMENT_QUESTION', 
        'RETURNS_SUPPORT', 'GENERAL_SUPPORT', 'HUMAN_SUPPORT'
    )),
    priority VARCHAR(20) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    status VARCHAR(30) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED')),
    related_order_id UUID,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Indexes for high performance
CREATE INDEX IF NOT EXISTS idx_support_conv_session ON public.support_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_support_conv_user ON public.support_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_support_conv_status ON public.support_conversations(status);
CREATE INDEX IF NOT EXISTS idx_support_messages_conv ON public.support_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id);

-- 5. RLS Policies
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Allow anon and authenticated users to create and manage their own conversation by session_id or user_id
DROP POLICY IF EXISTS "Public can insert support conversations" ON public.support_conversations;
CREATE POLICY "Public can insert support conversations"
ON public.support_conversations FOR INSERT
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can read own support conversations" ON public.support_conversations;
CREATE POLICY "Users can read own support conversations"
ON public.support_conversations FOR SELECT
TO public
USING (
    user_id = auth.uid() 
    OR session_id IS NOT NULL 
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'support'))
);

DROP POLICY IF EXISTS "Users can update own support conversations" ON public.support_conversations;
CREATE POLICY "Users can update own support conversations"
ON public.support_conversations FOR UPDATE
TO public
USING (
    user_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'support'))
);

DROP POLICY IF EXISTS "Public can insert support messages" ON public.support_messages;
CREATE POLICY "Public can insert support messages"
ON public.support_messages FOR INSERT
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "Public can view messages of their conversation" ON public.support_messages;
CREATE POLICY "Public can view messages of their conversation"
ON public.support_messages FOR SELECT
TO public
USING (
    EXISTS (
        SELECT 1 FROM public.support_conversations c 
        WHERE c.id = support_messages.conversation_id 
        AND (c.user_id = auth.uid() OR c.session_id IS NOT NULL)
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'support'))
);

DROP POLICY IF EXISTS "Admins full access to support tickets" ON public.support_tickets;
CREATE POLICY "Admins full access to support tickets"
ON public.support_tickets FOR ALL
TO public
USING (
    user_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'support'))
);
