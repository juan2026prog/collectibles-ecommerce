-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: Product Q&A System Schema, RLS & Notifications
-- Migration: 20261203000000_product_questions.sql
-- ══════════════════════════════════════════════════════════════

-- 1. Create product_questions table
CREATE TABLE IF NOT EXISTS public.product_questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
    asked_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'hidden')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create product_question_answers table
CREATE TABLE IF NOT EXISTS public.product_question_answers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid UNIQUE NOT NULL REFERENCES public.product_questions(id) ON DELETE CASCADE,
    answered_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
    is_admin_answer boolean NOT NULL DEFAULT false,
    answer text NOT NULL,
    status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes for high performance
CREATE INDEX IF NOT EXISTS idx_product_questions_product_id ON public.product_questions (product_id, status);
CREATE INDEX IF NOT EXISTS idx_product_questions_vendor_id ON public.product_questions (vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_product_questions_asked_by ON public.product_questions (asked_by_user_id);
CREATE INDEX IF NOT EXISTS idx_product_questions_created ON public.product_questions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_question_answers_qid ON public.product_question_answers (question_id);
CREATE INDEX IF NOT EXISTS idx_product_question_answers_vendor ON public.product_question_answers (vendor_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.product_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_question_answers ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for product_questions

-- SELECT: Public can view non-hidden questions; authors, assigned vendors and admins can view their relevant questions
DROP POLICY IF EXISTS "Public can view active product questions" ON public.product_questions;
CREATE POLICY "Public can view active product questions" ON public.product_questions
    FOR SELECT USING (
        status IN ('pending', 'answered')
        OR asked_by_user_id = auth.uid()
        OR vendor_id = auth.uid()
        OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    );

-- INSERT: Authenticated users can insert questions for their own user_id
DROP POLICY IF EXISTS "Authenticated users can create questions" ON public.product_questions;
CREATE POLICY "Authenticated users can create questions" ON public.product_questions
    FOR INSERT WITH CHECK (
        auth.uid() = asked_by_user_id
    );

-- UPDATE: Admins can moderate
DROP POLICY IF EXISTS "Admins can update questions" ON public.product_questions;
CREATE POLICY "Admins can update questions" ON public.product_questions
    FOR UPDATE USING (
        (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    );

-- DELETE: Admins only
DROP POLICY IF EXISTS "Admins can delete questions" ON public.product_questions;
CREATE POLICY "Admins can delete questions" ON public.product_questions
    FOR DELETE USING (
        (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    );

-- 6. RLS Policies for product_question_answers

-- SELECT: Public can see published answers; admins and authors can see all
DROP POLICY IF EXISTS "Public can view published answers" ON public.product_question_answers;
CREATE POLICY "Public can view published answers" ON public.product_question_answers
    FOR SELECT USING (
        status = 'published'
        OR answered_by_user_id = auth.uid()
        OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    );

-- INSERT: Only the product's assigned Vendor or an Admin can answer
DROP POLICY IF EXISTS "Vendor or Admin can insert answer" ON public.product_question_answers;
CREATE POLICY "Vendor or Admin can insert answer" ON public.product_question_answers
    FOR INSERT WITH CHECK (
        (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
        OR (
            auth.uid() = answered_by_user_id 
            AND EXISTS (
                SELECT 1 FROM public.product_questions q
                WHERE q.id = question_id AND q.vendor_id = auth.uid()
            )
        )
    );

-- UPDATE: Author or Admin can update answer
DROP POLICY IF EXISTS "Author or Admin can update answer" ON public.product_question_answers;
CREATE POLICY "Author or Admin can update answer" ON public.product_question_answers
    FOR UPDATE USING (
        auth.uid() = answered_by_user_id 
        OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    );

-- DELETE: Admin only
DROP POLICY IF EXISTS "Admins can delete answers" ON public.product_question_answers;
CREATE POLICY "Admins can delete answers" ON public.product_question_answers
    FOR DELETE USING (
        (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    );

-- 7. Trigger Function to automatically mark Question as 'answered' upon answer creation
CREATE OR REPLACE FUNCTION public.fn_on_product_question_answered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.product_questions
    SET status = 'answered',
        updated_at = now()
    WHERE id = NEW.question_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_product_question_answered ON public.product_question_answers;
CREATE TRIGGER tr_product_question_answered
    AFTER INSERT ON public.product_question_answers
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_on_product_question_answered();

-- 8. Add notification settings toggle columns if not present
ALTER TABLE public.vendor_notification_settings
    ADD COLUMN IF NOT EXISTS notify_product_questions boolean DEFAULT true;

ALTER TABLE public.admin_notification_settings
    ADD COLUMN IF NOT EXISTS notify_product_questions boolean DEFAULT true;
