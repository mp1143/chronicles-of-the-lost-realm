import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wraps the same `dist/` the web build produces — there is no
 * platform-specific game code (TechnicalDesign §1.1). `npm run sync:android`
 * and `npm run sync:ios` build the web bundle and copy it into the native
 * projects.
 */
const config: CapacitorConfig = {
  appId: 'com.lostrealm.chronicles',
  appName: 'Chronicles of the Lost Realm',
  webDir: 'dist',
  // No live-reload server in shipped builds; set CAP_SERVER_URL locally for
  // on-device iteration instead of committing a dev URL here.
  server: {
    androidScheme: 'https',
  },
  android: {
    // The game draws its own dark background; letting the WebView flash white
    // on launch is the single most noticeable polish bug on Android.
    backgroundColor: '#0c0e14',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    backgroundColor: '#0c0e14',
    contentInset: 'never',
    // The canvas handles its own scrolling; the WebView's bounce fights it.
    scrollEnabled: false,
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#0c0e14',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
