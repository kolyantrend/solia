/**
 * Platform detection utilities.
 * PWA mode — no native Capacitor dependency.
 */

/** True when running as installed PWA (standalone mode) */
export const isPWA = window.matchMedia('(display-mode: standalone)').matches
  || (navigator as any).standalone === true;

/** True when running in a regular browser tab */
export const isWeb = !isPWA;
