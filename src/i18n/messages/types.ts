/** Translations of one English text: Simplified Chinese, Traditional Chinese, Japanese, Korean. */
export type Entry = readonly [zhHans: string, zhHant: string, ja: string, ko: string];
export type Messages = Record<string, Entry>;
