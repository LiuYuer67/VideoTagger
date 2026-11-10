import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const isWindows = process.platform === 'win32'
const venvPython = join(root, '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python')
const python = existsSync(venvPython) ? venvPython : isWindows ? 'python' : 'python3'
const npmCli = process.env.npm_execpath
const npm = npmCli ? process.execPath : isWindows ? 'npm.cmd' : 'npm'
const npmArgs = npmCli ? [npmCli] : []
const children = []
let closing = false

function start(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: isWindows && /\.cmd$/i.test(command),
    ...options,
  })
  child.on('exit', (code) => {
    if (closing) return
    console.log(`[${label}] exited with code ${code ?? 0}`)
    shutdown(code ?? 0)
  })
  children.push(child)
  return child
}

function shutdown(code = 0) {
  if (closing) return
  closing = true
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  setTimeout(() => process.exit(code), 250)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('Starting VideoTagger API on http://127.0.0.1:8000')
console.log('Starting Vite UI on http://127.0.0.1:5173')

start('api', python, [
  '-m',
  'uvicorn',
  'backend.app.main:app',
  '--host',
  '127.0.0.1',
  '--port',
  '8000',
  '--reload',
])

start('web', npm, [...npmArgs, '--prefix', 'frontend', 'run', 'dev'])
