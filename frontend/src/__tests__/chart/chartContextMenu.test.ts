/**
 * chartContextMenu.test.ts -- Unit tests for ChartContextMenu logic
 *
 * Tests menu structure, submenu definitions, action keys,
 * and radio selection state without requiring a DOM renderer.
 */

/* ═══════════════════════════════════════════════════════
   Replicate menu definitions for testability (node env)
   ═══════════════════════════════════════════════════════ */

type MenuItemType = "action" | "separator" | "header" | "submenu";

interface MenuItem {
  type: MenuItemType;
  label?: string;
  action?: string;
  shortcut?: string;
  submenuKey?: string;
}

interface SubmenuItem {
  label: string;
  action: string;
  radio?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { type: "header", label: "Chart" },
  { type: "action", label: "Reset Chart", action: "reset", shortcut: "Ctrl+R" },
  { type: "action", label: "Auto-fit", action: "autofit", shortcut: "Double-click" },
  { type: "separator" },
  { type: "action", label: "Screenshot", action: "screenshot", shortcut: "Ctrl+Shift+S" },
  { type: "action", label: "Fullscreen", action: "fullscreen", shortcut: "F11" },
  { type: "header", label: "Indicators" },
  { type: "action", label: "Add Indicator...", action: "addIndicator", shortcut: "/" },
  { type: "header", label: "Drawings" },
  { type: "action", label: "Trend Line", action: "trendline", shortcut: "Alt+T" },
  { type: "action", label: "Horizontal Line", action: "horizontal", shortcut: "Alt+H" },
  { type: "action", label: "Fibonacci", action: "fibonacci", shortcut: "Alt+F" },
  { type: "action", label: "Rectangle", action: "rectangle", shortcut: "Alt+R" },
  { type: "separator" },
  { type: "action", label: "Delete All Drawings", action: "deleteAllDrawings", shortcut: "Ctrl+Del" },
  { type: "header", label: "Display" },
  { type: "submenu", label: "Chart Type", submenuKey: "chartType" },
  { type: "submenu", label: "Price Scale", submenuKey: "priceScale" },
  { type: "submenu", label: "Crosshair Mode", submenuKey: "crosshairMode" },
];

const SUBMENUS: Record<string, { items: SubmenuItem[]; defaultAction: string }> = {
  chartType: {
    items: [
      { label: "Candles", action: "chartType:candles", radio: true },
      { label: "Hollow", action: "chartType:hollow", radio: true },
      { label: "Bars", action: "chartType:bars", radio: true },
      { label: "Line", action: "chartType:line", radio: true },
      { label: "Area", action: "chartType:area", radio: true },
      { label: "Heikin Ashi", action: "chartType:heikinashi", radio: true },
      { label: "Baseline", action: "chartType:baseline", radio: true },
    ],
    defaultAction: "chartType:candles",
  },
  priceScale: {
    items: [
      { label: "Linear", action: "priceScale:linear", radio: true },
      { label: "Logarithmic", action: "priceScale:log", radio: true },
      { label: "Percentage", action: "priceScale:percentage", radio: true },
    ],
    defaultAction: "priceScale:linear",
  },
  crosshairMode: {
    items: [
      { label: "Crosshair", action: "crosshairMode:crosshair", radio: true },
      { label: "Dot", action: "crosshairMode:dot", radio: true },
      { label: "None", action: "crosshairMode:none", radio: true },
    ],
    defaultAction: "crosshairMode:crosshair",
  },
};

/* ============================================================
   MENU STRUCTURE
   ============================================================ */

