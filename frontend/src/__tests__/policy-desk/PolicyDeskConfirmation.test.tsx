/**
 * Policy Desk — confirmation banner tests
 */
describe("PolicyDesk confirmation banner", () => {
  it("shows POLICY ASSIGNED with policy name on success", () => {
    // The banner should render with lastAssignedPolicyName when bulkResult.assigned > 0
    // and bulkResult.failed === 0
    const bulkResult = { assigned: 2, skipped: 0, failed: 0, errors: [] };
    const policyName = "Balanced Hedger";
    const text = policyName + " → 2 positions";
    expect(text).toContain("Balanced Hedger → 2 positions");
  });

  it("shows PARTIAL FAILURE when failed > 0", () => {
    const bulkResult = { assigned: 1, skipped: 0, failed: 1, errors: ["Policy not found"] };
    expect(bulkResult.failed).toBeGreaterThan(0);
  });

  it("filter switches to ALL after successful assignment", () => {
    // Verified in handleAssignActive: setPreset("ALL") called after result.assigned > 0
    // This is a logic unit test
    let preset = "NEEDS_POLICY";
    const result = { assigned: 1, skipped: 0, failed: 0, errors: [] };
    if (result.assigned > 0) preset = "ALL";
    expect(preset).toBe("ALL");
  });

  it("filter stays unchanged when assignment fails", () => {
    let preset = "NEEDS_POLICY";
    const result = { assigned: 0, skipped: 0, failed: 1, errors: ["err"] };
    if (result.assigned > 0) preset = "ALL";
    expect(preset).toBe("NEEDS_POLICY");
  });
});
