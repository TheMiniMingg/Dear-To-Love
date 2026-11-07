/**
 * Names the app's core writes in English ("Main", "Alt 2", "Autosave (Main)",
 * "Chapter 3", "Portrait of Mara", "Bookmark"), shown in the chosen language.
 * A name the player typed is shown as it is.
 */
import { locale, t } from '.';

/** A route: "Main" and "Alt 2" are the app's own names. */
export function routeName(label: string): string {
  if (label === 'Main') return t('Main');
  const m = /^Alt (\d+)$/.exec(label);
  return m ? t('Alt {n}', { n: m[1]! }) : label;
}

/** A save: autosaves, quick saves and the save made when a chapter ends. */
export function saveName(label: string): string {
  let m = /^Autosave \((.*)\)$/.exec(label);
  if (m) return t('Autosave ({route})', { route: routeName(m[1]!) });
  m = /^Quick save \((.*)\)$/.exec(label);
  if (m) return t('Quick save ({route})', { route: routeName(m[1]!) });
  m = /^End of Chapter (\d+): (.*)$/.exec(label);
  if (m) return t('End of Chapter {n}: {title}', { n: m[1]!, title: m[2]! });
  return label;
}

/** True when a chapter's title is only its number ("Chapter 2", "第 2 章"). */
function numberOnly(n: number, title: string): boolean {
  return !title || title === `Chapter ${n}` || title === t('Chapter {n}', { n });
}

/** True when a chapter has a title of its own, not only its number. */
export function chapterHasTitle(n: number, title: string | null | undefined): boolean {
  return !numberOnly(n, (title ?? '').trim());
}

/** "Chapter 2: The Lamp Room", or "Chapter 2" when that is all its title says. */
export function chapterHeading(n: number, title: string | null | undefined): string {
  const own = (title ?? '').trim();
  return numberOnly(n, own)
    ? t('Chapter {n}', { n })
    : t('Chapter {n}: {title}', { n, title: own });
}

/** A chapter's own title, in the chosen language when it is only a number. */
export function chapterTitle(n: number, title: string | null | undefined): string {
  const own = (title ?? '').trim();
  return numberOnly(n, own) ? t('Chapter {n}', { n }) : own;
}

/** A picture: portraits the app made are called "Portrait of …". */
export function pictureName(label: string): string {
  const m = /^Portrait of (.+)$/.exec(label);
  return m ? t('Portrait of {name}', { name: m[1]! }) : label;
}

/** A bookmark: "Bookmark" is the name of one with no words to show. */
export function bookmarkName(label: string): string {
  return label === 'Bookmark' ? t('Bookmark') : label;
}

/** One label from `plain_message_tags`, e.g. "Text from Mara". */
function plainLabel(label: string): string | null {
  const rules: [RegExp, (m: string[]) => string][] = [
    [/^Text from (.+)$/, (m) => t('Text from {name}', { name: m[1]! })],
    [/^Text to (.+)$/, (m) => t('Text to {name}', { name: m[1]! })],
    [/^Text$/, () => t('Text message')],
    [
      /^Call with (.+?): (.+)$/,
      (m) => t('Call with {name}: {status}', { name: m[1]!, status: m[2]! }),
    ],
    [/^Call with (.+)$/, (m) => t('Call with {name}', { name: m[1]! })],
    [/^Call: (.+)$/, (m) => t('Phone call: {status}', { status: m[1]! })],
    [/^Call$/, () => t('Phone call')],
    [/^Letter from (.+)$/, (m) => t('Letter from {name}', { name: m[1]! })],
    [/^Letter$/, () => t('Letter')],
    [/^Post by (.+)$/, (m) => t('Post by {name}', { name: m[1]! })],
    [/^Post$/, () => t('A post')],
    [
      /^Roll for (.+?): (-?\d+) on /,
      (m) => t('Roll for {label}: {total}', { label: m[1]!, total: m[2]! }),
    ],
    [/^Roll for (.+?): /, (m) => t('Roll for {label}', { label: m[1]! })],
    [/^Roll: /, () => t('A roll')],
    [/^Got (.+)$/, (m) => t('Got {item}', { item: m[1]! })],
    [/^Lost (.+)$/, (m) => t('Lost {item}', { item: m[1]! })],
  ];
  for (const [re, make] of rules) {
    const m = re.exec(label);
    if (m) return make(m);
  }
  return null;
}

/**
 * Plain story text from the app's core ("[Text from Mara] Are you up?",
 * "(Mara thinks: …)") with those labels in the chosen language.
 */
export function plainStoryText(text: string): string {
  if (locale() === 'en') return text;
  return text
    .replace(/\[([^[\]]+)\]/g, (whole, label: string) => {
      const out = plainLabel(label);
      return out === null ? whole : `[${out}]`;
    })
    .replace(
      /\(([^()]+?) thinks: /g,
      (_, who: string) =>
        `(${t('{name} thinks', { name: who === 'Someone' ? t('Someone') : who })}: `,
    );
}
