export const colors = {
  background: '#F5F7FB',
  surface: '#FFFFFF',
  ink: '#111B35',
  muted: '#667085',
  line: '#E3E8F1',
  primary: '#2757D7',
  primaryDark: '#183A9E',
  primarySoft: '#E9EFFF',
  accent: '#D8F35A',
  success: '#138A5B',
  successSoft: '#E4F7EF',
  warning: '#A96500',
  warningSoft: '#FFF2D7',
  danger: '#C43D4B',
  dangerSoft: '#FDECEF',
} as const;

export const radius = {
  small: 10,
  medium: 16,
  large: 24,
} as const;

export const shadow = {
  shadowColor: '#142B63',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.08,
  shadowRadius: 20,
  elevation: 3,
} as const;
