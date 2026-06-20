// Deliberate failing test — validates the cc-ci-fix auto-fix loop end-to-end.
// cc-ci-fix should analyze this failure and push a fix to this PR branch.
describe('dogfood ci-fix validation', () => {
  it('intentionally fails to trigger cc-ci-fix', () => {
    expect(1 + 1).toBe(3);
  });
});
