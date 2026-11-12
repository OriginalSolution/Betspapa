import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.betspapa.scores',
  appName: 'Betspapa',
  webDir: 'dist',
  backgroundColor: '#000000',
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
