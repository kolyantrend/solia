/**
 * Platform detection utilities.
 * Detects whether the app is running as a native Capacitor app or in a web browser.
 */
import { Capacitor } from '@capacitor/core';

/** True when running inside the native Android/iOS shell */
export const isNative = Capacitor.isNativePlatform();

/** True when running in a regular browser tab */
export const isWeb = !isNative;

/** 'android' | 'ios' | 'web' */
export const platform = Capacitor.getPlatform();

/**
 * On native: monkey-patch window.open so wallet libraries (MWA, Phantom, Solflare)
 * that call window.open('solana-wallet://...') get forwarded as location.href,
 * which triggers the native WebViewClient → Android intent resolution.
 */
if (isNative) {
  const _origOpen = window.open;
  window.open = function (url?: string | URL, target?: string, features?: string) {
    const urlStr = url?.toString() ?? '';
    // Forward custom-scheme wallet URLs through navigation (triggers native intent handler)
    if (urlStr && !urlStr.startsWith('http') && !urlStr.startsWith('about') && !urlStr.startsWith('blob') && !urlStr.startsWith('data')) {
      window.location.href = urlStr;
      return null;
    }
    return _origOpen.call(window, url, target, features);
  } as typeof window.open;
}
