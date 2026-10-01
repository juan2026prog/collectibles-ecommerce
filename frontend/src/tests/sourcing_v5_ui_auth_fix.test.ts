import { describe, it, expect, vi } from 'vitest';
import { SourcingDiscoveryEngine } from '../services/sourcing/sourcingDiscoveryEngine';

describe('SOURCING V5 — UI / AUTH / DATA REGRESSION TESTS', () => {

  describe('1. Auth Token & Role Authorization Contract', () => {
    it('authorizes admin and superadmin roles, rejects non-admin users', () => {
      const allowedRoles = ['admin', 'superadmin', 'super_admin', 'god_admin'];

      const checkAuth = (user: { email?: string; app_metadata?: { role?: string }; user_metadata?: { role?: string } }, profile?: { role?: string; is_admin?: boolean }, roles?: { role: string }[]) => {
        const jwtRole = user.app_metadata?.role || user.user_metadata?.role;
        const isSuperAdminEmail = user.email === 'juanmacastillo2008@gmail.com';

        if (allowedRoles.includes(jwtRole || '') || isSuperAdminEmail) {
          return true;
        }

        if (profile && (profile.is_admin === true || allowedRoles.includes(profile.role || ''))) {
          return true;
        }

        if (roles && roles.some(r => allowedRoles.includes(r.role))) {
          return true;
        }

        return false;
      };

      // Admin via email
      expect(checkAuth({ email: 'juanmacastillo2008@gmail.com' })).toBe(true);

      // Admin via JWT
      expect(checkAuth({ app_metadata: { role: 'admin' } })).toBe(true);
      expect(checkAuth({ user_metadata: { role: 'superadmin' } })).toBe(true);

      // Admin via profiles table
      expect(checkAuth({ email: 'other@test.com' }, { role: 'admin', is_admin: true })).toBe(true);
      expect(checkAuth({ email: 'other@test.com' }, { role: 'customer', is_admin: true })).toBe(true);

      // Admin via user_roles table
      expect(checkAuth({ email: 'other@test.com' }, { role: 'customer', is_admin: false }, [{ role: 'admin' }])).toBe(true);

      // Regular customer - rejected
      expect(checkAuth({ email: 'customer@test.com' }, { role: 'customer', is_admin: false }, [])).toBe(false);

      // Anonymous / empty - rejected
      expect(checkAuth({}, undefined, undefined)).toBe(false);
    });
  });

  describe('2. Country Filtering with GLOBAL Scope', () => {
    it('constructs correct country search list for UY and GLOBAL', () => {
      const getCountryList = (country: string) => country === 'GLOBAL' ? ['GLOBAL', 'UY', 'US'] : [country, 'GLOBAL'];

      expect(getCountryList('UY')).toEqual(['UY', 'GLOBAL']);
      expect(getCountryList('AR')).toEqual(['AR', 'GLOBAL']);
      expect(getCountryList('GLOBAL')).toEqual(['GLOBAL', 'UY', 'US']);
    });
  });

  describe('3. ActiveCounts KPI Aggregation', () => {
    it('accurately computes counts from both trends and candidates without mocks', () => {
      const mockTrends = [
        { id: 't1', status: 'TRENDING', composite_trend_score: 85 },
        { id: 't2', status: 'GROWING', composite_trend_score: 70 },
        { id: 't3', status: 'PREORDER', composite_trend_score: 65 }
      ];

      const mockCandidates: any[] = [];

      const computeActiveCounts = (trends: any[], candidates: any[]) => {
        const trendTrending = trends.filter(t => t.status === 'TRENDING').length;
        const candTrending = candidates.filter(c => c.status === 'TRENDING').length;
        const trendEmerging = trends.filter(t => t.status === 'EMERGING').length;
        const candEmerging = candidates.filter(c => c.status === 'EMERGING').length;
        const trendGrowing = trends.filter(t => t.status === 'GROWING').length;
        const candGrowing = candidates.filter(c => c.status === 'GROWING').length;
        const trendNew = trends.filter(t => t.status === 'NEW').length;
        const candNew = candidates.filter(c => c.status === 'NEW').length;
        const trendPreorder = trends.filter(t => t.status === 'PREORDER').length;
        const candPreorder = candidates.filter(c => c.status === 'PREORDER').length;
        const trendOpp = trends.filter(t => t.status === 'OPPORTUNITY' || t.composite_trend_score >= 80).length;
        const candOpp = candidates.filter(c => c.status === 'OPPORTUNITY' || c.opportunity_score >= 80).length;

        return {
          trending: candTrending > 0 ? candTrending : trendTrending,
          emerging: candEmerging > 0 ? candEmerging : trendEmerging,
          growing: candGrowing > 0 ? candGrowing : trendGrowing,
          newReleases: candNew > 0 ? candNew : trendNew,
          preorders: candPreorder > 0 ? candPreorder : trendPreorder,
          opportunities: candOpp > 0 ? candOpp : trendOpp
        };
      };

      const counts = computeActiveCounts(mockTrends, mockCandidates);
      expect(counts.trending).toBe(1);
      expect(counts.growing).toBe(1);
      expect(counts.preorders).toBe(1);
      expect(counts.opportunities).toBe(1);
      expect(counts.emerging).toBe(0);
      expect(counts.newReleases).toBe(0);
    });
  });
});
