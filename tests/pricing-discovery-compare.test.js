const { describe, it, expect } = require('bun:test');
const {
  compareOpenRouter,
  findNewCandidates,
  findNewFreeTierCandidates,
  endpointIsZdr,
} = require('../.github/scripts/pricing-discovery/compare.js');

function entry(overrides = {}) {
  return {
    client_model_id: 'deepseek/deepseek-v4-flash',
    upstream_model_id: 'deepseek/deepseek-v4-flash',
    provider: 'openrouter',
    enabled: true,
    zero_data_retention: false,
    input_cost_per_token: 0.0000001,
    output_cost_per_token: 0.0000004,
    context_window: 1000000,
    file: 'llm-models.d/50-openrouter.yml',
    ...overrides,
  };
}

describe('compareOpenRouter', () => {
  it('reports a price change on an existing entry', () => {
    const model = { id: 'deepseek/deepseek-v4-flash', pricing: { prompt: '0.0000002', completion: '0.0000004' }, context_length: 1000000 };
    const { priceChanges } = compareOpenRouter([entry()], [model], {});
    expect(priceChanges).toHaveLength(1);
    expect(priceChanges[0].field).toBe('input_cost_per_token');
    expect(priceChanges[0].newValue).toBe(0.0000002);
  });

  it('reports no change when prices are identical', () => {
    const model = { id: 'deepseek/deepseek-v4-flash', pricing: { prompt: '0.0000001', completion: '0.0000004' }, context_length: 1000000 };
    const { priceChanges } = compareOpenRouter([entry()], [model], {});
    expect(priceChanges).toHaveLength(0);
  });

  it('flags a delisting when the id disappears from /api/v1/models', () => {
    const { delistings } = compareOpenRouter([entry()], [], {});
    expect(delistings).toHaveLength(1);
  });

  it('skips a disabled entry entirely', () => {
    const { priceChanges, delistings } = compareOpenRouter([entry({ enabled: false })], [], {});
    expect(priceChanges).toHaveLength(0);
    expect(delistings).toHaveLength(0);
  });

  it('flags a ZDR revocation when every endpoint reports data retention', () => {
    const e = entry({ zero_data_retention: true });
    const model = { id: e.upstream_model_id, pricing: { prompt: '0.0000001', completion: '0.0000004' } };
    const endpoints = { [e.upstream_model_id]: { data: { endpoints: [{ zero_data_retention: false }] } } };
    const { zdrRevocations } = compareOpenRouter([e], [model], endpoints);
    expect(zdrRevocations).toHaveLength(1);
  });

  it('does not flag a ZDR revocation when at least one endpoint is ZDR', () => {
    const e = entry({ zero_data_retention: true });
    const model = { id: e.upstream_model_id, pricing: { prompt: '0.0000001', completion: '0.0000004' } };
    const endpoints = { [e.upstream_model_id]: { data: { endpoints: [{ zero_data_retention: false }, { zero_data_retention: true }] } } };
    const { zdrRevocations } = compareOpenRouter([e], [model], endpoints);
    expect(zdrRevocations).toHaveLength(0);
  });
});

describe('endpointIsZdr', () => {
  it('reads the boolean field when present', () => {
    expect(endpointIsZdr({ zero_data_retention: true })).toBe('yes');
    expect(endpointIsZdr({ zdr: false })).toBe('no');
  });
  it('reads a nested data_policy.dataRetention string', () => {
    expect(endpointIsZdr({ data_policy: { dataRetention: 'none' } })).toBe('yes');
    expect(endpointIsZdr({ data_policy: { dataRetention: 'retained' } })).toBe('no');
  });
  it('returns unknown for an unrecognized shape rather than guessing', () => {
    expect(endpointIsZdr({ something_else: 1 })).toBe('unknown');
  });
});

describe('findNewCandidates', () => {
  it('finds an id cheaper than the cheapest registered ZDR paid rung', () => {
    const registry = [entry({ zero_data_retention: true, input_cost_per_token: 0.0000005, output_cost_per_token: 0.0000005 })];
    const models = [{ id: 'new/cheap-model', pricing: { prompt: '0.0000001', completion: '0.0000001' } }];
    const found = findNewCandidates(registry, models);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('new/cheap-model');
  });

  it('ignores an id already in the registry', () => {
    const registry = [entry({ zero_data_retention: true, input_cost_per_token: 0.0000005, output_cost_per_token: 0.0000005 })];
    const models = [{ id: registry[0].upstream_model_id, pricing: { prompt: '0.0000001', completion: '0.0000001' } }];
    expect(findNewCandidates(registry, models)).toHaveLength(0);
  });

  it('returns nothing when the registry has no ZDR paid rung to compare against', () => {
    expect(findNewCandidates([entry({ zero_data_retention: false })], [{ id: 'x', pricing: { prompt: '0', completion: '0' } }])).toHaveLength(0);
  });
});

describe('findNewFreeTierCandidates', () => {
  it('finds a free opencode-tier id not already registered', () => {
    const catalog = [{ id: 'opencode/free-model', provider: 'opencode', cost: { input: 0, output: 0 } }];
    expect(findNewFreeTierCandidates([], catalog)).toHaveLength(1);
  });
  it('ignores a non-free entry and a non-opencode provider', () => {
    const catalog = [
      { id: 'opencode/paid-model', provider: 'opencode', cost: { input: 0.001, output: 0.001 } },
      { id: 'anthropic/claude', provider: 'anthropic', cost: { input: 0, output: 0 } },
    ];
    expect(findNewFreeTierCandidates([], catalog)).toHaveLength(0);
  });
});
