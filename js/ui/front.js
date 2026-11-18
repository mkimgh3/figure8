// The front page: shown at launch and from Menu > Front page. Rows of choices (skater, place, time of day, mode) over
// the live scene, which changes as you choose, and a Start button. The game is paused while it is open.
// rows: [{ id, names, get() -> index, set(index) }]; about(): the line under the rows; onStart(): Start was tapped.
const $ = (id) => document.getElementById(id);

export function createFront(rows, about, onStart, onShow) {
  const root = $('front');
  let open = false;
  const render = () => {
    for (const r of rows)
      [...$(r.id).children].forEach((b, i) => {
        b.classList.toggle('on', i === r.get());
        b.setAttribute('aria-pressed', String(i === r.get()));
      });
    $('fabout').textContent = about();
  };
  for (const r of rows) {
    const box = $(r.id);
    box.textContent = '';
    r.names().forEach((n, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = n;
      b.addEventListener('click', () => {
        r.set(i);
        render();
      });
      box.appendChild(b);
    });
  }
  $('fstart').addEventListener('click', () => {
    api.hide();
    onStart();
  });
  const api = {
    get open() {
      return open;
    },
    show() {
      open = true;
      render();
      root.hidden = false;
      document.body.classList.add('front');
      if (onShow) onShow(true);
    },
    hide() {
      open = false;
      root.hidden = true;
      document.body.classList.remove('front');
      if (onShow) onShow(false);
    },
    render,
  };
  return api;
}
