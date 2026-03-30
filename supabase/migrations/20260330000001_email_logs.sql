CREATE TABLE email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  email_type text NOT NULL, -- 'order_confirmation', 'shipping_update', 'newsletter', etc.
  status text DEFAULT 'sent', -- 'sent', 'failed', 'delivered', 'opened'
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_email_logs_type ON email_logs(email_type);
CREATE INDEX idx_email_logs_recipient ON email_logs(recipient_email);
