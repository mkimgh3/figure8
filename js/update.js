// Keeps a Home Screen copy current, since it has no reload button. version.json (written by tools/stamp.cjs before
// each publish) names the published build and lists its files. When that build differs from the one running, every
// file is fetched afresh past the browser's cache and the page reloads.
const KEY = 'icedoodle2-updated';

export function createUpdater(build, onStatus, beforeReload) {
  let busy = false;
  const tried = () => {
    try {
      return sessionStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  };
  // manual: the player asked, so always answer and always try. Otherwise a build is tried once per launch, so a
  // half-published update cannot make the page reload over and over.
  async function check(manual) {
    if (busy) return;
    busy = true;
    try {
      const r = await fetch('version.json', { cache: 'no-store' });
      if (!r.ok) throw new Error('no version file');
      const v = await r.json();
      if (!v.build || v.build === build) onStatus(manual ? 'up to date' : '');
      else if (!manual && tried() === v.build) onStatus(v.build + ' is out. Tap Update');
      else {
        onStatus('updating to ' + v.build + '…');
        try {
          sessionStorage.setItem(KEY, v.build);
        } catch (e) {}
        await Promise.all((v.files || []).map((f) => fetch(f, { cache: 'reload' }).catch(() => null)));
        if (beforeReload) beforeReload();
        location.reload();
      }
    } catch (e) {
      onStatus(manual ? 'could not check. Are you online?' : '');
    }
    busy = false;
  }
  return { check };
}
