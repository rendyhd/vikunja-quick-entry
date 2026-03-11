const { execSync } = require('child_process');

module.exports = async function beforePack() {
  console.log('Building renderer bundle...');
  execSync('node build-renderer.js', { stdio: 'inherit' });
};
