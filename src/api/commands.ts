// Typed wrappers around Tauri commands. Screens call these, never `invoke` directly.
import { invoke } from '@tauri-apps/api/core';
import type {
  AppError,
  AppInfo,
  DiagnosticCheck,
  ErrorCode,
  QuickStartInput,
  RouteDto,
  RouteView,
  SaveDto,
  SaveView,
  StoryCreated,
  StorySummary,
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

/** Human-readable message for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof CommandError) {
    if (err.code === 'HEAD_CHANGED')
      return 'This route changed in the meantime. It has been reloaded.';
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
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
  playMockTurn: (r: RouteRef & { expectedHeadId: string; text: string }) =>
    call<RouteView>('play_mock_turn', r),
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
};
