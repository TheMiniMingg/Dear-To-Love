// Typed wrappers around Tauri commands. Screens call these, never `invoke` directly.
import { Channel, invoke } from '@tauri-apps/api/core';
import type {
  ApiRequestRow,
  AppError,
  AppInfo,
  BudgetPolicy,
  BudgetStatus,
  ConnectionCheck,
  ContextPreview,
  DiagnosticCheck,
  ErrorCode,
  ProviderProfile,
  ProviderProfileInput,
  QuickStartInput,
  RateCardView,
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
  UsageScope,
  UsageSummary,
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
      return "The story setup and your action don't fit this connection's context limit. Shorten the action, or raise the context limit in Settings.";
    case 'PROVIDER_ERROR':
      return 'The AI service returned an error.';
    case 'BUDGET_PAUSED':
      return 'Paid replies are paused: this would pass your monthly budget. Raise the budget or switch to Warn only in Usage & budget, or use a local or offline storyteller.';
    case 'BUDGET_OVERRIDE_REQUIRED':
      return "Your budget pauses paid replies, and this model has no prices, so the app can't tell whether this reply fits. Add prices in Usage & budget, or send this one anyway.";
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
  /**
   * Streams drafts to `onMessage`; resolves once the reply is committed.
   * `budgetOverride` sends one reply the budget gate cannot price.
   */
  generateReply: (runId: string, onMessage: (m: StreamMessage) => void, budgetOverride = false) => {
    const onEvent = new Channel<StreamMessage>();
    onEvent.onmessage = onMessage;
    return call<RouteView>('generate_reply', { runId, onEvent, budgetOverride });
  },
  retryReply: (r: RouteRef & { expectedHeadId: string }) => call<Submitted>('retry_reply', r),
  cancelReply: (runId: string) => call<void>('cancel_reply', { runId }),
  editAction: (r: RouteRef & { playerEventId: string; text: string }) =>
    call<Submitted>('edit_action', r),
  /** The exact prompt the next reply would send. Assembled locally; nothing is sent. */
  previewContext: (routeId: string) => call<ContextPreview>('preview_context', { routeId }),
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

  getUsageSummary: (scope: UsageScope, profileId: string | null = null) =>
    call<UsageSummary>('get_usage_summary', { scope, profileId }),
  listApiRequests: (scope: UsageScope, profileId: string | null = null, limit = 100) =>
    call<ApiRequestRow[]>('list_api_requests', { scope, profileId, limit }),
  listRates: () => call<RateCardView[]>('list_rates'),
  setRates: (r: {
    profileId: string;
    inputUsdPerMillion: string;
    outputUsdPerMillion: string;
    cachedInputUsdPerMillion: string | null;
  }) => call<RateCardView[]>('set_rates', r),
  getBudgetStatus: () => call<BudgetStatus>('get_budget_status'),
  setBudgetPolicy: (policy: BudgetPolicy) => call<BudgetStatus>('set_budget_policy', { policy }),
  dismissBudgetWarning: () => call<BudgetStatus>('dismiss_budget_warning'),
};

/** `$0.0123` for small amounts, `$12.34` from $100 up. Estimates only. */
export function formatUsd(micro: number): string {
  const dollars = micro / 1_000_000;
  return `$${dollars.toFixed(dollars >= 100 ? 2 : 4)}`;
}
