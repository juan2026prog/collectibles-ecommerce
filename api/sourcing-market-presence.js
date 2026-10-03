import { authenticateRequest } from '../server/lib/authGuard.js';
import { verifyCandidateSources } from '../server/lib/sourcingSourceVerifier.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST requerido' });
  const auth = await authenticateRequest(req);
  if (!auth.authenticated || !auth.isSuperAdmin) return res.status(403).json({ error: 'SUPERADMIN requerido' });
  // Client-supplied provenance is never authoritative. Reverify the actual page.
  const { asin, source_url, title, action, country = 'UY' } = req.body || {};
  if (action === 'validate_candidate' && title && source_url) {
    const c = await verifyCandidateSources({ title, url: source_url, asin, brand: req.body.brand, id: req.body.id }, { country });
    return res.status(200).json({ candidate: c });
  }
  if (!/^[A-Z0-9]{10}$/i.test(asin || '') || !title || !source_url) return res.status(200).json({ status: 'NOT_CHECKED', presence: 'UNKNOWN', found: false, exactMatch: false, priceUsd: null, statusMessage: 'Identificador y producto pendientes de verificación' });
  const c = await verifyCandidateSources({ asin, title, url: source_url }, { country: 'UY' });
  return res.status(200).json({ asin, ...c.market_presence.tiendamia, identifier_verification: c.provenance.asin.verification });
}
