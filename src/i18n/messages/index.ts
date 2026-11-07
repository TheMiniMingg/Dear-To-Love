// Every translated text, by area. Keys are the English text.
import { app } from './app';
import { common } from './common';
import { create } from './create';
import { reader } from './reader';
import { settings } from './settings';
import type { Messages } from './types';

export const AREAS: Record<string, Messages> = { common, app, settings, reader, create };

export const MESSAGES: Messages = Object.assign({}, ...Object.values(AREAS));
