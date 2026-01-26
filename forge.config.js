const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    name: 'Vikunja Quick Entry',
    executableName: 'vikunja-quick-entry',
    asar: true,
    icon: './assets/icon',
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'vikunja-quick-entry',
        setupIcon: './assets/icon.ico',
      },
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        name: 'Vikunja Quick Entry',
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
