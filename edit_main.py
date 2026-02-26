import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

path = r"D:\Synexiun-SynexFund\HedgeCalc\FXDemorontend\srcpp\input\page.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()
print(f"Loaded: {len(content)} chars")

# E1: Add useRef
o1 = b"import { useState, useMemo, useCallback, useEffect, Suspense } from 'react';".decode()
n1 = b"import { useState, useMemo, useCallback, useEffect, useRef, Suspense } from 'react';".decode()
if o1 not in content:
    print("E1 SKIP (already done)")
else:
    content = content.replace(o1, n1, 1)
    print("E1 useRef: done")

# E3: state vars
o3 = "  const [inlineSaving, setInlineSaving]   = useState(false);"
n3 = ("  const [inlineSaving, setInlineSaving]   = useState(false);
"
      "  const [amountDisplay, setAmountDisplay] = useState('');
"
      "  const [focusedField, setFocusedField]   = useState<string | null>(null);")
if o3 not in content:
    print("E3 SKIP (already done)")
else:
    content = content.replace(o3, n3, 1)
    print("E3 state vars: done")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print(f"Written: {len(content)} chars")
