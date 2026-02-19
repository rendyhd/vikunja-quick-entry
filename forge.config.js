const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    name: 'Vikunja Quick Entry',
    executableName: 'vikunja-quick-entry',
    asar: true,
    icon: './assets/icon',
    extraResource: [
      './resources/get-browser-url.ps1',
      './resources/native-messaging-host',
    ],
  },
  makers: [
    {
      name: '@electron-forge/maker-wix',
      config: {
        name: 'Vikunja Quick Entry',
        manufacturer: 'rendyhd',
        icon: './assets/icon.ico',
        appUserModelId: 'com.rendyhd.vikunja-quick-entry',
        upgradeCode: '719A9696-4EFB-47E2-8E70-2194481BE6BA',
        ui: {
          chooseDirectory: true,
        },
      },
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        name: 'Vikunja-Quick-Entry',
        icon: './assets/icon.icns',
      },
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          name: 'vikunja-quick-entry',
          productName: 'Vikunja Quick Entry',
          categories: ['Utility'],
          icon: './assets/icon.png',
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          name: 'vikunja-quick-entry',
          productName: 'Vikunja Quick Entry',
          categories: ['Utility'],
          icon: './assets/icon.png',
        },
      },
    },
  ],
  plugins: [
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
    }),
  ],
};
