export const BRAND = {
  // Matches the dark gradient used in docs/mockups/pulse-digest-sample.html
  gradientStart: '#0F172A',
  gradientEnd:   '#1E293B',
  accentCyan:    '#00F0FF',
  mark:          'L',
  wordmark:      'Logistic Intel',
  footerCity:    'Atlanta, GA',
  primary:       '#3B82F6',
  textDark:      '#0F172A',
  textMuted:     '#64748B',
} as const;

export const PDF_PAGE = {
  width:  612,   // letter
  height: 792,
  marginX: 36,
  marginTop: 90,    // leaves room for branded header on every page
  marginBottom: 50, // leaves room for footer
} as const;
