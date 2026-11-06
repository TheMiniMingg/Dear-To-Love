import { DiagnosticsScreen } from '../features/diagnostics/DiagnosticsScreen';
import { ImagesScreen } from '../features/images/ImagesScreen';
import { LibraryScreen } from '../features/library/LibraryScreen';
import { CreateWizardScreen } from '../features/create/CreateWizardScreen';
import { QuickStartScreen } from '../features/create/QuickStartScreen';
import { ReaderScreen } from '../features/reader/ReaderScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { UsageScreen } from '../features/usage/UsageScreen';
import { StatusFooter } from '../components/StatusFooter';
import { useUiStore } from './store';

export function App() {
  const screen = useUiStore((s) => s.screen);
  return (
    <div className="app-shell">
      <main className="app-main">
        {screen.name === 'library' && <LibraryScreen />}
        {screen.name === 'quickstart' && <QuickStartScreen />}
        {screen.name === 'create' && <CreateWizardScreen />}
        {screen.name === 'reader' && <ReaderScreen key={screen.routeId} routeId={screen.routeId} />}
        {screen.name === 'diagnostics' && <DiagnosticsScreen />}
        {screen.name === 'settings' && <SettingsScreen />}
        {screen.name === 'usage' && <UsageScreen />}
        {screen.name === 'images' && <ImagesScreen />}
      </main>
      <StatusFooter />
    </div>
  );
}
