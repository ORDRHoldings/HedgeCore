import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
PAGE_PATH = 'D:/Synexiun/1-SynexFund/HedgeCalc/FXDemo/frontend/src/app/input/page.tsx'
with open(PAGE_PATH, 'r', encoding='utf-8') as f:
    content = f.read()
MARKER = '  const [inlineSaving, setInlineSaving]   = useState(false);'
ADDITION = chr(10) + '  const [amountDisplay, setAmountDisplay] = useState('');' + chr(10) + '  const [focusedField, setFocusedField]   = useState<string | null>(null);'
if MARKER + ADDITION in content:
    print("E3 SKIP already done")
elif MARKER in content:
    content = content.replace(MARKER, MARKER + ADDITION, 1)
    with open(PAGE_PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print('E3 done, len:', len(content))
else:
    print('E3 ERROR: marker not found')
