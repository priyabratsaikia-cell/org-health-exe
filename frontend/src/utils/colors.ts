export type AccentColor = 'blue' | 'orange';

const BLUE = { blue80: '#002D9C', blue60: '#0F62FE', blue60h: '#0353E9', blue40: '#78A9FF', blue20: '#D0E2FF' };
const ORANGE = { blue80: '#8A3800', blue60: '#E04E17', blue60h: '#C43D0F', blue40: '#FF832B', blue20: '#FFE0C7' };

export function getColors(accent: AccentColor = 'blue') {
  const a = accent === 'orange' ? ORANGE : BLUE;
  return {
    gray100: '#161616',
    gray90: '#262626',
    gray80: '#393939',
    gray70: '#525252',
    gray60: '#6F6F6F',
    gray50: '#8D8D8D',
    gray40: '#A8A8A8',
    gray30: '#C6C6C6',
    gray20: '#E0E0E0',
    gray10: '#F4F4F4',
    ...a,
    teal60: '#009D9A',
    teal40: '#08BDBA',
    purple60: '#8A3FFC',
    purple40: '#BE95FF',
    red60: '#DA1E28',
    red40: '#FF8389',
    green60: '#198038',
    green40: '#42BE65',
    orange40: '#FF832B',
    orange60: '#D44A1C',
    yellow30: '#F1C21B',
    cyan40: '#33B1FF',
    white: '#FFFFFF',
    supportError: '#FA4D56',
    supportWarning: '#F1C21B',
    supportSuccess: '#42BE65',
    supportInfo: '#4589FF',
  };
}
