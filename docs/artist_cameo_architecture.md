# Artist & Cameo Video Architecture

## 1. Artist Profiles
Artists operate similarly to Vendors but focus on digital commissions instead of physical goods.
- **Profile Routing:** `/a/[artistSlug]` functions as their storefront.
- **Discovery:** A global artist directory allows filtering by category or tag.

## 2. Cameo Request Lifecycle
The personalized video flow requires strict state management to prevent fraud and protect both parties.

1. **Request Origin:** Customer visits an artist's profile, clicks "Request Video", and submits instructions along with their payment method.
2. **Authorization (Stripe Auth):** The `checkout-handler` **authorizes** but does NOT **capture** the funds. The `video_requests` row is created with `status: pending`.
3. **Artist Notification:** The Artist sees the pending request in their dashboard.
4. **Fulfillment Window:** The Artist typically has 7 days to record and fulfill the request.
   - *If they fail:* The request expires, `status -> cancelled`, and the Stripe Authorization drops. The customer is never charged.
5. **Fulfillment (Upload):** The Artist uploads an MP4. The upload goes directly to the `private-videos` Supabase Storage bucket. The file path is saved to `video_requests.response_video_url`, and the status updates to `completed`.
6. **Capture (Stripe Capture/Payout):** An Edge Function webhook detects the `completed` status. It triggers Stripe to **capture** the authorized funds, and immediately credits the artist via the `vendor_payouts` or a specific `artist_payouts` ledger.
7. **Delivery:** The Customer receives an email with a unique Signed URL (valid for X days) pointing to exactly their video in the `private-videos` bucket securely.
