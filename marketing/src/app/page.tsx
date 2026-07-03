import { ArrowRight, ArrowUpRight, Mail } from "lucide-react";
import { CONTENT as c } from "@/content";

// Generic ORDR product-site renderer — all copy lives in src/content.ts.

function StatusBadge() {
  return (
    <span
      className="mono-label inline-flex items-center gap-1.5 uppercase"
      style={{ color: c.statusTone, fontSize: "0.6875rem", letterSpacing: "0.08em" }}
    >
      <span
        aria-hidden
        className="pulse-dot inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: c.statusTone }}
      />
      {c.status}
    </span>
  );
}

function TerminalPanel() {
  return (
    <div className="panel overflow-hidden" role="img" aria-label={`Illustration: ${c.panel.title}`}>
      <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
        <span className="mono-label flex items-center gap-2 text-muted">
          <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-green" aria-hidden />
          {c.panel.title}
        </span>
        <span className="mono-label text-faint" style={{ fontSize: "0.625rem" }}>
          {c.panel.note}
        </span>
      </div>
      <ul className="px-4 py-3">
        {c.panel.rows.map((r, i) => (
          <li
            key={i}
            className="row-enter mono-label flex items-center gap-3 py-1.5 text-muted"
            style={{ fontSize: "0.71rem", animationDelay: `${i * 140}ms` }}
          >
            <span className="w-16 shrink-0 text-faint">{r.left}</span>
            <span className="min-w-0 flex-1 truncate">{r.mid}</span>
            <span className="shrink-0 font-semibold" style={{ color: c.accent }}>
              {r.right}
            </span>
          </li>
        ))}
      </ul>
      <div className="border-t border-hairline px-4 py-2.5">
        <span className="mono-label text-faint" style={{ fontSize: "0.625rem" }}>
          {c.panel.footer}
        </span>
      </div>
    </div>
  );
}

