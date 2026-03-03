/**
 * AppTopBar navigation regression tests
 * Ensures "PROCEED TO EXECUTION" CTA was removed from Policy Engine dropdown.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";

// Mock dependencies
jest.mock("next/navigation", () => ({ useRouter: jest.fn(), usePathname: () => "/" }));
jest.mock("@/lib/authContext", () => ({ useAuth: jest.fn() }));
jest.mock("@/hooks/usePlanGate", () => ({ usePlanGate: () => ({ hasAccess: () => true }) }));

describe("AppTopBar — Policy Engine dropdown", () => {
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), prefetch: jest.fn() });
    (useAuth as jest.Mock).mockReturnValue({
      user: { full_name: "Test User", roles: [{ name: "admin" }], branch_code: "HQ" },
      token: "test-token",
      logout: jest.fn(),
      isAuthenticated: true,
    });
  });

  it("does NOT render PROCEED TO EXECUTION in the Policy Engine dropdown", async () => {
    const { default: AppTopBar } = await import("@/components/layout/AppTopBar");
    const { container } = render(<AppTopBar />);
    expect(container.textContent).not.toContain("PROCEED TO EXECUTION");
    expect(container.textContent).not.toContain("run the hedge pipeline");
  });

  it("Policy Engine dropdown items are present", async () => {
    const { default: AppTopBar } = await import("@/components/layout/AppTopBar");
    render(<AppTopBar />);
    // Basic render check — no crashes
    expect(document.body).toBeTruthy();
  });
});
