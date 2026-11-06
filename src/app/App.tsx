import { DiagnosticsScreen } from '../features/diagnostics/DiagnosticsScreen';
import { LibraryScreen } from '../features/library/LibraryScreen';
import { QuickStartScreen } from '../features/create/QuickStartScreen';
import { ReaderScreen } from '../features/reader/ReaderScreen';
import { StatusFooter } from '../components/StatusFooter';
import { useUiStore } from './store';

export function App() {
  const screen = useUiStore((s) => s.screen);
  return (
    <div className="app-shell">
      <main className="app-main">
        {screen.name === 'library' && <LibraryScreen />}
        {screen.name === 'quickstart' && <QuickStartScreen />}
        {screen.name === 'reader' && <ReaderScreen key={screen.routeId} routeId={screen.routeId} />}
        {screen.name === 'diagnostics' && <DiagnosticsScreen />}
      </main>
      <StatusFooter />
    </div>
  );
}
