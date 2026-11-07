# ADR 0021: The app in Chinese, Japanese and Korean

Status: accepted

## Context

MiniMe asked for the interface in Simplified Chinese, Traditional Chinese, Japanese and
Korean: people who bring their own API can already have the story written in their language
(**Story language**, ADR 0015), but every menu, button and message was English. The app has
about a thousand interface texts across React components and a few strings the Rust core
sends (connection labels, error messages).

## Decision

- **A small module, not a library.** `src/i18n/index.ts` keeps the chosen language and looks
  texts up. The English text is the key, so the code still reads as English and anything not
  yet translated shows in English:
  - `t(text, vars)` translates and fills `{name}` placeholders;
  - `tn(n, one, many, vars)` picks the English singular or plural; the other four languages
    don't inflect for number, so they translate only the plural form, with `{n}`;
  - `tr(text, { name: <element> })` fills placeholders with React elements (bold names,
    links);
  - `msg(text)` marks text kept in a table (option lists, error tables) so it is found and
    translated where it is shown, with `t(value)` or `tOptions(list)`;
  - `tKnown(text)` translates text the core sends when the catalog has it, such as
    "Offline storyteller" or a validation message, and otherwise leaves it as sent;
  - `joinSentences` and `joinList` join the way each language does (no spaces between
    Chinese and Japanese sentences, `、` between list items), and `intlLocale()` formats dates
    and numbers.
- **Catalogs by area** in `src/i18n/messages/` (`common`, `app`, `settings`, `reader`,
  `create`). Each entry is `[Simplified Chinese, Traditional Chinese, Japanese, Korean]`.
  They are plain TypeScript, bundled with the app; nothing is downloaded.
- **Choosing.** **Settings → Language → App language** offers _Same as this computer_ (the
  default) and the five languages, each named in itself. _Same as this computer_ takes the
  first of the system's languages the app has: `zh-TW`, `zh-HK`, `zh-MO` and `zh-Hant` give
  Traditional Chinese, other `zh` give Simplified, and anything else gives English. The
  choice is a preference of this computer, kept in `localStorage` (`dtl.uiLanguage`), so it is
  not part of backups or storypacks. Changing it sets `<html lang>` and redraws the app from
  the top, keeping the current screen.
- **Fonts.** `styles.css` names each language's system fonts under `:root:lang(…)` (PingFang
  and Microsoft YaHei for Simplified Chinese, PingFang TC and Microsoft JhengHei for
  Traditional, Hiragino and Yu Gothic for Japanese, Apple SD Gothic Neo and Malgun Gothic for
  Korean, with Noto fallbacks on Linux), because the four languages draw many of the same
  characters differently. Korean wraps between words (`word-break: keep-all`).
- **New stories start in the app's language.** Quick Start and the wizard set **Story
  language** to the app's language (`QuickStartInput.language`, `appStoryLanguage()`), so
  someone using the app in Japanese gets a story in Japanese. English leaves it unset, as
  before. It is a default: **Style** can change it, and a story's language never changes when
  the app's does.
- **What stays English.**
  - Story presets and templates (worlds, scenarios, characters, eras, races, rules, roles,
    personalities). They are story content: they go into the story and the storyteller
    reads them, and the storyteller writes in the story's language whatever language the
    template is in.
  - Stored values such as genres, story types and picture tags, which are data. The screens
    translate them where they are shown.
  - Diagnostics reports and logs, so support can read them.
  - Anything a story contains: titles, names, chapter titles you wrote, replies.
- **Checked by tests.** `scripts/i18n-keys.mjs` reads every `t`, `tr`, `msg` and `tKnown` call
  with a literal text (and the plural form of `tn`) in `src/`. `src/tests/i18n.test.tsx`
  fails when a text has no translation in all four languages, when a translation is no longer
  used, when its placeholders differ from the English, when a translation is empty, or when a
  text is translated in two areas. `scripts/i18n-audit.mjs` is a rough check for English left
  outside `t()` in JSX, for development.

## Consequences

- New or changed interface text needs four translations in the same change, or the tests
  fail. Changing the English changes the key, so the old translation shows up as unused and
  the new text as missing.
- Keys must be literal: write `cond ? t('a') : t('b')`, not `t(cond ? 'a' : 'b')`, or the
  extractor can't see them.
- The translations were written with this change and have not yet been reviewed by native
  speakers; corrections only touch the catalogs.
- Templates being English means a Chinese, Japanese or Korean player sees English preset
  names while creating a story. Translating templates would mean a template per language
  and storypacks that carry several, so it is left for later.
