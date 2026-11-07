// Typed wrappers around Tauri commands. Screens call these, never `invoke` directly.
import { Channel, invoke } from '@tauri-apps/api/core';
import type {
  ApiRequestRow,
  AppError,
  AssetDto,
  AssetUsage,
  BackupExport,
  BackupInfo,
  BookmarkDto,
  AppInfo,
  ChapterRecapDraft,
  BudgetPolicy,
  BudgetStatus,
  CreateStoryDraft,
  DraftProblem,
  ConnectionCheck,
  ContextPreview,
  DiagnosticCheck,
  ErrorCode,
  ImageImport,
  ImageScope,
  PortraitInput,
  Prompt,
  StorypackExport,
  StorypackImport,
  TextExport,
  TextFormat,
  ProviderProfile,
  ProviderProfileInput,
  RestorePlan,
  RestoreResult,
  RestoreSource,
  QuickStartInput,
  RateCardView,
  RouteDto,
  RouteNode,
  StoryMemory,
  RollRequest,
  RouteView,
  StateEdit,
  SaveDto,
  SaveView,
  SearchResults,
  StoryCreated,
  StorySummary,
  StoryVisual,
  StreamMessage,
  StorytellerChoice,
  StorytellerInfo,
  Submitted,
  TemplateCatalog,
  UpdateStatus,
  UsageScope,
  UsageSummary,
  WizardDraft,
} from '../types';
import { msg, t, tKnown } from '../i18n';

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
  HEAD_CHANGED: msg('This route changed in the meantime. It has been reloaded.'),
  RUN_INTERRUPTED: msg(
    'The reply was interrupted (the app closed or the connection dropped). If it had reached the AI service, it may still have cost a little.',
  ),
  RUN_ACTIVE: msg('A reply is already being written on this route.'),
  CANCELLED: msg('You stopped the reply.'),
  NO_PROVIDER: msg('The AI connection for this reply was removed. Choose a storyteller and retry.'),
  CONTENT_FILTERED: msg(
    "The AI service's content filter stopped this reply. Try another reply, change the action, or use a model whose rules allow this story, such as a local model.",
  ),
  DISK_FULL: msg(
    'The disk is full, so this could not be saved. Everything saved before is safe. Free up some space, then try again.',
  ),
};

function friendly(code: ErrorCode): string | undefined {
  const text = FRIENDLY[code];
  return text === undefined ? undefined : t(text);
}

/** Human-readable message for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof CommandError) {
    const known = tKnown(err.message);
    return friendly(err.code) ?? (known === err.message ? sentence(err.message) : known);
  }
  return err instanceof Error ? err.message : String(err);
}

/** Short message for a stored run error code (no detail is kept on disk). */
export function runErrorMessage(code: ErrorCode | null): string {
  switch (code) {
    case 'AUTH_FAILED':
      return t('The AI service refused the API key.');
    case 'RATE_LIMITED':
      return t('The AI service is limiting requests or the account is out of credit.');
    case 'PROVIDER_UNREACHABLE':
      return t('The AI service could not be reached.');
    case 'CONTEXT_TOO_LONG':
      return t(
        "The story setup and your action don't fit this connection's context limit. Shorten the action, trim long story details (facts, character descriptions), or raise the context limit in Settings.",
      );
    case 'PROVIDER_ERROR':
      return t('The AI service returned an error.');
    case 'BUDGET_PAUSED':
      return t(
        'Paid replies are paused: this would pass your monthly budget. Raise the budget or switch to Warn only in Usage & budget, or use a local or offline storyteller.',
      );
    case 'BUDGET_OVERRIDE_REQUIRED':
      return t(
        "Your budget pauses paid replies, and this model has no prices, so the app can't tell whether this reply fits. Add prices in Usage & budget, or send this one anyway.",
      );
    case null:
      return t('The reply did not finish.');
    default:
      return friendly(code) ?? t('The reply did not finish.');
  }
}

export function sentence(s: string): string {
  const text = s.trim();
  if (!text) return text;
  const first = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(first) ? first : `${first}.`;
}

type RouteRef = { storyId: string; routeId: string };

