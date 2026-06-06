import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markPosted, getDashboard } from './api-client';

describe('A4 api-client', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('PATCHes mark-posted with the optional url and bearer token', async () => {
    localStorage.setItem('accessToken', 'tok');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'p1', status: 'published' }), { status: 200 }),
    );
    const res = await markPosted('p1', 'https://www.vinted.fr/items/9');
    expect(res.status).toBe('published');
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('http://localhost:4000/publications/p1/posted');
    expect((init as any).method).toBe('PATCH');
    expect(JSON.parse((init as any).body).externalUrl).toBe('https://www.vinted.fr/items/9');
    expect((init as any).headers.Authorization).toBe('Bearer tok');
  });

  it('GETs the dashboard with the bearer token', async () => {
    localStorage.setItem('accessToken', 'tok');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ activeListings: 3, publicationsByStatus: {}, successRate: null, byMarketplace: [] }), { status: 200 }),
    );
    const res = await getDashboard();
    expect(res.activeListings).toBe(3);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('http://localhost:4000/dashboard');
    expect((init as any).headers.Authorization).toBe('Bearer tok');
  });
});
