const { describe, it, expect } = require('bun:test');
const { zdrGateCandidate } = require('../.github/scripts/pricing-discovery/zdr-gate.js');

describe('zdrGateCandidate', () => {
  it('reports not-attempted when no API key is present', async () => {
    const result = await zdrGateCandidate('a/b', { apiKey: '', fetchFn: () => { throw new Error('must not be called'); } });
    expect(result).toContain('not attempted');
  });

  it('reports PASSED on a live 200', async () => {
    const fetchFn = async () => ({ ok: true, status: 200 });
    const result = await zdrGateCandidate('a/b', { apiKey: 'k', fetchFn });
    expect(result).toContain('PASSED');
  });

  it('reports FAILED with the status on a non-200', async () => {
    const fetchFn = async () => ({ ok: false, status: 404 });
    const result = await zdrGateCandidate('a/b', { apiKey: 'k', fetchFn });
    expect(result).toContain('FAILED');
    expect(result).toContain('404');
  });

  it('reports FAILED when the request itself throws', async () => {
    const fetchFn = async () => { throw new Error('network down'); };
    const result = await zdrGateCandidate('a/b', { apiKey: 'k', fetchFn });
    expect(result).toContain('FAILED');
    expect(result).toContain('network down');
  });
});
