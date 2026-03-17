export type AccentColor = 'blue' | 'orange';
export type ThemeMode = 'light' | 'dark' | 'system';

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

const BLUE_DARK  = { blue80: '#002D9C', blue60: '#0F62FE', blue60h: '#0353E9', blue40: '#78A9FF', blue20: '#D0E2FF' };
const ORANGE_DARK = { blue80: '#8A3800', blue60: '#E04E17', blue60h: '#C43D0F', blue40: '#FF832B', blue20: '#FFE0C7' };

const BLUE_LIGHT  = { blue80: '#002D9C', blue60: '#0F62FE', blue60h: '#0353E9', blue40: '#0043CE', blue20: '#D0E2FF' };
const ORANGE_LIGHT = { blue80: '#8A3800', blue60: '#E04E17', blue60h: '#C43D0F', blue40: '#BA4E00', blue20: '#FFE0C7' };

const DARK_GRAYS = {
  gray100: '#161616', gray90: '#262626', gray80: '#393939', gray70: '#525252', gray60: '#6F6F6F',
  gray50: '#8D8D8D', gray40: '#A8A8A8', gray30: '#C6C6C6', gray20: '#E0E0E0', gray10: '#F4F4F4',
};

const LIGHT_GRAYS = {
  gray100: '#FFFFFF', gray90: '#F4F4F4', gray80: '#E0E0E0', gray70: '#C6C6C6', gray60: '#A8A8A8',
  gray50: '#6F6F6F', gray40: '#525252', gray30: '#393939', gray20: '#262626', gray10: '#161616',
};

export function getColors(accent: AccentColor = 'blue', theme: 'light' | 'dark' = 'dark') {
  const isLight = theme === 'light';
  const grays = isLight ? LIGHT_GRAYS : DARK_GRAYS;
  const a = isLight
    ? (accent === 'orange' ? ORANGE_LIGHT : BLUE_LIGHT)
    : (accent === 'orange' ? ORANGE_DARK : BLUE_DARK);

  return {
    ...grays,
    ...a,
    teal60: '#009D9A',
    teal40: isLight ? '#005D5D' : '#08BDBA',
    purple60: '#8A3FFC',
    purple40: isLight ? '#6929C4' : '#BE95FF',
    red60: '#DA1E28',
    red40: isLight ? '#A2191F' : '#FF8389',
    green60: '#198038',
    green40: isLight ? '#0E6027' : '#42BE65',
    orange40: isLight ? '#BA4E00' : '#FF832B',
    orange60: '#D44A1C',
    yellow30: isLight ? '#B28600' : '#F1C21B',
    cyan40: isLight ? '#0072C3' : '#33B1FF',
    white: '#FFFFFF',
    supportError: isLight ? '#DA1E28' : '#FA4D56',
    supportWarning: isLight ? '#B28600' : '#F1C21B',
    supportSuccess: isLight ? '#198038' : '#42BE65',
    supportInfo: isLight ? '#0043CE' : '#4589FF',
  };
}
