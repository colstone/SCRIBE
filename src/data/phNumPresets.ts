export interface PhNumPreset {
  name: string;
  language: string;
  vowels: string[];
}

export const PH_NUM_PRESETS: PhNumPreset[] = [
  {
    name: 'opencpop-extension',
    language: '普通话',
    vowels: [
      'a', 'ai', 'an', 'ang', 'ao',
      'e', 'ei', 'en', 'eng', 'er',
      'i', 'ia', 'ian', 'iang', 'iao', 'ie', 'in', 'ing', 'iong', 'iu',
      'o', 'ong', 'ou',
      'u', 'ua', 'uai', 'uan', 'uang', 'ui', 'un', 'uo',
      'v', 'van', 've', 'vn',
    ],
  },
  {
    name: 'opencpop-strict',
    language: '普通话',
    vowels: [
      'a', 'ai', 'an', 'ang', 'ao',
      'e', 'ei', 'en', 'eng', 'er',
      'i', 'in', 'ing',
      'o', 'ong', 'ou',
      'u', 'un',
      'v', 'vn',
    ],
  },
  {
    name: 'romaji-standard',
    language: '日语',
    vowels: [
      'a', 'i', 'u', 'e', 'o',
      'N',
    ],
  },
];
