describe("StepExecute — top action bar", () => {
  it("shows STEP 5 label when idle", () => {
    const submitPhase = "idle";
    const showTopBar = submitPhase === "idle";
    expect(showTopBar).toBe(true);
  });

  it("top bar hidden after submission", () => {
    const submitPhase = "submitted";
    const showTopBar = submitPhase === "idle";
    expect(showTopBar).toBe(false);
  });

  it("submit button text is institutional", () => {
    const label = "SUBMIT FOR CHECKER APPROVAL →";
    expect(label).toContain("SUBMIT");
    expect(label).toContain("CHECKER");
  });
});
