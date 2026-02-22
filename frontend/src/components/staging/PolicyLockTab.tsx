"use client";

export default function PolicyLockTab() {
  return (
    <div className="text-sm text-[var(--text-secondary)]">
      <p>Policy hash locked at submission time.</p>
      <p className="mt-2 text-[var(--text-tertiary)]">
        If policy changes after submission, the staged artifact becomes
        invalid. Re-run in Sandbox to create a new proposal with the
        current policy.
      </p>
      <div className="mt-3 p-2 bg-[var(--bg-sub)] rounded">
        <span className="text-[0.75rem] uppercase font-medium text-[var(--text-tertiary)]">
          Policy Enforcement
        </span>
        <ul className="mt-1 space-y-0.5 text-[var(--text-secondary)]">
          <li>• Hash mismatch blocks authorization</li>
          <li>• Re-run in sandbox to align with current policy</li>
          <li>• Frozen artifact preserves original intent</li>
        </ul>
      </div>
    </div>
  );
}
