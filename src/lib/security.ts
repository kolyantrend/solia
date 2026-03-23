/**
 * Security utilities — prevent DevTools, right-click, source viewing.
 * Call initSecurity() once on app startup.
 */

export function initSecurity() {
  if (import.meta.env.DEV) return; // Skip in development mode

  // Block right-click context menu globally
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // Block keyboard shortcuts for DevTools
  document.addEventListener('keydown', (e) => {
    // F12
    if (e.key === 'F12') {
      e.preventDefault();
      return;
    }
    // Ctrl+Shift+I (DevTools)
    if (e.ctrlKey && e.shiftKey && e.key === 'I') {
      e.preventDefault();
      return;
    }
    // Ctrl+Shift+J (Console)
    if (e.ctrlKey && e.shiftKey && e.key === 'J') {
      e.preventDefault();
      return;
    }
    // Ctrl+Shift+C (Inspector)
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      return;
    }
    // Ctrl+U (View Source)
    if (e.ctrlKey && e.key === 'u') {
      e.preventDefault();
      return;
    }
    // Ctrl+S (Save page)
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      return;
    }
  });

  // Block drag for all images
  document.addEventListener('dragstart', (e) => {
    if (e.target instanceof HTMLImageElement) {
      e.preventDefault();
    }
  });

  // Block text selection on images
  document.addEventListener('selectstart', (e) => {
    if (e.target instanceof HTMLImageElement) {
      e.preventDefault();
    }
  });
}
