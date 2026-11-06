// Typed wrappers around Tauri commands. Screens call these, never `invoke` directly.
import { Channel, invoke } from '@tauri-apps/api/core';
import type {
  AppError,
  AppInfo,
  ConnectionCheck,
  DiagnosticCheck,
  ErrorCode,
  ProviderProfile,
  ProviderProfileInput,
  QuickStartInput,
  RouteDto,
  RouteView,
  SaveDto,
  SaveView,
  StoryCreated,
  StorySummary,
  StreamMessage,
  StorytellerInfo,
  Submitted,
  TemplateCatalog,
} from '../types';

/** Error thrown by every wrapper; mirrors the Rust `AppError`. */
export class CommandError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
  }
}

function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AppError).code === 'string' &&
    typeof (value as AppError).message === 'string'
  );
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (err) {
    if (isAppError(err)) throw new CommandError(err.code, err.message);
    throw new CommandError('INTERNAL', err instanceof Error ? err.message : String(err));
  }
}

const FRIENDLY: Partial<Record<ErrorCode, string>> = {
  HEAD_CHANGED: 'This route changed in the meantime. It has been reloaded.',
  RUN_INTERRUPTED:
    'The reply was interrupted (the app closed or the connection dropped). If it had reached the AI service, it may still have cost a little.',
  RUN_ACTIVE: 'A reply is already being written on this route.',
  CANCELLED: 'You stopped the reply.',
  NO_PROVIDER: 'The AI connection for this reply was removed. Choose a storyteller and retry.',
};

/** Human-readable message for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof CommandError) return FRIENDLY[err.code] ?? sentence(err.message);
  return err instanceof Error ? err.message : String(err);
}

/** Short message for a stored run error code (no detail is kept on disk). */
export function runErrorMessage(code: ErrorCode | null): string {
  switch (code) {
    case 'AUTH_FAILED':
      return 'The AI service refused the API key.';
    case 'RATE_LIMITED':
      return 'The AI service is limiting requests or the account is out of credit.';
    case 'PROVIDER_UNREACHABLE':
      return 'The AI service could not be reached.';
    case 'CONTEXT_TOO_LONG':
      return 'The story is too long for this model.';
    case 'PROVIDER_ERROR':
      return 'The AI service returned an error.';
    case null:
      return 'The reply did not finish.';
    default:
      return FRIENDLY[code] ?? 'The reply did not finish.';
  }
}

function sentence(s: string): string {
  const t = s.trim();
  if (!t) return t;
  const first = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(first) ? first : `${first}.`;
}

type RouteRef = { storyId: string; routeId: string };

export const commands = {
  getAppInfo: () => call<AppInfo>('get_app_info'),
  runDiagnostics: (deep = false) => call<DiagnosticCheck[]>('run_diagnostics', { deep }),

  getTemplateCatalog: () => call<TemplateCatalog>('get_template_catalog'),
  quickStart: (input: QuickStartInput) => call<StoryCreated>('quick_start', { input }),
  listStories: () => call<StorySummary[]>('list_stories'),
  deleteStory: (storyId: string) => call<void>('delete_story', { storyId }),

  getRouteView: (routeId: string) => call<RouteView>('get_route_view', { routeId }),
  submitAction: (r: RouteRef & { expectedHeadId: string; text: string }) =>
    call<Submitted>('submit_action', r),
  /** Streams drafts to `onMessage`; resolves once the reply is committed. */
  generateReply: (runId: string, onMessage: (m: StreamMessage) => void) => {
    const onEvent = new Channel<StreamMessage>();
    onEvent.onmessage = onMessage;
    return call<RouteView>('generate_reply', { runId, onEvent });
  },
  retryReply: (r: RouteRef & { expectedHeadId: string }) => call<Submitted>('retry_reply', r),
  cancelReply: (runId: string) => call<void>('cancel_reply', { runId }),
  editAction: (r: RouteRef & { playerEventId: string; text: string }) =>
    call<Submitted>('edit_action', r),
  nextChapter: (r: RouteRef & { expectedHeadId: string; title?: string | null }) =>
    call<RouteView>('next_chapter', { ...r, title: r.title ?? null }),
  forkRoute: (r: RouteRef & { eventId: string; label?: string | null }) =>
    call<RouteView>('fork_route', { ...r, label: r.label ?? null }),
  restartChapter: (r: RouteRef & { chapterEventId: string }) =>
    call<RouteView>('restart_chapter', r),
  renameRoute: (r: RouteRef & { label: string }) => call<RouteDto>('rename_route', r),
  setRouteHidden: (r: RouteRef & { hidden: boolean }) => call<RouteDto>('set_route_hidden', r),

  listSaves: (storyId: string) => call<SaveDto[]>('list_saves', { storyId }),
  createSave: (r: RouteRef & { label: string }) => call<SaveDto>('create_save', r),
  quickSave: (r: RouteRef) => call<SaveDto>('quick_save', r),
  viewSave: (saveId: string) => call<SaveView>('view_save', { saveId }),
  resumeSave: (saveId: string) => call<RouteView>('resume_save', { saveId }),
  deleteSave: (storyId: string, saveId: string) => call<void>('delete_save', { storyId, saveId }),

  listConnections: () => call<ProviderProfile[]>('list_connections'),
  saveConnection: (input: ProviderProfileInput) =>
    call<ProviderProfile>('save_connection', { input }),
  deleteConnection: (id: string) => call<void>('delete_connection', { id }),
  getStoryteller: () => call<StorytellerInfo>('get_storyteller'),
  setStoryteller: (profileId: string | null) =>
    call<StorytellerInfo>('set_storyteller', { profileId }),
  testConnection: (id: string) => call<ConnectionCheck>('test_connection', { id }),
  sendTestMessage: (id: string) => call<string>('send_test_message', { id }),
};
