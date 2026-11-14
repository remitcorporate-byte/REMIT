/**
 * REMIT brand tokens. These mirror the web app (frontend/tailwind.config.ts,
 * frontend/src/styles.css, frontend/src/pages/landing.css) so the phone and the
 * browser read as the same product. Token names are stable; change values here only.
 */
export const colors = {
  // Surfaces
  background: '#FFFCF7', // web app page background
  surface: '#FFFFFF',
  surfaceWarm: '#FFFEFB', // web field background
  ivory: '#FFF8EE', // landing / auth background
  // Text
  ink: '#211A20',
  aubergine: '#2B132B', // web headings, sidebar, wallet hero
  aubergineDeep: '#1F0B20',
  muted: '#756D73',
  label: '#51484F', // web field labels
  // Lines
  line: '#DED8D3', // web card border
  lineStrong: '#CFC7C4', // web field / secondary button border
  lineSoft: '#EEE9E5', // web row dividers
  // Brand
  primary: '#E85D2A', // web "remit-600" buttons and links
  primaryDark: '#C94719', // web "remit-700" pressed state
  primarySoft: '#FFF3EC', // web "remit-50"
  accent: '#FF5A27', // landing orange (mark, highlights on dark)
  mint: '#B9E8CF',
  // Status (web status-pill palette)
  success: '#226C48',
  successSoft: '#EEF9F3',
  successLine: '#B9E8CF',
  warning: '#9A5B08',
  warningSoft: '#FFF4DF',
  warningLine: '#EFD39E',
  danger: '#B91C1C',
  dangerSoft: '#FEE2E2',
  // Text on aubergine
  onDark: '#FFFFFF',
  onDarkMuted: '#D7C8D4',
  onDarkFaint: '#BAACB8',
  placeholder: '#9C939A',
} as const;

export const radius = {
  small: 8, // web rounded-lg (buttons, fields)
  medium: 12, // web rounded-xl (cards)
  large: 16,
} as const;

export const shadow = {
  shadowColor: '#2B132B',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.07,
  shadowRadius: 18,
  elevation: 2,
} as const;
