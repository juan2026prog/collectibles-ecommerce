# Storage & Media Architecture

## 1. Overview
The Storage & Media Architecture for Collectibles.uy provides a scalable, secure, and optimized solution for handling all platform media using Supabase Storage. It covers product images, user avatars, artist galleries, marketplace listings, and Cameo-style video greetings.

## 2. Bucket Definitions and Naming Conventions

To ensure security and logical separation, the platform's media is distributed across the following Supabase Storage buckets:

| Bucket Name | Accessibility | Purpose | File Types |
| :--- | :--- | :--- | :--- |
| `public-assets` | Public | General platform assets, branding, marketing materials, and default placeholders. | Images (WebP, PNG, JPG), SVG |
| `product-images` | Public | E-commerce catalog and marketplace listing images. | Images (WebP, JPG) |
| `user-avatars` | Public | Profile pictures for buyers, sellers, and artists. | Images (WebP, JPG) |
| `artist-galleries` | Public | Portfolios and public showcases for artists. | Images (WebP, JPG), Videos (MP4) |
| `private-videos` | Private (Auth/Signed) | Paid Cameo-style video greetings, pending review content. | Videos (MP4, MOV) |
| `secure-documents`| Private (Auth) | Sensitive user documents (e.g., ID verification for sellers/artists). | PDF, Images (JPG, PNG) |

**Naming Convention for Files:**
`[entity_id]/[timestamp]_[random_hash].[extension]`
*Example:* `product_uuid/1678882828_a8f9d.webp`

## 3. Row Level Security (RLS) & Access Rules

Strict RLS policies are enforced on all buckets. Non-public buckets require authentication or signed URLs.

### `public-assets`, `product-images`, `user-avatars`, `artist-galleries`
- **SELECT**: `true` (Publicly readable).
- **INSERT**: `auth.uid() = owner_id` (Authenticated users can upload to their respective folders, or admins can upload anywhere).
- **UPDATE/DELETE**: `auth.uid() = owner_id` OR Admin Role.

### `private-videos`
- **SELECT**: Requires a valid Signed URL OR `auth.uid()` matches the video creator (artist) or recipient (buyer).
- **INSERT**: `auth.uid() = artist_id` (Only the assigned artist can upload the fulfillment video).
- **UPDATE/DELETE**: Admin Role only.

### `secure-documents`
- **SELECT**: `auth.uid() = owner_id` OR Admin Role (Compliance/Support).
- **INSERT**: `auth.uid() = owner_id`.
- **UPDATE/DELETE**: Admin Role only.

## 4. End-to-End Upload Flows

To minimize server load and ensure security, we use a Direct-to-Storage upload flow with Edge Function validation.

### Flow: Client Upload (e.g., Product Image or Video Greeting)
1. **Frontend Request**: The client requests an upload token/signed URL from a Supabase Edge Function (`/functions/v1/generate-upload-url`), passing metadata (file size, MIME type, entity ID).
2. **Edge Function Validation**:
   - Verifies `auth.uid()` and permissions (e.g., is the user allowed to upload a video for this specific order?).
   - Validates MIME type and file size against platform limits.
   - Generates a short-lived **Signed Upload URL** via Supabase Admin SDK.
3. **Direct Upload**: The frontend uploads the file directly to Supabase Storage using the signed URL.
4. **Database Record Creation**:
   - Upon successful upload, the frontend calls the database (via API or RPC) to create a record linking the file path to the entity (e.g., updating the `avatar_url` in `profiles` or adding a row in `product_images`).
   - *Alternative*: A Supabase Storage Webhook triggers an Edge Function to automatically create the database record.

## 5. Media Optimization Guidelines

- **Image Formats**: All images must be converted to **WebP** on the client-side or via Edge Functions before upload to minimize size.
- **Supabase Image Transformations**: Utilize Supabase's built-in image transformations for responsive delivery.
  - *Thumbnails*: `?width=200&height=200&resize=contain`
  - *Product Pages*: `?width=800&resize=contain`
- **Video Compression**: Videos should be compressed on the client-side (if possible) or strictly limited by size (e.g., max 100MB for Cameo videos).
- **Cache-Control**: Ensure `Cache-Control: public, max-age=31536000` is set for all public assets to leverage Supabase CDN edge caching.

## 6. Lifecycle Management & Cleanup

- **Orphaned Files**: A scheduled Edge Function (Cron Job) runs weekly to identify files in `product-images` or `private-videos` that lack corresponding database records and deletes them.
- **Archiving**: Old/expired video greetings (e.g., 6 months post-delivery) can be automatically moved to cheaper cold storage or deleted based on platform retention policies.
- **Soft Deletes**: When a user deletes an image on the frontend, the database record is removed/soft-deleted, and a background queue handles the actual physical storage deletion to ensure responsiveness.
