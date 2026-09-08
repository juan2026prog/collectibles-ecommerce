import { createGoogleAuthClient, testGoogleAuth, sanitizeGoogleAuthError } from './lib/google-auth.js';
import {
  findCollectiblesProperty,
  listSitemaps,
  submitSitemap,
  querySearchAnalytics,
  inspectUrl,
  inspectUrlBatch
} from './lib/google-search-console.js';

// Priority URL Sample for automated inspection
const PRIORITY_URL_SAMPLE = [
  'https://collectibles.uy/',
  'https://collectibles.uy/academy',
  'https://collectibles.uy/academy/como-empezar-coleccion-figuras',
  'https://collectibles.uy/academy/figuras-accion-vs-estatuas',
  'https://collectibles.uy/categoria/figuras-de-accion',
  'https://collectibles.uy/categoria/estatuas-y-bustos',
  'https://collectibles.uy/marca/hot-toys',
  'https://collectibles.uy/marca/funko',
  'https://collectibles.uy/import-hub',
  'https://collectibles.uy/shop'
];

export default async function handler(req, res) {
  // CORS & Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = req.query?.action || (req.body && req.body.action) || 'health';

  try {
    // Action 1: Health & Connection verification
    if (action === 'health') {
      const authTest = await testGoogleAuth();
      if (!authTest.client) {
        return res.status(502).json({
          status: 'ERROR',
          message: 'Google authentication pipeline failed',
          details: {
            audience: authTest.audience,
            vercelOidc: authTest.vercelOidc,
            googleSts: authTest.googleSts,
            serviceAccountImpersonation: authTest.serviceAccountImpersonation,
            oidcClaims: authTest.vercelOidc.claims
          }
        });
      }

      let propertyInfo;
      try {
        propertyInfo = await findCollectiblesProperty(authTest.client);
      } catch (err) {
        const sanitized = sanitizeGoogleAuthError(err);
        return res.status(502).json({
          status: 'ERROR',
          message: 'Failed to access Google Search Console sites.list',
          details: {
            vercelOidc: authTest.vercelOidc,
            googleSts: authTest.googleSts,
            serviceAccountImpersonation: authTest.serviceAccountImpersonation,
            searchConsoleApi: { status: 'FAIL', error: sanitized }
          }
        });
      }

      return res.status(200).json({
        status: 'OK',
        vercelOidc: authTest.vercelOidc.status,
        googleSts: authTest.googleSts.status,
        serviceAccountImpersonation: authTest.serviceAccountImpersonation.status,
        searchConsoleApi: 'PASS',
        property: propertyInfo
      });
    }

    // Initialize authenticated client for subsequent actions
    const client = createGoogleAuthClient();
    const propertyInfo = await findCollectiblesProperty(client);

    if (!propertyInfo.found || !propertyInfo.siteUrl) {
      return res.status(404).json({
        status: 'ERROR',
        message: 'collectibles.uy property not found among accessible Search Console sites',
        availableSites: propertyInfo.availableSites
      });
    }

    const siteUrl = propertyInfo.siteUrl;

    // Action 2: Sitemaps Management
    if (action === 'sitemaps') {
      const sitemaps = await listSitemaps(client, siteUrl);
      const targetSitemap = 'https://collectibles.uy/sitemap.xml';
      const existing = sitemaps.find(s => s.path === targetSitemap);

      let submissionResult = null;
      if (!existing) {
        submissionResult = await submitSitemap(client, siteUrl, targetSitemap);
      }

      return res.status(200).json({
        status: 'OK',
        siteUrl,
        sitemapFound: !!existing,
        sitemapUrl: targetSitemap,
        existingSitemap: existing || null,
        submitted: !existing,
        submissionResult,
        allSitemaps: sitemaps
      });
    }

    // Action 3: Search Analytics Query
    if (action === 'analytics') {
      const analytics = await querySearchAnalytics(client, siteUrl, req.body || {});
      return res.status(200).json({
        status: 'OK',
        siteUrl,
        analytics
      });
    }

    // Action 4: Specific URL Inspection
    if (action === 'inspect') {
      const targetUrls = (req.body && req.body.urls) || (req.query?.url ? [req.query.url] : PRIORITY_URL_SAMPLE.slice(0, 5));
      const delayMs = (req.body && typeof req.body.delayMs === 'number') ? req.body.delayMs : 120;
      const inspectionResults = await inspectUrlBatch(client, siteUrl, targetUrls, { delayMs });
      return res.status(200).json({
        status: 'OK',
        siteUrl,
        count: inspectionResults.length,
        results: inspectionResults
      });
    }

    // Action 5: Full Automated SEO Check & Report
    if (action === 'check-full' || action === 'full-check') {
      // 1. Sitemaps status
      const sitemaps = await listSitemaps(client, siteUrl);
      const targetSitemap = 'https://collectibles.uy/sitemap.xml';
      const existingSitemap = sitemaps.find(s => s.path === targetSitemap);

      let sitemapSubmitted = false;
      if (!existingSitemap) {
        try {
          await submitSitemap(client, siteUrl, targetSitemap);
          sitemapSubmitted = true;
        } catch (err) {
          // non-fatal, report
        }
      }

      // 2. Inspection on priority sample
      const requestedUrls = (req.body && Array.isArray(req.body.urls) && req.body.urls.length > 0)
        ? req.body.urls
        : PRIORITY_URL_SAMPLE;

      const inspectionResults = await inspectUrlBatch(client, siteUrl, requestedUrls, { delayMs: 350 });

      // 3. Compute Metrics
      let indexedCount = 0;
      let notIndexedCount = 0;
      let canonicalMatchCount = 0;
      let canonicalMismatchCount = 0;
      let robotsBlockedCount = 0;
      let latestCrawlTime = null;

      inspectionResults.forEach(r => {
        if (r.verdict === 'PASS' || r.coverageState?.toLowerCase().includes('indexed')) {
          indexedCount++;
        } else {
          notIndexedCount++;
        }

        if (r.robotsTxtState === 'DISALLOWED') {
          robotsBlockedCount++;
        }

        if (r.userCanonical && r.googleCanonical) {
          if (r.userCanonical.trim() === r.googleCanonical.trim()) {
            canonicalMatchCount++;
          } else {
            canonicalMismatchCount++;
          }
        }

        if (r.lastCrawlTime) {
          if (!latestCrawlTime || new Date(r.lastCrawlTime) > new Date(latestCrawlTime)) {
            latestCrawlTime = r.lastCrawlTime;
          }
        }
      });

      const report = {
        timestamp: new Date().toISOString(),
        auth: {
          vercelOidc: 'PASS',
          googleSts: 'PASS',
          serviceAccountImpersonation: 'PASS',
          searchConsoleApi: 'PASS'
        },
        property: {
          siteUrl,
          permissionLevel: propertyInfo.permissionLevel
        },
        sitemap: {
          target: targetSitemap,
          found: !!existingSitemap || sitemapSubmitted,
          submittedNewly: sitemapSubmitted,
          status: existingSitemap?.status || (sitemapSubmitted ? 'SUBMITTED' : 'UNKNOWN'),
          lastDownloaded: existingSitemap?.lastDownloaded || null,
          errors: existingSitemap?.errors || '0',
          warnings: existingSitemap?.warnings || '0'
        },
        metrics: {
          totalInspected: inspectionResults.length,
          indexed: indexedCount,
          notIndexed: notIndexedCount,
          canonicalCorrect: canonicalMatchCount,
          canonicalDifferent: canonicalMismatchCount,
          robotsBlocked: robotsBlockedCount,
          latestCrawlTime: latestCrawlTime || 'N/A'
        },
        urlDetails: inspectionResults.map(r => ({
          url: r.url,
          verdict: r.verdict,
          coverageState: r.coverageState,
          robotsTxtState: r.robotsTxtState,
          indexingState: r.indexingState,
          lastCrawlTime: r.lastCrawlTime,
          pageFetchState: r.pageFetchState,
          googleCanonical: r.googleCanonical,
          userCanonical: r.userCanonical,
          success: r.success
        }))
      };

      return res.status(200).json({
        status: 'OK',
        report
      });
    }

    return res.status(400).json({
      status: 'ERROR',
      message: `Unknown action '${action}'. Supported actions: health, sitemaps, analytics, inspect, check-full`
    });
  } catch (err) {
    const sanitized = sanitizeGoogleAuthError(err);
    return res.status(sanitized.httpStatus || 500).json({
      status: 'ERROR',
      error: sanitized
    });
  }
}
