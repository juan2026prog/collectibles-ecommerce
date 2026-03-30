# CRM, Customer Lifecycle & Analytics Architecture

## 1. CRM Pipeline (Abandoned Cart Flow)
Using a combination of the frontend and Edge Functions, we track purchase intents.

- **Action `AddToCart`:** When an item is added to the cart, a persistent session identifier maps the `cart` state to the User Profile (if authenticated) or a trackable local cookie (if guest).
- **Trigger:** An Edge Function cron job runs every 15 minutes checking for active carts older than 2 hours that lack a corresponding `Purchase` event in the `orders` table.
- **Action `SendEmail`:** The Edge Function triggers an API call to Klaviyo/Mailchimp (using a Secure Service Key).
- **Incentive Tracking:** If a discount code is automatically generated for the abandoned cart, it is inserted into the `coupons` table with a short `expires_at` window to create urgency.

## 2. Customer Segmentation Logic
The system automatically segments users based on RFM (Recency, Frequency, Monetary) values calculated from the `orders` table.
- **Whales:** Users where `SUM(orders.total_amount) > $1000`.
- **At-Risk:** Users whose last `orders.created_at` was > 90 days ago.
- **Hooked:** Users with `COUNT(orders.id) > 5`.

## 3. Business Intelligence (BI) Views
To prevent the Admin Dashboard from executing slow `SUM()` functions on every page load, we instantiate Postgres Materialized Views in Supabase.

### Recommended `daily_sales` View
```sql
CREATE MATERIALIZED VIEW top_level_metrics AS
SELECT 
  DATE_TRUNC('day', created_at) AS sale_day,
  COUNT(id) as total_orders,
  SUM(total_amount) as gross_revenue
FROM orders
WHERE status = 'paid'
GROUP BY sale_day
ORDER BY sale_day DESC;
```
*(Note: To update this view, a pg_cron job will call `REFRESH MATERIALIZED VIEW top_level_metrics` nightly).*

### Admin Dashboard Application
The `/admin/dashboard` route subscribes to these materialized views for rapid load times, presenting the platform administrator with real-time Gross Revenue, Affiliate Payout Pending totals, and vendor activity heatmaps.
