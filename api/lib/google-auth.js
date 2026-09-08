import { ExternalAccountClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';

const GCP_PROJECT_NUMBER = process.env.GCP_PROJECT_NUMBER || '836776591370';
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'prueba-463718';
const GCP_POOL_ID = process.env.GCP_POOL_ID || 'collectibles-vercel';
const GCP_PROVIDER_ID = process.env.GCP_PROVIDER_ID || 'vercel';
const GCP_SERVICE_ACCOUNT = process.env.GCP_SERVICE_ACCOUNT || 'collectibles-seo@prueba-463718.iam.gserviceaccount.com';

const AUDIENCE_CANDIDATES = [
  process.env.GCP_WORKLOAD_IDENTITY_AUDIENCE,
  `//iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${GCP_POOL_ID}/providers/${GCP_PROVIDER_ID}`,
  `//iam.googleapis.com/projects/${GCP_PROJECT_ID}/locations/global/workloadIdentityPools/${GCP_POOL_ID}/providers/${GCP_PROVIDER_ID}`,
  `https://iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${GCP_POOL_ID}/providers/${GCP_PROVIDER_ID}`
].filter(Boolean);

const TOKEN_URL = 'https://sts.googleapis.com/v1/token';
const SERVICE_ACCOUNT_IMPERSONATION_URL = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${GCP_SERVICE_ACCOUNT}:generateAccessToken`;

const SEARCH_CONSOLE_SCOPES = [
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/webmasters.readonly'
];

/**
 * Safely parse non-sensitive JWT claims (header and payload only, no secret)
 */
function parseJwtClaims(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
    const parsed = JSON.parse(payload);
    // Exclude any sensitive fields just in case
    return {
      iss: parsed.iss,
      sub: parsed.sub,
      aud: parsed.aud,
      owner: parsed.owner,
      project: parsed.project,
      environment: parsed.environment
    };
  } catch {
    return null;
  }
}

/**
 * Creates an ExternalAccountClient with a given audience
 */
export function createGoogleAuthClient(audienceOverride) {
  const audience = audienceOverride || AUDIENCE_CANDIDATES[0];
  return ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: TOKEN_URL,
    service_account_impersonation_url: SERVICE_ACCOUNT_IMPERSONATION_URL,
    subject_token_supplier: {
      async getSubjectToken() {
        const token = await getVercelOidcToken();
        if (!token) {
          throw new Error('No Vercel OIDC token returned from environment.');
        }
        return token;
      }
    },
    scopes: SEARCH_CONSOLE_SCOPES
  });
}

/**
 * Diagnostic function to test auth steps safely without exposing tokens
 */
export async function testGoogleAuth() {
  const result = {
    vercelOidc: { status: 'PENDING', error: null, claims: null },
    googleSts: { status: 'PENDING', error: null },
    serviceAccountImpersonation: { status: 'PENDING', error: null },
    client: null,
    testedAudiences: []
  };

  // Step 1: Vercel OIDC Token Check
  let oidcToken;
  try {
    oidcToken = await getVercelOidcToken();
    if (!oidcToken) {
      throw new Error('Vercel OIDC token is empty or unavailable in current environment.');
    }
    result.vercelOidc.status = 'PASS';
    result.vercelOidc.claims = parseJwtClaims(oidcToken);
  } catch (err) {
    result.vercelOidc.status = 'FAIL';
    result.vercelOidc.error = {
      stage: 'VERCEL_OIDC',
      message: err.message || 'Error acquiring Vercel OIDC token'
    };
    return result;
  }

  // Step 2 & 3: Try candidate audiences
  let lastError = null;
  for (const aud of AUDIENCE_CANDIDATES) {
    try {
      const client = createGoogleAuthClient(aud);
      const tokenResponse = await client.getAccessToken();
      if (tokenResponse && tokenResponse.token) {
        result.googleSts.status = 'PASS';
        result.serviceAccountImpersonation.status = 'PASS';
        result.client = client;
        result.successfulAudience = aud;
        return result;
      }
    } catch (err) {
      const sanitized = sanitizeGoogleAuthError(err);
      result.testedAudiences.push({
        audience: aud,
        error: sanitized
      });
      lastError = err;
    }
  }

  const errorDetails = sanitizeGoogleAuthError(lastError);
  result.googleSts.status = errorDetails.stage === 'GOOGLE_STS' ? 'FAIL' : 'UNKNOWN';
  result.serviceAccountImpersonation.status = errorDetails.stage === 'SERVICE_ACCOUNT_IMPERSONATION' ? 'FAIL' : 'FAIL';
  result.googleSts.error = errorDetails;
  result.serviceAccountImpersonation.error = errorDetails;

  return result;
}

/**
 * Sanitizes errors to prevent exposing secrets, tokens or headers
 */
export function sanitizeGoogleAuthError(err) {
  if (!err) return null;
  const status = err.status || err.statusCode || err.response?.status || 500;
  const rawMessage = err.message || 'Unknown authentication error';
  const responseData = err.response?.data;

  let googleErrorCode = null;
  let stage = 'GOOGLE_AUTH_EXCHANGE';

  if (typeof responseData === 'object' && responseData !== null) {
    googleErrorCode = responseData.error?.status || responseData.error?.code || responseData.error || null;
    if (responseData.error_description) {
      googleErrorCode = `${responseData.error}: ${responseData.error_description}`;
    }
  }

  if (rawMessage.includes('sts.googleapis.com') || (responseData?.error_description && responseData?.error === 'invalid_grant') || responseData?.error === 'invalid_target') {
    stage = 'GOOGLE_STS';
  } else if (rawMessage.includes('iamcredentials.googleapis.com') || rawMessage.includes('generateAccessToken')) {
    stage = 'SERVICE_ACCOUNT_IMPERSONATION';
  } else if (rawMessage.includes('Vercel OIDC')) {
    stage = 'VERCEL_OIDC';
  }

  const sanitizedMessage = rawMessage
    .replace(/Bearer\s+[A-Za-z0-9-_.]+/gi, 'Bearer [REDACTED]')
    .replace(/token=[A-Za-z0-9-_.]+/gi, 'token=[REDACTED]');

  return {
    stage,
    httpStatus: status,
    googleErrorCode: googleErrorCode ? String(googleErrorCode) : null,
    message: sanitizedMessage
  };
}
