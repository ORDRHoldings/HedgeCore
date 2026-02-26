// ─── Custom Bloomberg-style Inline Date Picker ───────────────────────────────────
function InlineDatePicker({
  value, onChange, onBlur, hasError, focusedField, fieldName, onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  hasError: boolean;
  focusedField: string | null;
  fieldName: string;
  onFocus: () => void;
}) {
  const [open, setOpen]           = useState(false);
  const today                     = new Date();
  const initDate                  = value ? new Date(value + 'T00:00:00') : today;
  const [viewYear, setViewYear]   = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [textInput, setTextInput] = useState(value);
  const containerRef              = useRef<HTMLDivElement>(null);

  useEffect(() => { setTextInput(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        onBlur();
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, onBlur]);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS   = ['Mo','Tu','We','Th','Fr','Sa','Su'];

  const firstDay   = new Date(viewYear, viewMonth, 1);
  const lastDay    = new Date(viewYear, viewMonth + 1, 0);
  const firstDow   = (firstDay.getDay() + 6) % 7;
  const totalCells = firstDow + lastDay.getDate();
  const rows       = Math.ceil(totalCells / 7);

  function selectDay(day: number) {
    const mm  = String(viewMonth + 1).padStart(2, '0');
    const dd  = String(day).padStart(2, '0');
`    const iso = ;
    onChange(iso);
    setTextInput(iso);
    setOpen(false);
    onBlur();
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }
  function jumpToQuarter(q: number) {
    const m = (q - 1) * 3;
    setViewMonth(m);
    setViewYear(m < today.getMonth() ? today.getFullYear() + 1 : today.getFullYear());
  }

  function handleTextBlur() {
    const iso = textInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const d = new Date(iso + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        onChange(iso);
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }

  const isFocused   = focusedField === fieldName;
  const borderColor = hasError ? 'var(--accent-red)' : isFocused ? 'var(--accent-cyan)' : 'var(--border-soft)';
  const borderWidth = (hasError || isFocused) ? '2px' : '1px';

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>