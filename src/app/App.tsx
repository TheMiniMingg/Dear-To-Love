import { useEffect } from 'react';
import { commands } from '../api/commands';
import { DiagnosticsScreen } from '../features/diagnostics/DiagnosticsScreen';
import { BackupsScreen } from '../features/backups/BackupsScreen';
import { GuideScreen } from '../features/guide/GuideScreen';
import { ImagesScreen } from '../features/images/ImagesScreen';
import { LibraryScreen } from '../features/library/LibraryScreen';
import { CreateWizardScreen } from '../features/create/CreateWizardScreen';
import { QuickStartScreen } from '../features/create/QuickStartScreen';
import { ReaderScreen } from '../features/reader/ReaderScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { UsageScreen } from '../features/usage/UsageScreen';
import { ShortcutsDialog } from '../components/ShortcutsDialog';
import { StatusFooter } from '../components/StatusFooter';
import { Backdrop } from './Backdrop';
import { useBackdrop } from './backdropStore';
import { useUiStore } from './store';
import { useLanguage } from '../i18n';

export function App() {
  const screen = useUiStore((s) => s.screen);
  // Every screen reads the language as it renders, so a new choice redraws
  // the app from here (screens keep their place in the store).
  const language = useLanguage((s) => s.locale);
  const backdrop = useBackdrop((s) => s.assetId !== null);
  // Tells the app the interface loaded (used by the installer smoke test).
  useEffect(() => {
    void commands.frontendReady().catch(() => undefined);
  }, []);
  return (
    <div className={`app-shell${backdrop ? ' has-backdrop' : ''}`} key={language}>
      <Backdrop />
      <main className="app-main">
        {screen.name === 'library' && <LibraryScreen />}
        {screen.name === 'quickstart' && <QuickStartScreen />}
        {screen.name === 'create' && <CreateWizardScreen />}
        {screen.name === 'reader' && <ReaderScreen key={screen.routeId} routeId={screen.routeId} />}
        {screen.name === 'diagnostics' && <DiagnosticsScreen />}
        {screen.name === 'settings' && <SettingsScreen />}
        {screen.name === 'usage' && <UsageScreen />}
        {screen.name === 'images' && <ImagesScreen />}
        {screen.name === 'backups' && <BackupsScreen />}
        {screen.name === 'guide' && <GuideScreen />}
      </main>
      <StatusFooter />
      <ShortcutsDialog />
    </div>
  );
}
