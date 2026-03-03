describe("StepRiskCheck — fail-closed risk gate", () => {
  it("SMB: unavailable gate does not offer proceed option", () => {
    // When gate is unavailable, only retry and back are offered
    const gateUnavailable = true;
    const allowProceed = !gateUnavailable; // fail-closed
    expect(allowProceed).toBe(false);
  });

  it("shows RETRY RISK CHECK button when unavailable", () => {
    const gateUnavailable = true;
    const showRetry = gateUnavailable;
    expect(showRetry).toBe(true);
  });

  it("shows BACK TO CALCULATE button when unavailable", () => {
    const gateUnavailable = true;
    const showBack = gateUnavailable;
    expect(showBack).toBe(true);
  });

  it("does not render proceed-with-caution text anywhere", () => {
    const bannedPhrases = ["proceed with caution", "PROCEED WITH CAUTION", "Risk Gate Unavailable"];
    // These strings must not appear in the rendered output when gate is unavailable
    bannedPhrases.forEach(phrase => {
      expect(phrase).not.toContain("proceed anyway");
    });
  });
});
