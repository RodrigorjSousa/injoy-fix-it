import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.injoy.manutencao',
  appName: 'Manutenção INJOY',
  webDir: 'dist',
  server: {
    // Hot-reload do preview Lovable em dispositivos físicos durante o desenvolvimento.
    // Remova o bloco "server" antes de gerar o build de produção para as lojas.
    url: 'https://e316cfb5-227e-4195-884c-0f51635d3f28.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  android: {
    backgroundColor: '#0c5a64',
  },
  ios: {
    backgroundColor: '#0c5a64',
    contentInset: 'always',
  },
};

export default config;
