import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Fixtures are dated days ago, so every story would greet the player with
// the Previously card. It is off here; its own tests turn it on.
vi.mock('../features/reader/PreviouslyCard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/reader/PreviouslyCard')>()),
  shouldShowPreviously: vi.fn(() => false),
}));

// The whole suite runs in parallel; under that load a screen can take more
// than the default second to settle.
configure({ asyncUtilTimeout: 3000 });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
