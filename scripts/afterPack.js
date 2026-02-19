const { flipFuses, FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');

module.exports = async function afterPack(context) {
  const ext = { darwin: '.app', win32: '.exe' }[context.electronPlatformName];
  if (!ext) return; // Linux doesn't need fuse flipping for our use case

  const exe = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}${ext}`
  );

  await flipFuses(exe, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
  });
};
