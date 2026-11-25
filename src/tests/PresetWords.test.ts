import { afterEach, describe, expect, it } from 'vitest';
import { useLanguage } from '../i18n';
import { PRESET_WORDS_ZH_HANS, presetWord, presetWords } from '../i18n/presetWords';
import { ERAS, PERSONALITIES, RACES, ROLES, RULES, SETTINGS } from '../features/create/presets';

const ALL = [...RACES, ...ROLES, ...PERSONALITIES, ...ERAS, ...SETTINGS, ...RULES];

describe('ready-made words in Simplified Chinese', () => {
  afterEach(() => useLanguage.getState().setChoice('en'));

  it('has a Chinese version of every pick, and none left over', () => {
    expect(ALL.filter((w) => !PRESET_WORDS_ZH_HANS[w])).toEqual([]);
    expect(Object.keys(PRESET_WORDS_ZH_HANS).filter((w) => !ALL.includes(w))).toEqual([]);
    const zh = Object.values(PRESET_WORDS_ZH_HANS);
    expect(new Set(zh).size).toBe(zh.length);
  });

  it('offers the Chinese words only with the app in Simplified Chinese', () => {
    useLanguage.getState().setChoice('zh-Hans');
    expect(presetWords(['Elf', 'Monsters exist'])).toEqual(['精灵', '怪物存在']);
    expect(presetWord('my own word')).toBe('my own word');
    for (const l of ['en', 'zh-Hant', 'ja', 'ko'] as const) {
      useLanguage.getState().setChoice(l);
      expect(presetWord('Elf')).toBe('Elf');
    }
  });
});
