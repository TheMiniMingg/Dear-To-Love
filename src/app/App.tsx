import { DiagnosticsScreen } from '../features/diagnostics/DiagnosticsScreen';
import { LibraryScreen } from '../features/library/LibraryScreen';
import { StatusFooter } from '../components/StatusFooter';
import { useUiStore } from './store';

export function App() {
  const screen = useUiStore((s) => s.screen);
  return (
    <div className="app-shell">
      <main className="app-main">
        {screen === 'library' && <LibraryScreen />}
        {screen === 'diagnostics' && <DiagnosticsScreen />}
      </main>
      <StatusFooter />
    </div>
  );
}
