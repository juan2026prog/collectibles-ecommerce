ALTER TABLE badges ADD COLUMN IF NOT EXISTS position text DEFAULT 'top-left';
ALTER TABLE badges ADD COLUMN IF NOT EXISTS size text DEFAULT 'medium';
ALTER TABLE badges ADD COLUMN IF NOT EXISTS start_date timestamptz;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS end_date timestamptz;
ALTER TABLE products ADD COLUMN IF NOT EXISTS badge_ids text[] DEFAULT '{}';
