// Keeps the drawing, position, skater and palette in this browser.
const KEY = 'icedoodle2-save-v1';
export function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    return d && Array.isArray(d.prints) ? d : null;
  } catch (e) {
    return null;
  }
}
export function store(d) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    return true;
  } catch (e) {
    return false;
  }
}
