import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

path = r"D:\Synexiun\1-SynexFund\HedgeCalc\FXDemo\frontend\src\app\input\page.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()
original_len = len(content)
print(f"Original: {original_len} chars")

# EDIT 1: useRef
OLD_IMPORT = "import { useState, useMemo, useCallback, useEffect, Suspense } from 'react';"
NEW_IMPORT = "import { useState, useMemo, useCallback, useEffect, useRef, Suspense } from 'react';"
if OLD_IMPORT not in content: print("ERROR E1"); import sys; sys.exit(1)
content = content.replace(OLD_IMPORT, NEW_IMPORT, 1)
print("E1 useRef: done")
