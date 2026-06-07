import { sseQueryTokenExtractor } from './jwt.strategy';

describe('sseQueryTokenExtractor', () => {
  it('returns the access_token query param on the SSE stream route', () => {
    const req: any = { path: '/listings/abc/publications/stream', query: { access_token: 'tok' } };
    expect(sseQueryTokenExtractor(req)).toBe('tok');
  });

  it('returns null on a non-SSE route even when access_token is present', () => {
    const req: any = { path: '/listings/abc/publications', query: { access_token: 'tok' } };
    expect(sseQueryTokenExtractor(req)).toBeNull();
  });

  it('returns null on the SSE route when no token is present', () => {
    const req: any = { path: '/listings/abc/publications/stream', query: {} };
    expect(sseQueryTokenExtractor(req)).toBeNull();
  });

  it('ignores a query string suffix on the path', () => {
    const req: any = { path: '/listings/abc/publications/stream', url: '/listings/abc/publications/stream?access_token=tok', query: { access_token: 'tok' } };
    expect(sseQueryTokenExtractor(req)).toBe('tok');
  });
});