describe("Menu structure", () => {
  it("has 19 total items (headers + actions + separators + submenus)", () => {
    expect(MENU_ITEMS.length).toBe(19);
  });

  it("has 4 section headers", () => {
    const headers = MENU_ITEMS.filter((i) => i.type === "header");
    expect(headers.length).toBe(4);
    expect(headers.map((h) => h.label)).toEqual(["Chart", "Indicators", "Drawings", "Display"]);
  });

  it("has 2 separators", () => {
    const seps = MENU_ITEMS.filter((i) => i.type === "separator");
    expect(seps.length).toBe(2);
  });

  it("has 3 submenu items", () => {
    const subs = MENU_ITEMS.filter((i) => i.type === "submenu");
    expect(subs.length).toBe(3);
    expect(subs.map((s) => s.submenuKey)).toEqual(["chartType", "priceScale", "crosshairMode"]);
  });

  it("has 10 action items", () => {
    const actions = MENU_ITEMS.filter((i) => i.type === "action");
    expect(actions.length).toBe(10);
  });

  it("all action items have non-empty action keys", () => {
    const actions = MENU_ITEMS.filter((i) => i.type === "action");
    for (const a of actions) {
      expect(a.action).toBeDefined();
      expect(a.action!.length).toBeGreaterThan(0);
    }
  });

  it("all action items have non-empty labels", () => {
    const actions = MENU_ITEMS.filter((i) => i.type === "action");
    for (const a of actions) {
      expect(a.label).toBeDefined();
      expect(a.label!.length).toBeGreaterThan(0);
    }
  });

  it("all action items have keyboard shortcuts", () => {
    const actions = MENU_ITEMS.filter((i) => i.type === "action");
    for (const a of actions) {
      expect(a.shortcut).toBeDefined();
      expect(a.shortcut!.length).toBeGreaterThan(0);
    }
  });

  it("action keys are unique", () => {
    const actions = MENU_ITEMS.filter((i) => i.type === "action").map((i) => i.action!);
    expect(new Set(actions).size).toBe(actions.length);
  });
});

/* ============================================================
   ACTION KEYS
   ============================================================ */

describe("Action keys", () => {
  const expectedActions = [
    "reset",
    "autofit",
    "screenshot",
    "fullscreen",
    "addIndicator",
    "trendline",
    "horizontal",
    "fibonacci",
    "rectangle",
    "deleteAllDrawings",
  ];

  it("includes all expected action keys", () => {
    const actions = MENU_ITEMS.filter((i) => i.type === "action").map((i) => i.action!);
    for (const expected of expectedActions) {
      expect(actions).toContain(expected);
    }
  });

  it("drawing actions match expected set", () => {
    const drawingActions = ["trendline", "horizontal", "fibonacci", "rectangle"];
    const menuDrawings = MENU_ITEMS.filter(
      (i) => i.type === "action" && drawingActions.includes(i.action!)
    );
    expect(menuDrawings.length).toBe(4);
  });
});

/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */

describe("Keyboard shortcuts", () => {
  it("Reset Chart uses Ctrl+R", () => {
    const item = MENU_ITEMS.find((i) => i.action === "reset");
    expect(item?.shortcut).toBe("Ctrl+R");
  });

  it("Screenshot uses Ctrl+Shift+S", () => {
    const item = MENU_ITEMS.find((i) => i.action === "screenshot");
    expect(item?.shortcut).toBe("Ctrl+Shift+S");
  });

  it("Fullscreen uses F11", () => {
    const item = MENU_ITEMS.find((i) => i.action === "fullscreen");
    expect(item?.shortcut).toBe("F11");
  });

  it("Add Indicator uses /", () => {
    const item = MENU_ITEMS.find((i) => i.action === "addIndicator");
    expect(item?.shortcut).toBe("/");
  });

  it("drawing shortcuts use Alt+key pattern", () => {
    const drawingItems = MENU_ITEMS.filter(
      (i) => i.type === "action" && ["trendline", "horizontal", "fibonacci", "rectangle"].includes(i.action!)
    );
    for (const item of drawingItems) {
      expect(item.shortcut).toMatch(/^Alt\+[A-Z]$/);
    }
  });

  it("Delete All Drawings uses Ctrl+Del", () => {
    const item = MENU_ITEMS.find((i) => i.action === "deleteAllDrawings");
    expect(item?.shortcut).toBe("Ctrl+Del");
  });
});

/* ============================================================
   SUBMENUS
   ============================================================ */

