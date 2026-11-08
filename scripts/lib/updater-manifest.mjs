// The in-app updater's `latest.json`: for each system, the signed file to
// download and its signature. Built from the `.sig` files the release build
// writes next to each updater file (ADR 0027).

/** Which updater targets a file serves, by its name. The first one listed wins a target. */
const KINDS = [
  [/-setup\.exe$/, ['windows-x86_64-nsis', 'windows-x86_64']],
  [/\.msi$/, ['windows-x86_64-msi', 'windows-x86_64']],
  // The macOS build is universal: one archive for both kinds of Mac.
  [
    /\.app\.tar\.gz$/,
    ['darwin-aarch64-app', 'darwin-x86_64-app', 'darwin-aarch64', 'darwin-x86_64'],
  ],
  [/\.AppImage$/, ['linux-x86_64-appimage', 'linux-x86_64']],
  [/\.deb$/, ['linux-x86_64-deb']],
  [/\.rpm$/, ['linux-x86_64-rpm']],
];

/**
 * @param {{ name: string, signature: string }[]} signed  updater files and the
 *   contents of their `.sig` files
 * @param {{ version: string, tag: string, repo: string, notes?: string, date?: string }} release
 */
export function updaterManifest(signed, { version, tag, repo, notes = '', date }) {
  const platforms = {};
  // In the order of KINDS, so a bare system name gets the first installer.
  for (const [re, targets] of KINDS) {
    const files = signed.filter((f) => re.test(f.name)).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const { name, signature } of files) {
      const url = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
      for (const target of targets) {
        if (!(target in platforms)) platforms[target] = { signature: signature.trim(), url };
      }
    }
  }
  return {
    version,
    notes,
    pub_date: date ?? new Date().toISOString(),
    platforms,
  };
}
