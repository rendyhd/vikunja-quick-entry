const esbuild = require('esbuild')

esbuild.buildSync({
  entryPoints: ['src/renderer/renderer-src.js'],
  bundle: true,
  outfile: 'src/renderer/renderer.js',
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  sourcemap: false,
})

console.log('renderer bundle built → src/renderer/renderer.js')
