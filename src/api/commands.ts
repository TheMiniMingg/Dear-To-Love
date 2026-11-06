// Typed wrappers around Tauri commands. Screens call these, never `invoke` directly.
import { invoke } from '@tauri-apps/api/core';
import type { AppError, AppInfo, DiagnosticCheck, ErrorCode } from '../types';

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

export const commands = {
  getAppInfo: () => call<AppInfo>('get_app_info'),
  runDiagnostics: () => call<DiagnosticCheck[]>('run_diagnostics'),
};