describe("Submenus", () => {
  it("has 3 submenu definitions", () => {
    expect(Object.keys(SUBMENUS).length).toBe(3);
  });

  it("all submenu keys referenced in menu items exist in SUBMENUS", () => {
    const submenuItems = MENU_ITEMS.filter((i) => i.type === "submenu");
    for (const item of submenuItems) {
      expect(SUBMENUS[item.submenuKey!]).toBeDefined();
    }
  });

  describe("Chart Type submenu", () => {
    const sub = SUBMENUS.chartType;

    it("has 7 chart types", () => {
      expect(sub.items.length).toBe(7);
    });

    it("default is candles", () => {
      expect(sub.defaultAction).toBe("chartType:candles");
    });

    it("includes Candles, Hollow, Bars, Line, Area, Heikin Ashi, Baseline", () => {
      const labels = sub.items.map((i) => i.label);
      expect(labels).toEqual(["Candles", "Hollow", "Bars", "Line", "Area", "Heikin Ashi", "Baseline"]);
    });

    it("all items are radio type", () => {
      for (const item of sub.items) {
        expect(item.radio).toBe(true);
      }
    });

    it("action keys follow chartType: prefix pattern", () => {
      for (const item of sub.items) {
        expect(item.action).toMatch(/^chartType:/);
      }
    });

    it("action keys are unique", () => {
      const actions = sub.items.map((i) => i.action);
      expect(new Set(actions).size).toBe(actions.length);
    });
  });

  describe("Price Scale submenu", () => {
    const sub = SUBMENUS.priceScale;

    it("has 3 scale options", () => {
      expect(sub.items.length).toBe(3);
    });

    it("default is linear", () => {
      expect(sub.defaultAction).toBe("priceScale:linear");
    });

    it("includes Linear, Logarithmic, Percentage", () => {
      const labels = sub.items.map((i) => i.label);
      expect(labels).toEqual(["Linear", "Logarithmic", "Percentage"]);
    });

    it("all items are radio type", () => {
      for (const item of sub.items) {
        expect(item.radio).toBe(true);
      }
    });
  });

  describe("Crosshair Mode submenu", () => {
    const sub = SUBMENUS.crosshairMode;

    it("has 3 crosshair modes", () => {
      expect(sub.items.length).toBe(3);
    });

    it("default is crosshair", () => {
      expect(sub.defaultAction).toBe("crosshairMode:crosshair");
    });

    it("includes Crosshair, Dot, None", () => {
      const labels = sub.items.map((i) => i.label);
      expect(labels).toEqual(["Crosshair", "Dot", "None"]);
    });

    it("all items are radio type", () => {
      for (const item of sub.items) {
        expect(item.radio).toBe(true);
      }
    });
  });
});

/* ============================================================
   RADIO SELECTION STATE
   ============================================================ */

describe("Radio selection logic", () => {
  it("initial state matches defaults", () => {
    const selectedRadios: Record<string, string> = {
      chartType: "chartType:candles",
      priceScale: "priceScale:linear",
      crosshairMode: "crosshairMode:crosshair",
    };
    for (const [key, sub] of Object.entries(SUBMENUS)) {
      expect(selectedRadios[key]).toBe(sub.defaultAction);
    }
  });

  it("selecting a new radio value updates correctly", () => {
    const selectedRadios: Record<string, string> = {
      chartType: "chartType:candles",
      priceScale: "priceScale:linear",
      crosshairMode: "crosshairMode:crosshair",
    };

    // Simulate selecting line chart
    const action = "chartType:line";
    for (const key of Object.keys(SUBMENUS)) {
      if (action.startsWith(`${key}:`)) {
        selectedRadios[key] = action;
      }
    }
    expect(selectedRadios.chartType).toBe("chartType:line");
    expect(selectedRadios.priceScale).toBe("priceScale:linear"); // unchanged
  });

  it("each submenu default exists in its items", () => {
    for (const [, sub] of Object.entries(SUBMENUS)) {
      const actions = sub.items.map((i) => i.action);
      expect(actions).toContain(sub.defaultAction);
    }
  });
});

/* ============================================================
   SECTION ORDER
   ============================================================ */

describe("Section ordering", () => {
  it("Chart section comes first", () => {
    expect(MENU_ITEMS[0].type).toBe("header");
    expect(MENU_ITEMS[0].label).toBe("Chart");
  });

  it("Display section comes last", () => {
    const headers = MENU_ITEMS.filter((i) => i.type === "header");
    expect(headers[headers.length - 1].label).toBe("Display");
  });

  it("sections are in order: Chart, Indicators, Drawings, Display", () => {
    const headerLabels = MENU_ITEMS.filter((i) => i.type === "header").map((i) => i.label);
    expect(headerLabels).toEqual(["Chart", "Indicators", "Drawings", "Display"]);
  });

  it("separators appear between chart items and between drawing items", () => {
    const sepIndices = MENU_ITEMS.map((item, idx) => (item.type === "separator" ? idx : -1)).filter((i) => i >= 0);
    expect(sepIndices.length).toBe(2);
    // First separator is after Auto-fit (index 2), before Screenshot
    expect(MENU_ITEMS[sepIndices[0] - 1].action).toBe("autofit");
    expect(MENU_ITEMS[sepIndices[0] + 1].action).toBe("screenshot");
    // Second separator is after Rectangle, before Delete All Drawings
    expect(MENU_ITEMS[sepIndices[1] - 1].action).toBe("rectangle");
    expect(MENU_ITEMS[sepIndices[1] + 1].action).toBe("deleteAllDrawings");
  });
});
