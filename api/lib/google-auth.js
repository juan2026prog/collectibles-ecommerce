import { ExternalAccountClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';

const GCP_PROJECT_NUMBER = '836776591370';
const GCP_POOL_ID = 'collectibles-vercel';
const GCP_PROVIDER_ID = 'vercel';
const GCP_SERVICE_ACCOUNT = 'collectibles-seo@prueba-463718.iam.gserviceaccount.com';

const AUDIENCE = `//iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${GCP_POOL_ID}/providers/${GCP_PROVIDER_ID}`;
const TOKEN_URL = 'https://sts.googleapis.com/v1/token';
const SERVICE_ACCOUNT_IMPERSONATION_URL = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${GCP_SERVICE_ACCOUNT}:generateAccessToken`;

const SEARCH_CONSOLE_SCOPES = [
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/webmasters.readonly'
];

/**
 * Creates an ExternalAccountClient configured for Vercel OIDC -> GCP Workload Identity Federation
 */
export function createGoogleAuthClient() {
  return ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: AUDIENCE,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: TOKEN_URL,
    service_account_impersonation_url: SERVICE_ACCOUNT_IMPERSONATION_URL,
    subject_token_supplier: {
      async getSubjectToken() {
        try {
          const token = await getVercelOidcToken();
          if (!token) {
            throw new Error('No Vercel OIDC token returned from environment.');
          }
          return token;
        } catch (err) {
          throw new Error(`Failed to acquire Vercel OIDC token: ${err.message || err}`);
        }
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
    vercelOidc: { status: 'PENDING', error: null },
    googleSts: { status: 'PENDING', error: null },
    serviceAccountImpersonation: { status: 'PENDING', error: null },
    client: null
  };

  // Step 1: Vercel OIDC Token Check
  let oidcToken;
  try {
    oidcToken = await getVercelOidcToken();
    if (!oidcToken) {
      throw new Error('Vercel OIDC token is empty or unavailable in current environment.');
    }
    result.vercelOidc.status = 'PASS';
  } catch (err) {
    result.vercelOidc.status = 'FAIL';
    result.vercelOidc.error = {
      stage: 'VERCEL_OIDC',
      message: err.message || 'Error acquiring Vercel OIDC token'
    };
    return result;
  }

  // Step 2 & 3: STS Exchange & Service Account Impersonation via ExternalAccountClient
  try {
    const client = createGoogleAuthClient();
    // Request access token (this triggers STS exchange + IAM impersonation)
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse || !tokenResponse.token) {
      throw new Error('No access token returned from Google Auth exchange.');
    }

    result.googleSts.status = 'PASS';
    result.serviceAccountImpersonation.status = 'PASS';
    result.client = client;
  } catch (err) {
    const errorDetails = sanitizeGoogleAuthError(err);
    result.googleSts.status = errorDetails.stage === 'GOOGLE_STS' ? 'FAIL' : 'UNKNOWN';
    result.serviceAccountImpersonation.status = errorDetails.stage === 'SERVICE_ACCOUNT_IMPERSONATION' ? 'FAIL' : 'FAIL';
    result.googleSts.error = errorDetails;
    result.serviceAccountImpersonation.error = errorDetails;
  }

  return result;
}

/**
 * Sanitizes errors to prevent exposing secrets, tokens or headers
 */
export function sanitizeGoogleAuthError(err) {
  const status = err.status || err.statusCode || err.response?.status || 500;
  const rawMessage = err.message || 'Unknown authentication error';
  const responseData = err.response?.data;

  let googleErrorCode = null;
  let stage = 'GOOGLE_AUTH_EXCHANGE';

  if (typeof responseData === 'object' && responseData !== null) {
    googleErrorCode = responseData.error?.status || responseData.error?.code || responseData.error || null;
  }

  if (rawMessage.includes('sts.googleapis.com') || (responseData?.error_description && responseData?.error === 'invalid_grant')) {
    stage = 'GOOGLE_STS';
  } else if (rawMessage.includes('iamcredentials.googleapis.com') || rawMessage.includes('generateAccessToken')) {
    stage = 'SERVICE_ACCOUNT_IMPERSONATION';
  } else if (rawMessage.includes('Vercel OIDC')) {
    stage = 'VERCEL_OIDC';
  }

  // Sanitize message: strip tokens, auth headers, private keys
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
