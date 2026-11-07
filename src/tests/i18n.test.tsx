// The interface in Simplified and Traditional Chinese, Japanese and Korean.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extract, sourceFiles } from '../../scripts/i18n-keys.mjs';
import { systemLocale, t, tn, tr, TRANSLATED, useLanguage } from '../i18n';
import { AREAS, MESSAGES } from '../i18n/messages';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {},
}));

import { App } from '../app/App';
import { appStoryLanguage, storyLanguageLabel } from '../features/create/StyleFields';
import { blankDraft } from '../features/create/WizardSteps';
import type { CreateStoryDraft } from '../types';
import { useUiStore } from '../app/store';

const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

describe('translations', () => {
  const { keys, problems } = extract(sourceFiles('src'));

  it('are looked up by literal English text', () => {
    expect(problems).toEqual([]);
    expect(keys.size).toBeGreaterThan(500);
  });

  it('exist in all four languages for every text', () => {
    expect([...keys.keys()].filter((k) => !MESSAGES[k])).toEqual([]);
  });

  it('are all still used', () => {
    expect(Object.keys(MESSAGES).filter((k) => !keys.has(k))).toEqual([]);
  });

  it('keep every placeholder and are never empty', () => {
    const bad: string[] = [];
    for (const [key, entry] of Object.entries(MESSAGES)) {
      entry.forEach((text, i) => {
        if (!text.trim() || placeholders(text) !== placeholders(key)) {
          bad.push(`${TRANSLATED[i]}: ${key}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it('are written once', () => {
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const [area, messages] of Object.entries(AREAS)) {
      for (const key of Object.keys(messages)) {
        if (seen.has(key)) twice.push(`${key} (${seen.get(key)}, ${area})`);
        seen.set(key, area);
      }
    }
    expect(twice).toEqual([]);
  });
});

describe('the app language', () => {
  afterEach(() => {
    useLanguage.getState().setChoice('auto');
    localStorage.clear();
  });

  it('follows the computer, with Traditional Chinese for Taiwan and Hong Kong', () => {
    expect(systemLocale(['zh-CN'])).toBe('zh-Hans');
    expect(systemLocale(['zh-Hans-SG'])).toBe('zh-Hans');
    expect(systemLocale(['zh-TW'])).toBe('zh-Hant');
    expect(systemLocale(['zh-HK'])).toBe('zh-Hant');
    expect(systemLocale(['zh-Hant'])).toBe('zh-Hant');
    expect(systemLocale(['ja-JP'])).toBe('ja');
    expect(systemLocale(['fr-FR', 'ko-KR'])).toBe('ko');
    expect(systemLocale(['fr-FR'])).toBe('en');
    expect(systemLocale(['en-US', 'ja'])).toBe('en');
  });

  it('translates text, counts and marked-up text, and falls back to English', () => {
    expect(t('Settings')).toBe('Settings');
    expect(tn(1, '{n} route', '{n} routes')).toBe('1 route');
    expect(tn(2, '{n} route', '{n} routes')).toBe('2 routes');
    useLanguage.getState().setChoice('ja');
    expect(document.documentElement.lang).toBe('ja');
    expect(t('Settings')).toBe('設定');
    expect(tn(1, '{n} route', '{n} routes')).toBe('ルート 1 本');
    expect(t('Not a translated text')).toBe('Not a translated text');
    render(<p>{tr('Delete {title}', { title: <strong>Harbor</strong> })}</p>);
    expect(screen.getByText('Harbor').tagName).toBe('STRONG');
    expect(screen.getByText(/を削除/)).toHaveTextContent('「Harbor」を削除');
    useLanguage.getState().setChoice('zh-Hant');
    expect(t('Settings')).toBe('設定');
    expect(t('Backups')).toBe('備份');
    useLanguage.getState().setChoice('zh-Hans');
    expect(t('Backups')).toBe('备份');
    useLanguage.getState().setChoice('ko');
    expect(t('Backups')).toBe('백업');
  });

  it('starts new stories in the app language, which Style can still change', () => {
    expect(appStoryLanguage()).toBeUndefined();
    useLanguage.getState().setChoice('ja');
    expect(appStoryLanguage()).toBe('Japanese');
    expect(storyLanguageLabel('Japanese')).toBe('日本語 (Japanese)');
    const empty = { narration: { language: 'English' } } as unknown as CreateStoryDraft;
    expect(blankDraft(empty).narration.language).toBe('Japanese');
    useLanguage.getState().setChoice('zh-Hant');
    expect(appStoryLanguage()).toBe('Traditional Chinese');
    useLanguage.getState().setChoice('ko');
    expect(appStoryLanguage()).toBe('Korean');
    useLanguage.getState().setChoice('zh-Hans');
    expect(appStoryLanguage()).toBe('Simplified Chinese');
  });

  it('is chosen in Settings, redraws the app and is remembered', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'list_connections':
          return [];
        case 'get_storyteller':
          return { profileId: null, label: 'Offline storyteller', modelId: null, billing: 'local' };
        case 'get_picture_maker':
          return null;
        case 'get_update_status':
        case 'check_for_updates':
          return { enabled: false, state: 'off', installed: '0.1.0', showNotice: false };
        case 'get_app_info':
          return { name: 'Dear to Love', version: '0.1.0', os: 'linux', arch: 'x86_64' };
        default:
          return null;
      }
    });
    useUiStore.setState({ screen: { name: 'settings' }, history: [] });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('App language'), '简体中文');
    expect(await screen.findByRole('heading', { name: '设置', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '讲述者' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '诊断' })).toBeInTheDocument();
    expect(localStorage.getItem('dtl.uiLanguage')).toBe('zh-Hans');
    expect(document.documentElement.lang).toBe('zh-Hans');
    await userEvent.selectOptions(screen.getByLabelText('应用语言'), 'auto');
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
  });
});