export default function Page() {
  const mailto = `mailto:${c.contactEmail}?subject=Demo request — ${c.name}`;

  return (
    <>
      {/* ── Nav ── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-hairline bg-ink/90 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <a href="#top" className="flex items-baseline gap-2" aria-label={`${c.name} home`}>
            <span className="display text-lg tracking-tight text-text" style={{ fontWeight: 800 }}>
              ORDR
            </span>
            <span className="mono-label text-faint">
              {c.name.replace("ORDR ", "").toUpperCase()}
            </span>
          </a>
          <div className="hidden items-center gap-7 md:flex">
            <a href="#capabilities" className="mono-label text-muted transition-colors hover:text-accent">
              Capabilities
            </a>
            <a href="#how" className="mono-label text-muted transition-colors hover:text-accent">
              How it works
            </a>
            <a href="#assurance" className="mono-label text-muted transition-colors hover:text-accent">
              Assurance
            </a>
            <a
              href={c.umbrellaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mono-label text-faint transition-colors hover:text-muted"
            >
              ORDR Holdings ↗
            </a>
            <a href={mailto} className="btn btn-primary !px-4 !py-2">
              Request demo
            </a>
          </div>
          <a href={mailto} className="btn btn-primary !px-3 !py-1.5 md:hidden">
            Demo
          </a>
        </nav>
      </header>

      <main id="top" className="pt-14">
        {/* ── Hero ── */}
        <section className="grid-bg border-b border-hairline">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.15fr_1fr] lg:pb-28 lg:pt-24">
            <div>
              <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="mono-label font-semibold" style={{ color: c.accent }}>
                  {c.code}
                </span>
                <span className="mono-label text-faint">{c.discipline}</span>
                <StatusBadge />
              </div>
              <h1 className="display text-[2.6rem] text-text sm:text-6xl lg:text-[4rem]">
                {c.tagline}
              </h1>
              <p className="mt-6 max-w-xl text-lg text-muted">{c.heroLead}</p>
              {c.statusNote && (
                <p
                  className="mono-label mt-4 max-w-xl border-l-2 pl-3 text-muted"
                  style={{ borderColor: c.accent }}
                >
                  {c.statusNote}
                </p>
              )}
              <div className="mt-9 flex flex-wrap gap-3">
                {c.liveUrl && (
                  <a
                    href={c.liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    Open the product <ArrowUpRight size={15} aria-hidden />
                  </a>
                )}
                <a href={mailto} className={c.liveUrl ? "btn btn-ghost" : "btn btn-primary"}>
                  Request a demo
                </a>
              </div>
              <p className="mono-label mt-10 text-faint" style={{ fontSize: "0.625rem" }}>
                built for: {c.audience}
              </p>
            </div>
            <TerminalPanel />
          </div>
        </section>

        {/* ── Numbers ── */}
        <section className="border-b border-hairline bg-panel">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-hairline sm:grid-cols-4">
            {c.numbers.map((n) => (
              <div key={n.label} className="bg-panel px-6 py-8">
                <p className="display text-2xl text-text sm:text-3xl">{n.value}</p>
                <p className="mono-label mt-1.5 text-faint">{n.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Capabilities ── */}
        <section id="capabilities" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-16 lg:py-20">
          <p className="eyebrow mb-3">Capabilities</p>
          <h2 className="display max-w-2xl text-3xl text-text sm:text-4xl">
            What {c.name} actually does.
          </h2>
          <div className="mt-10 grid gap-px border border-hairline bg-hairline md:grid-cols-2 lg:grid-cols-3">
            {c.capabilities.map((cap) => (
              <div key={cap.title} className="bg-ink p-6">
                <span aria-hidden className="mb-4 inline-block h-2 w-2" style={{ background: c.accent }} />
                <h3 className="font-semibold text-text">{cap.title}</h3>
                <p className="mt-2.5 text-sm text-muted">{cap.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="scroll-mt-20 border-y border-hairline bg-panel">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
            <p className="eyebrow mb-3">How it works</p>
            <h2 className="display max-w-2xl text-3xl text-text sm:text-4xl">{c.how.title}</h2>
            <div className="mt-10 grid gap-px border border-hairline bg-hairline md:grid-cols-3">
              {c.how.steps.map((s, i) => (
                <div key={s.title} className="bg-ink p-8">
                  <p className="display text-3xl text-faint">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-4 font-semibold text-text">{s.title}</h3>
                  <p className="mt-2.5 text-sm text-muted">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Assurance ── */}
        <section id="assurance" className="mx-auto max-w-7xl scroll-mt-20 px-6 py-16 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <p className="eyebrow mb-3">Assurance</p>
              <h2 className="display text-3xl text-text">
                Built like the systems it reports to.
              </h2>
              <p className="mt-4 text-muted">
                Security and discipline are not a page on this site — they are
                properties of the codebase, stated here exactly as far as the
                evidence goes.
              </p>
            </div>
            <ul className="panel space-y-3 p-6">
              {c.assurance.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-muted">
                  <span
                    aria-hidden
                    className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0"
                    style={{ background: c.accent }}
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="panel mt-10 flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="mono-label text-muted">stack: {c.stack}</p>
            <p className="mono-label text-faint" style={{ fontSize: "0.625rem" }}>
              verify: sha256:{c.verify}…
            </p>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="border-t border-hairline">
          <div className="mx-auto max-w-7xl px-6 py-16">
            <div className="panel grid-bg px-6 py-14 text-center sm:px-12">
              <h2 className="display mx-auto max-w-2xl text-3xl text-text sm:text-4xl">
                See {c.name} on your own scenario.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-muted">
                One line about your desk is enough — a human replies and walks
                you through the product.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a href={mailto} className="btn btn-primary">
                  <Mail size={15} aria-hidden /> Request a demo
                </a>
                <a
                  href={`${c.umbrellaUrl}${c.productPath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost"
                >
                  View in the ORDR catalogue <ArrowRight size={15} aria-hidden />
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-hairline bg-panel">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="display text-lg text-text" style={{ fontWeight: 800 }}>
              ORDR
            </p>
            <p className="mono-label mt-2 text-faint" style={{ fontSize: "0.625rem" }}>
              {c.ledgerLine}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <a
              href={c.umbrellaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mono-label text-faint transition-colors hover:text-muted"
            >
              ORDR Holdings
            </a>
            <a
              href={`mailto:${c.contactEmail}`}
              className="mono-label text-faint transition-colors hover:text-muted"
            >
              Contact
            </a>
            <p className="mono-label text-faint" style={{ fontSize: "0.6875rem" }}>
              © {new Date().getFullYear()} ORDR Holdings.
              {c.formerName ? ` ${c.name} — formerly ${c.formerName}.` : ""}
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
