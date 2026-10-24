'use strict'
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const root = path.resolve(__dirname, '../source/assets')
const home = path.join(root, 'home')
const out = path.join(home, 'optimized')
fs.mkdirSync(out, { recursive: true })
const files = fs.readdirSync(home).filter(name => /^(pc_\d+|home_mobile_\d+)\.png$/.test(name))
let count = 0
for (const name of files) {
  const input = path.join(home, name)
  for (const [kind, width, quality] of [['thumb', 320, 75], ['cover', 960, 82], ['background', 1920, 88]]) {
    const output = path.join(out, name.replace('.png', '-' + kind + '.webp'))
    if (fs.existsSync(output) && fs.statSync(output).mtimeMs >= fs.statSync(input).mtimeMs) continue
    const result = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-i', input, '-vf', `scale=w='min(${width},iw)':h=-1`, '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(quality), '-y', output], { encoding: 'utf8', windowsHide: true })
    if (result.error || result.status !== 0) throw new Error(result.error ? result.error.message : result.stderr)
    count++
  }
}
fs.mkdirSync(path.join(root, 'fallback'), { recursive: true })
const emergency = path.join(root, 'fallback/image.webp')
if (!fs.existsSync(emergency)) fs.copyFileSync(path.join(out, 'pc_01-thumb.webp'), emergency)
const avatar = path.join(root, 'fallback/avatar.png')
if (!fs.existsSync(avatar)) fs.copyFileSync(path.join(root, 'avatar.png'), avatar)
console.log(`Prepared ${files.length} image groups (${count} variants updated); local fallbacks ready.`)
