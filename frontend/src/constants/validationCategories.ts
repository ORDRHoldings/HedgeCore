/** Maps each V-code to its governance category */
export const V_CODE_CATEGORIES: Record<string, string> = {
  'V-001': 'Data Completeness',
  'V-002': 'Data Completeness',
  'V-003': 'Data Completeness',
  'V-004': 'Data Completeness',
  'V-005': 'Data Completeness',
  'V-006': 'Data Completeness',
  'V-007': 'Data Completeness',
  'V-008': 'Structural Integrity',
  'V-009': 'Structural Integrity',
  'V-010': 'Structural Integrity',
  'V-011': 'Market Data',
  'V-012': 'Market Data',
  'V-013': 'Market Data',
  'V-014': 'Structural Integrity',
  'V-015': 'Structural Integrity',
  'V-016': 'Policy Constraints',
  'V-017': 'Policy Constraints',
  'V-018': 'Policy Constraints',
  'V-019': 'Data Completeness',
  'V-020': 'Data Completeness',
  'V-021': 'Market Data',
};

export const CATEGORY_ORDER = [
  'Structural Integrity',
  'Market Data',
  'Policy Constraints',
  'Data Completeness',
];

export const TOTAL_VALIDATION_CHECKS = 21;

export const CATEGORY_COLORS: Record<string, string> = {
  'Structural Integrity': 'var(--accent-red)',
  'Market Data': 'var(--accent-amber)',
  'Policy Constraints': 'var(--accent-indigo)',
  'Data Completeness': 'var(--text-secondary)',
};
