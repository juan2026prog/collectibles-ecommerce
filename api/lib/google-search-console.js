/**
 * Google Search Console Client Module
 * Communicates with Google Search Console APIs (Webmasters API v3 & URL Inspection v1)
 */

const SEARCH_CONSOLE_API_BASE = 'https://www.googleapis.com/webmasters/v3';
const URL_INSPECTION_API_BASE = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

/**
 * List all verified sites accessible by the authenticated service account
 */
export async function listSites(client) {
  const url = `${SEARCH_CONSOLE_API_BASE}/sites`;
  const response = await client.request({
    url,
    method: 'GET'
  });

  return response.data?.siteEntry || [];
}

/**
 * Automatically locate the collectibles.uy siteUrl without assuming sc-domain or https
 */
export async function findCollectiblesProperty(client) {
  const sites = await listSites(client);

  // Match domain property or URL prefix property
  const match = sites.find(s => {
    const raw = (s.siteUrl || '').toLowerCase();
    return raw.includes('collectibles.uy');
  });

  if (!match) {
    return {
      found: false,
      siteUrl: null,
      permissionLevel: null,
      availableSites: sites.map(s => s.siteUrl)
    };
  }

  return {
    found: true,
    siteUrl: match.siteUrl,
    permissionLevel: match.permissionLevel,
    availableSites: sites.map(s => s.siteUrl)
  };
}

/**
 * List sitemaps registered for the site
 */
export async function listSitemaps(client, siteUrl) {
  const encodedSite = encodeURIComponent(siteUrl);
  const url = `${SEARCH_CONSOLE_API_BASE}/sites/${encodedSite}/sitemaps`;
  
  try {
    const response = await client.request({
      url,
      method: 'GET'
    });
    return response.data?.sitemap || [];
  } catch (err) {
    if (err.status === 404 || err.response?.status === 404) {
      return [];
    }
    throw err;
  }
}

/**
 * Submit or register a sitemap URL
 */
export async function submitSitemap(client, siteUrl, sitemapPath) {
  const encodedSite = encodeURIComponent(siteUrl);
  const encodedFeedpath = encodeURIComponent(sitemapPath);
  const url = `${SEARCH_CONSOLE_API_BASE}/sites/${encodedSite}/sitemaps/${encodedFeedpath}`;

  const response = await client.request({
    url,
    method: 'PUT'
  });

  return response.data || { success: true };
}

/**
 * Query Search Analytics (clicks, impressions, ctr, position)
 */
export async function querySearchAnalytics(client, siteUrl, options = {}) {
  const encodedSite = encodeURIComponent(siteUrl);
  const url = `${SEARCH_CONSOLE_API_BASE}/sites/${encodedSite}/searchAnalytics/query`;

  const today = new Date();
  const prior = new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000);

  const body = {
    startDate: options.startDate || prior.toISOString().split('T')[0],
    endDate: options.endDate || today.toISOString().split('T')[0],
    dimensions: options.dimensions || ['query', 'page'],
    rowLimit: options.rowLimit || 25
  };

  const response = await client.request({
    url,
    method: 'POST',
    data: body
  });

  return response.data || { rows: [] };
}

/**
 * Inspect a single URL using URL Inspection API
 */
export async function inspectUrl(client, siteUrl, inspectionUrl) {
  const body = {
    inspectionUrl,
    siteUrl
  };

  try {
    const response = await client.request({
      url: URL_INSPECTION_API_BASE,
      method: 'POST',
      data: body
    });

    const inspectionResult = response.data?.inspectionResult;
    const indexStatus = inspectionResult?.indexStatusResult || {};

    return {
      success: true,
      url: inspectionUrl,
      verdict: indexStatus.verdict || 'UNKNOWN',
      coverageState: indexStatus.coverageState || 'UNKNOWN',
      robotsTxtState: indexStatus.robotsTxtState || 'UNKNOWN',
      indexingState: indexStatus.indexingState || 'UNKNOWN',
      lastCrawlTime: indexStatus.lastCrawlTime || null,
      pageFetchState: indexStatus.pageFetchState || 'UNKNOWN',
      googleCanonical: indexStatus.googleCanonical || null,
      userCanonical: indexStatus.userCanonical || null,
      rawIndexStatusResult: indexStatus
    };
  } catch (err) {
    const status = err.status || err.response?.status || 500;
    const errorMsg = err.response?.data?.error?.message || err.message || 'Inspection failed';
    return {
      success: false,
      url: inspectionUrl,
      error: {
        httpStatus: status,
        message: errorMsg
      },
      verdict: 'FAIL',
      coverageState: 'ERROR',
      robotsTxtState: 'UNKNOWN',
      indexingState: 'UNKNOWN',
      lastCrawlTime: null,
      pageFetchState: 'ERROR',
      googleCanonical: null,
      userCanonical: null
    };
  }
}

/**
 * Helper to delay execution (quota respect)
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Inspect a list of priority URLs in batches with rate-limiting
 */
export async function inspectUrlBatch(client, siteUrl, urlList = [], options = {}) {
  const delayMs = options.delayMs || 350;
  const results = [];

  for (let i = 0; i < urlList.length; i++) {
    const targetUrl = urlList[i];
    const res = await inspectUrl(client, siteUrl, targetUrl);
    results.push(res);

    if (i < urlList.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return results;
}
