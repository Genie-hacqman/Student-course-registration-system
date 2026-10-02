import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const server = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server')

/** Recreates the `<DB_NAME>_test` schema from migrations and demo seeders (the same recipe the server's integration tests use). */
export default function globalSetup() {
  const run = (cmd) => execSync(`npx sequelize-cli ${cmd}`, { cwd: server, env: { ...process.env, NODE_ENV: 'test' }, stdio: 'pipe' })
  try { run('db:drop') } catch { /* did not exist yet */ }
  run('db:create')
  run('db:migrate')
  run('db:seed:all')
}
