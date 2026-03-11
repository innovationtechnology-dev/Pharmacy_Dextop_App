export type ColorTheme = 'emerald' | 'sapphire' | 'teal' | 'violet' | 'amber';

export interface ThemeDefinition {
  id: ColorTheme;
  name: string;
  description: string;
  accent: string;
  shades: Record<string, string>;
}

// Each shade value is stored as space-separated RGB (no commas), matching the
// format already used in index.css for the --color-emerald-* variables.
export const colorThemes: Record<ColorTheme, ThemeDefinition> = {
  emerald: {
    id: 'emerald',
    name: 'Emerald',
    description: 'Health, life & freshness',
    accent: '#10b981',
    shades: {
      '50':  '236 253 245',
      '100': '209 250 229',
      '200': '167 243 208',
      '300': '110 231 183',
      '400': '52 211 153',
      '500': '16 185 129',
      '600': '5 150 105',
      '700': '4 120 87',
      '800': '6 95 70',
      '900': '6 78 59',
      '950': '2 44 34',
    },
  },

  sapphire: {
    id: 'sapphire',
    name: 'Sapphire Blue',
    description: 'Clinical trust & professional',
    accent: '#3b82f6',
    shades: {
      '50':  '239 246 255',
      '100': '219 234 254',
      '200': '191 219 254',
      '300': '147 197 253',
      '400': '96 165 250',
      '500': '59 130 246',
      '600': '37 99 235',
      '700': '29 78 216',
      '800': '30 64 175',
      '900': '30 58 138',
      '950': '23 37 84',
    },
  },

  teal: {
    id: 'teal',
    name: 'Teal',
    description: 'Modern pharmacy & clean care',
    accent: '#14b8a6',
    shades: {
      '50':  '240 253 250',
      '100': '204 251 241',
      '200': '153 246 228',
      '300': '94 234 212',
      '400': '45 212 191',
      '500': '20 184 166',
      '600': '13 148 136',
      '700': '15 118 110',
      '800': '17 94 89',
      '900': '19 78 74',
      '950': '4 47 46',
    },
  },

  violet: {
    id: 'violet',
    name: 'Violet',
    description: 'Premium & sophisticated',
    accent: '#8b5cf6',
    shades: {
      '50':  '245 243 255',
      '100': '237 233 254',
      '200': '221 214 254',
      '300': '196 181 253',
      '400': '167 139 250',
      '500': '139 92 246',
      '600': '124 58 237',
      '700': '109 40 217',
      '800': '91 33 182',
      '900': '76 29 149',
      '950': '46 16 101',
    },
  },

  amber: {
    id: 'amber',
    name: 'Amber',
    description: 'Warm & welcoming',
    accent: '#f59e0b',
    shades: {
      '50':  '255 251 235',
      '100': '254 243 199',
      '200': '253 230 138',
      '300': '252 211 77',
      '400': '251 191 36',
      '500': '245 158 11',
      '600': '217 119 6',
      '700': '180 83 9',
      '800': '146 64 14',
      '900': '120 53 15',
      '950': '69 26 3',
    },
  },
};

export const COLOR_THEME_STORAGE_KEY = 'colorTheme';
export const DEFAULT_COLOR_THEME: ColorTheme = 'emerald';

/**
 * Applies a color theme by overriding the --color-emerald-* CSS custom
 * properties on the document root. Because Tailwind's generated classes
 * reference these variables at render time, the entire app recolors instantly
 * with no component changes required.
 */
export function applyColorTheme(theme: ColorTheme): void {
  const root = document.documentElement;
  const { shades } = colorThemes[theme];
  Object.entries(shades).forEach(([shade, rgb]) => {
    root.style.setProperty(`--color-emerald-${shade}`, rgb);
  });
}
