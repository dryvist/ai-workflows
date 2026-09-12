const { describe, it, expect } = require('bun:test');
const { renderPrBody, renderVikunjaTaskBody } = require('../.github/scripts/pricing-discovery/render.js');

describe('renderPrBody', () => {
  it('returns null when nothing changed', () => {
    expect(renderPrBody([])).toBeNull();
  });
  it('renders one row per change with old and new values', () => {
    const body = renderPrBody([{ entry: { client_model_id: 'a/b' }, field: 'input_cost_per_token', oldValue: 1, newValue: 2 }]);
    expect(body).toContain('a/b');
    expect(body).toContain('input_cost_per_token');
    expect(body).toContain('| 1 | 2 |');
  });
});

describe('renderVikunjaTaskBody', () => {
  it('returns null when there is nothing needing a human decision', () => {
    expect(renderVikunjaTaskBody([], [], [])).toBeNull();
  });
  it('names a delisted entry and its reason', () => {
    const body = renderVikunjaTaskBody([{ entry: { client_model_id: 'a/b' }, reason: 'gone' }], [], []);
    expect(body).toContain('a/b');
    expect(body).toContain('gone');
    expect(body).toContain('Delisted');
  });
  it('includes the ZDR gate result for a new candidate', () => {
    const body = renderVikunjaTaskBody([], [], [{ id: 'x/y', totalPricePerToken: 0.0000001, cheapestRegistered: 0.0000005, zdrGate: 'PASSED (live 200)' }]);
    expect(body).toContain('x/y');
    expect(body).toContain('PASSED (live 200)');
  });
});
