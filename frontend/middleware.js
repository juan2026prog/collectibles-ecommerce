import { rewrite } from '@vercel/edge';

export const config = {
  matcher: [
    '/p/:slug*',
    '/producto/:slug*',
    '/categoria/:slug*',
    '/marca/:slug*'
  ]
};

export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const segments = pathname.split('/').filter(Boolean);
  const type = segments[0];
  const slug = segments[1];

  // 1. HTTP 301 Moved Permanently redirect for historic product slugs
  if ((type === 'p' || type === 'producto') && slug) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/product_slug_redirects?old_slug=eq.${encodeURIComponent(slug)}&select=new_slug`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0 && data[0].new_slug) {
          const newSlug = data[0].new_slug;
          const redirectUrl = new URL(`/p/${newSlug}`, request.url);
          return new Response(null, {
            status: 301,
            headers: {
              'Location': redirectUrl.toString(),
              'Cache-Control': 'public, max-age=31536000, immutable'
            }
          });
        }
      }
    } catch (err) {
      console.error('Middleware redirect error:', err);
    }
  }

  // 2. Detect social bots for OpenGraph HTML pre-rendering
  const ua = request.headers.get('user-agent') || '';
  const isBot = /facebookexternalhit|Facebot|WhatsApp|Twitterbot|TelegramBot|Discordbot|LinkedInBot|Slackbot/i.test(ua);

  if (isBot) {
    url.pathname = '/api/social';
    url.searchParams.set('originalPath', request.url);
    return rewrite(url);
  }

  // Normal users bypass to SPA natively
}
