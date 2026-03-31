-- Badges table for custom product labels
CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    slug TEXT UNIQUE,
    bg_color TEXT DEFAULT '#3b82f6',
    text_color TEXT DEFAULT '#ffffff',
    custom_image TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;

-- Policies for badges
CREATE POLICY "Public read access to badges" ON badges FOR SELECT USING (true);
CREATE POLICY "Admins can manage badges" ON badges FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);

-- Default badges data
INSERT INTO badges (label, slug, bg_color, text_color, sort_order) VALUES
    ('HOT', 'hot', '#ef4444', '#ffffff', 1),
    ('NEW', 'new', '#22c55e', '#ffffff', 2),
    ('SALE', 'sale', '#3b82f6', '#ffffff', 3),
    ('PRE-ORDER', 'preorder', '#f97316', '#ffffff', 4),
    ('SOLD OUT', 'soldout', '#6b7280', '#ffffff', 5)
ON CONFLICT (slug) DO NOTHING;
