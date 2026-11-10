import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const isWindows = process.platform === 'win32'
const venvPython = join(root, '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python')
const python = existsSync(venvPython) ? venvPython : isWindows ? 'python' : 'python3'
const port = process.env.PORT || '8000'
const host = process.env.HOST || '127.0.0.1'

if (!existsSync(join(root, 'frontend', 'dist', 'index.html'))) {
  console.error('The frontend is not built yet. Run: npm run build')
  process.exit(1)
}

console.log(`VideoTagger running at http://${host}:${port}`)
const child = spawn(
  python,
  [
    '-m',
    'uvicorn',
    'backend.app.main:app',
    '--host',
    host,
    '--port',
    port,
  ],
  { cwd: root, stdio: 'inherit', env: process.env },
)

child.on('exit', (code) => process.exit(code ?? 0))
process.on('SIGINT', () => child.kill())
process.on('SIGTERM', () => child.kill())
