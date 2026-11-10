import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const isWindows = process.platform === 'win32'
const venvPython = join(root, '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python')
const npmCli = process.env.npm_execpath
const npm = npmCli ? process.execPath : isWindows ? 'npm.cmd' : 'npm'
const npmArgs = npmCli ? [npmCli] : []
const needsShell = (command) => isWindows && /\.cmd$/i.test(command)

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: root,
    shell: needsShell(command),
  })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function findPython() {
  if (process.env.PYTHON) return { command: process.env.PYTHON, args: [] }
  const candidates = isWindows
    ? [
        { command: 'py', args: ['-3'] },
        { command: 'python', args: [] },
        { command: 'python3', args: [] },
      ]
    : [
        { command: 'python3', args: [] },
        { command: 'python', args: [] },
      ]
  for (const candidate of candidates) {
    const test = spawnSync(candidate.command, [...candidate.args, '--version'], {
      stdio: 'ignore',
      shell: needsShell(candidate.command),
    })
    if (test.status === 0) return candidate
  }
  console.error('Python 3 was not found. Install Python 3.11+ and run this again.')
  process.exit(1)
}

console.log('VideoTagger setup')
console.log('Checking Node, Python, FFmpeg, and yt-dlp...')

for (const tool of ['ffmpeg', 'ffprobe']) {
  const check = spawnSync(tool, ['-version'], { stdio: 'ignore' })
  if (check.status !== 0) {
    console.warn(
      `WARNING: ${tool} was not found on PATH. Install FFmpeg and restart the terminal before using VideoTagger.`,
    )
  }
}

if (!existsSync(venvPython)) {
  const python = findPython()
  run(python.command, [...python.args, '-m', 'venv', '.venv'])
}

run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'])
run(venvPython, ['-m', 'pip', 'install', '-r', 'backend/requirements.txt'])
run(npm, [...npmArgs, 'install', '--prefix', 'frontend'])

console.log('\nSetup complete.')
console.log('  Development:  npm run dev')
console.log('  Production:   npm run build && npm start')
