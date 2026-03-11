/**
 * @jest-environment jsdom
 */
import { render } from "@testing-library/react";
import { PageShell } from "@/components/layout/PageShell";
import { Microscope } from "lucide-react";

describe("PageShell", () => {
  it("renders title", () => {
    const { getByText } = render(
      <PageShell icon={Microscope} title="Audit Lab">
        <p>Content</p>
      </PageShell>
    );
    expect(getByText("Audit Lab")).toBeTruthy();
  });

  it("renders breadcrumb", () => {
    const { getByText } = render(
      <PageShell icon={Microscope} title="Audit Lab" breadcrumb={["Dashboard", "Audit Lab"]}>
        <p>Content</p>
      </PageShell>
    );
    expect(getByText("Dashboard \u2192 Audit Lab")).toBeTruthy();
  });

  it("renders children", () => {
    const { getByText } = render(
      <PageShell icon={Microscope} title="Test"><p>Hello</p></PageShell>
    );
    expect(getByText("Hello")).toBeTruthy();
  });

  it("renders actions slot", () => {
    const { getByText } = render(
      <PageShell icon={Microscope} title="Test" actions={<button>Run</button>}>
        <p>Content</p>
      </PageShell>
    );
    expect(getByText("Run")).toBeTruthy();
  });

  it("has breadcrumb nav with aria-label", () => {
    const { container } = render(
      <PageShell icon={Microscope} title="Test" breadcrumb={["A", "B"]}>
        <p>C</p>
      </PageShell>
    );
    const nav = container.querySelector("nav[aria-label='Breadcrumb']");
    expect(nav).toBeTruthy();
  });
});
