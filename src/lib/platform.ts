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