export const commands = {
  getAppInfo: () => call<AppInfo>('get_app_info'),
  runDiagnostics: (deep = false) => call<DiagnosticCheck[]>('run_diagnostics', { deep }),

  getTemplateCatalog: () => call<TemplateCatalog>('get_template_catalog'),
  quickStart: (input: QuickStartInput) => call<StoryCreated>('quick_start', { input }),
  composeStoryDraft: (input: QuickStartInput) =>
    call<CreateStoryDraft>('compose_story_draft', { input }),
  checkStoryDraft: (draft: CreateStoryDraft) =>
    call<DraftProblem[]>('check_story_draft', { draft }),
  createStory: (draft: CreateStoryDraft) => call<StoryCreated>('create_story', { draft }),
  getWizardDraft: () => call<WizardDraft | null>('get_wizard_draft'),
  saveWizardDraft: (wizard: WizardDraft) => call<WizardDraft>('save_wizard_draft', { wizard }),
  clearWizardDraft: () => call<void>('clear_wizard_draft'),
  listStories: () => call<StorySummary[]>('list_stories'),
  deleteStory: (storyId: string) => call<void>('delete_story', { storyId }),

  getRouteView: (routeId: string) => call<RouteView>('get_route_view', { routeId }),
  /** With `roll`, the app rolls the dice and stores the result with the action. */
  submitAction: (r: RouteRef & { expectedHeadId: string; text: string; roll?: RollRequest }) =>
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
  regenerateReply: (r: RouteRef & { assistantEventId: string }) =>
    call<Submitted>('regenerate_reply', r),
  editStoryDetails: (
    r: RouteRef & { expectedHeadId: string; changes: StateEdit[]; note: string | null },
  ) => call<RouteView>('edit_story_details', r),
  listImages: () => call<AssetDto[]>('list_images'),
  /** With no `scope` the images are shared with every story. */
  importImages: (paths: string[], scope?: ImageScope) =>
    call<ImageImport[]>('import_images', { paths, scope: scope ?? null }),
  /** Share with every story (`storyId` null), or keep for that story only. */
  setImageScope: (assetId: string, storyId: string | null) =>
    call<AssetDto>('set_image_scope', { assetId, storyId }),
  updateImage: (assetId: string, label: string, tags: string[]) =>
    call<AssetDto>('update_image', { assetId, label, tags }),
  imageUsages: (assetId: string) => call<AssetUsage[]>('image_usages', { assetId }),
  deleteImage: (assetId: string) => call<void>('delete_image', { assetId }),
  setStoryPicture: (storyId: string, slot: string, assetId: string | null) =>
    call<StoryVisual[]>('set_story_picture', { storyId, slot, assetId }),
  /** What a portrait would be made from. Sends nothing. */
  previewPortrait: (input: PortraitInput) => call<Prompt>('preview_portrait', { input }),
  /** One request to the picture connection; the picture joins the library. */
  makePortrait: (input: PortraitInput) => call<AssetDto>('make_portrait', { input }),
  /** Writes the whole story to a `.storypack` file at `path` (from the save dialog). */
  exportStorypack: (storyId: string, path: string) =>
    call<StorypackExport>('export_storypack', { storyId, path }),
  /** Adds the storypack at `path` as a new story. */
  importStorypack: (path: string) => call<StorypackImport>('import_storypack', { path }),
  exportRouteText: (routeId: string, path: string, format: TextFormat, timestamps: boolean) =>
    call<TextExport>('export_route_text', { routeId, path, format, timestamps }),
  listBackups: () => call<BackupInfo[]>('list_backups'),
  /** Everything in one `.dtlbackup` file at `path` (from the save dialog). */
  exportBackup: (path: string) => call<BackupExport>('export_backup', { path }),
  /** Unpacks and checks a backup. Nothing changes until `confirmRestore`. */
  prepareRestore: (source: RestoreSource) => call<RestorePlan>('prepare_restore', { source }),
  cancelRestore: () => call<void>('cancel_restore'),
  /** Saves the current data as a backup; the restore finishes at the next start. */
  confirmRestore: (token: string) => call<BackupInfo>('confirm_restore', { token }),
  restartApp: () => call<void>('restart_app'),
  takeRestoreResult: () => call<RestoreResult | null>('take_restore_result'),
  /** The exact prompt the next reply would send. Assembled locally; nothing is sent. */
  previewContext: (routeId: string) => call<ContextPreview>('preview_context', { routeId }),
  /** A recap of the chapter being played, for the player to edit. Nothing is stored. */
  draftChapterRecap: (routeId: string) =>
    call<ChapterRecapDraft>('draft_chapter_recap', { routeId }),
  /** Keeps `recap` on this route, saves, and starts the next chapter. */
  endChapter: (
    r: RouteRef & { expectedHeadId: string; recap: string; nextTitle?: string | null },
  ) => call<RouteView>('end_chapter', { ...r, nextTitle: r.nextTitle ?? null }),
  forkRoute: (r: RouteRef & { eventId: string; label?: string | null }) =>
    call<RouteView>('fork_route', { ...r, label: r.label ?? null }),
  restartChapter: (r: RouteRef & { chapterEventId: string }) =>
    call<RouteView>('restart_chapter', r),
  /** Every route with where it branched and how far it got. */
  getRouteMap: (storyId: string) => call<RouteNode[]>('get_route_map', { storyId }),
  getStoryMemory: (routeId: string) => call<StoryMemory>('get_story_memory', { routeId }),
  renameRoute: (r: RouteRef & { label: string }) => call<RouteDto>('rename_route', r),
  setRouteHidden: (r: RouteRef & { hidden: boolean }) => call<RouteDto>('set_route_hidden', r),

  listSaves: (storyId: string) => call<SaveDto[]>('list_saves', { storyId }),
  createSave: (r: RouteRef & { label: string }) => call<SaveDto>('create_save', r),
  quickSave: (r: RouteRef) => call<SaveDto>('quick_save', r),
  viewSave: (saveId: string) => call<SaveView>('view_save', { saveId }),
  resumeSave: (saveId: string) => call<RouteView>('resume_save', { saveId }),
  deleteSave: (storyId: string, saveId: string) => call<void>('delete_save', { storyId, saveId }),

  /** Words in this route's history only, in story order. */
  searchRoute: (routeId: string, query: string) =>
    call<SearchResults>('search_route', { routeId, query }),
  listBookmarks: (routeId: string) => call<BookmarkDto[]>('list_bookmarks', { routeId }),
  /** Bookmarking a marked place again renames it when `label` is given. */
  addBookmark: (r: RouteRef & { eventId: string; label?: string | null }) =>
    call<BookmarkDto>('add_bookmark', { ...r, label: r.label ?? null }),
  renameBookmark: (storyId: string, bookmarkId: string, label: string) =>
    call<BookmarkDto>('rename_bookmark', { storyId, bookmarkId, label }),
  deleteBookmark: (storyId: string, bookmarkId: string) =>
    call<void>('delete_bookmark', { storyId, bookmarkId }),

  listConnections: () => call<ProviderProfile[]>('list_connections'),
  saveConnection: (input: ProviderProfileInput) =>
    call<ProviderProfile>('save_connection', { input }),
  deleteConnection: (id: string) => call<void>('delete_connection', { id }),
  getStoryteller: () => call<StorytellerInfo>('get_storyteller'),
  setStoryteller: (profileId: string | null) =>
    call<StorytellerInfo>('set_storyteller', { profileId }),
  /** One story's own storyteller; `null` follows the app's again. */
  setStoryStoryteller: (storyId: string, choice: StorytellerChoice | null) =>
    call<StorytellerInfo>('set_story_storyteller', { storyId, choice }),
  /** The connection portraits are made with, or `null`. */
  getPictureMaker: () => call<string | null>('get_picture_maker'),
  setPictureMaker: (profileId: string | null) =>
    call<string | null>('set_picture_maker', { profileId }),
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

  /** Runs the checks and returns a report with no story text, keys or paths. */
  diagnosticsReport: (deep: boolean) => call<string>('diagnostics_report', { deep }),
  saveDiagnosticsReport: (path: string, report: string) =>
    call<string>('save_diagnostics_report', { path, report }),
  openSupportPage: () => call<void>('open_support_page'),
  openRepositoryPage: () => call<void>('open_repository_page'),
  /** Opens a setup guide page (by its name in features/guide/links.json) in the browser. */
  openGuideLink: (id: string) => call<void>('open_guide_link', { id }),
  /** The interface has loaded. Only the installer smoke test acts on it. */
  frontendReady: () => call<void>('frontend_ready'),
  /** What is known about updates; never goes online. */
  getUpdateStatus: () => call<UpdateStatus>('get_update_status'),
  /** `manual`: Check now. Otherwise the daily check, which does nothing while off. */
  checkForUpdates: (manual: boolean) => call<UpdateStatus>('check_for_updates', { manual }),
  setUpdateChecks: (enabled: boolean) => call<UpdateStatus>('set_update_checks', { enabled }),
  acknowledgeUpdate: (version: string) => call<UpdateStatus>('acknowledge_update', { version }),
  openReleasePage: () => call<void>('open_release_page'),
};

/** `$0.0123` for small amounts, `$12.34` from $100 up. Estimates only. */
export function formatUsd(micro: number): string {
  const dollars = micro / 1_000_000;
  return `$${dollars.toFixed(dollars >= 100 ? 2 : 4)}`;
}
