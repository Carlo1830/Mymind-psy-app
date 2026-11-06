// Isolated browser verification: all records live in an in-memory test database.
// Build first. Stop with Ctrl+C after verifying the form and chart.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { testPostgres } from './test-postgres-helper.mjs';

const database = await testPostgres(55449);
const origin = 'http://127.0.0.1:3190';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3190', '-H', '127.0.0.1'], {
  env: { ...process.env, DATABASE_URL: database.url, DIRECT_URL: database.url,
    APP_ORIGIN: origin, ALLOW_REGISTRATION: 'true', RESEND_API_KEY: '', EMAIL_FROM: '',
    CRON_SECRET: '', AGENDA_CONFIRMATION_SECRET: '', RESEND_WEBHOOK_SECRET: '' },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let output = '';
server.stdout.on('data', chunk => { output += chunk; });
server.stderr.on('data', chunk => { output += chunk; });
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if (server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }
  await database.close();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void stop(); });
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw Error('Local preview exited: ' + output);
    try { if ((await fetch(origin + '/acceso')).ok) { ready = true; break; } } catch { /* Starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw Error('Local preview did not become ready.');
  const account = await fetch(origin + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ nombre: 'Verificación sintética', email: 'evaluaciones@example.test', password: 'Synthetic-test-1234!' }),
  });
  if (account.status !== 201) throw Error('Synthetic account setup failed.');
  const patient = await fetch(origin + '/api/pacientes', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: account.headers.get('set-cookie').split(';')[0] },
    body: JSON.stringify({ nombre_completo: 'Paciente sintético de evaluaciones', email: 'paciente@example.test', telefono: '', estado: 'En evaluación', motivo_consulta: '', notas_confidenciales: '' }),
  });
  if (patient.status !== 201) throw Error('Synthetic patient setup failed.');
  console.log('Isolated preview ready: ' + origin + '/acceso');
  console.log('Synthetic login: evaluaciones@example.test / Synthetic-test-1234!');
  console.log('No production database or email provider is used. Stop with Ctrl+C.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  await stop();
}
