export const config = {
  matcher: [
    '/p/:slug*',
    '/producto/:slug*',
    '/categoria/:slug*',
    '/marca/:slug*'
  ]
};

export default function middleware(request) {
  const url = new URL(request.url);
  const ua = request.headers.get('user-agent') || '';

  // Detect social bots
  const isBot = /facebookexternalhit|Facebot|WhatsApp|Twitterbot|TelegramBot|Discordbot|LinkedInBot|Slackbot/i.test(ua);

  if (isBot) {
    // Rewrite to social API
    url.pathname = '/api/social';
    // Pass the original path so the serverless function knows what to fetch
    url.searchParams.set('originalPath', request.url);
    return Response.rewrite(url);
  }

  // Normal users bypass to index.html natively
  // No response means continue to the matching rewrite in vercel.json
}
