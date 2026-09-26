import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import { Database } from '../database/postgres.mjs';
import { testPostgres } from './test-postgres-helper.mjs';
const testDatabase = await testPostgres();
const db = new Database(testDatabase.client);
const port = 3187;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'], { env: { ...process.env, DATABASE_URL: testDatabase.url, APP_ORIGIN: base }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let output = '';
let cookie = '';
server.stdout.on('data', data => { output += data; });
server.stderr.on('data', data => { output += data; });
async function request(route, method = 'GET', value, status = 200) {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie }, body: value === undefined ? undefined : JSON.stringify(value) });
    assert.equal(response.status, status, await response.clone().text());
    const sessionCookie = response.headers.get('set-cookie');
    if (sessionCookie)
        cookie = sessionCookie.split(';')[0];
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
}
try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
        if (server.exitCode !== null)
            throw new Error(output);
        try {
            const response = await fetch(base + '/pacientes');
            if (response.ok) {
                ready = true;
                break;
            }
        }
        catch { /* Wait until the local server is ready. */ }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(ready, output);
    for (const [path, method, payload] of [
        ['/api/pacientes', 'GET'], ['/api/pacientes', 'POST', {}], ['/api/pacientes/nope', 'GET'], ['/api/pacientes/nope', 'PUT', {}], ['/api/pacientes/nope/sesiones', 'POST', {}],
        ['/api/sesiones?desde=2026-10-01T00:00:00.000Z&hasta=2026-11-01T00:00:00.000Z', 'GET'], ['/api/sesiones', 'POST', {}], ['/api/sesiones/nope', 'PUT', {}],
        ['/api/perfil', 'GET'], ['/api/perfil', 'PUT', {}], ['/api/marketing/plantillas', 'GET'], ['/api/marketing/plantillas', 'PUT', {}],
        ['/api/marketing/recursos', 'GET'], ['/api/marketing/recursos', 'POST', {}], ['/api/marketing/recursos', 'PUT', {}], ['/api/marketing/contenido', 'POST', {}],
    ])
        await request(path, method, payload, 401);
    const accountA = await request('/api/auth/register', 'POST', { nombre: 'Profesional A', email: 'profesional-a@example.test', password: 'Test-password-1234!', rol: 'administrador' }, 201);
    assert.equal(accountA.usuario.rol, 'psicologo');
    const cookieA = cookie;
    for (const page of ['/', '/dashboard', '/pacientes', '/calendario', '/marketing']) {
        const pageResponse = await fetch(base + page, { headers: { Cookie: cookieA } });
        const pageHtml = await pageResponse.text();
        assert.equal(pageResponse.status, 200, pageHtml.slice(0, 500));
        assert.ok(!pageHtml.includes('NEXT_HTTP_ERROR_FALLBACK;500'));
    }
    const values = { nombre_completo: 'María Prueba', email: 'maria@example.test', telefono: '+56 912345678', estado: 'Nuevo contacto', motivo_consulta: 'Prueba sintética', notas_confidenciales: 'Nota inicial sintética' };
    const patient = await request('/api/pacientes', 'POST', values, 201);
    const second = await request('/api/pacientes', 'POST', { ...values, nombre_completo: 'Otro paciente' }, 201);
    const route = `/api/pacientes/${patient.id}`;
    assert.equal((await request('/api/pacientes?q=MARIA')).length, 1);
    assert.equal((await request('/api/pacientes?q=%27%20OR%201%3D1')).length, 0);
    assert.equal((await request('/api/pacientes'))[0].notas_confidenciales, undefined);
    await request(route, 'PUT', { ...values, estado: 'Tratamiento activo', nombre_completo: 'María Actualizada' });
    assert.equal((await request('/api/pacientes?estado=Tratamiento%20activo')).length, 1);
    await request('/api/pacientes', 'POST', { ...values, nombre_completo: ' ' }, 400);
    await request('/api/pacientes', 'POST', { ...values, email: 'invalido' }, 400);
    await request(route, 'PUT', { ...values, estado: 'No existe' }, 400);
    await request('/api/pacientes/no-existe', 'GET', undefined, 404);
    const note = { fecha_hora: '2026-09-24T15:30:00.000Z', notas_evolucion: 'Primera evolución' };
    const session = await request(route + '/sesiones', 'POST', note, 201);
    await request(route + '/sesiones', 'POST', { ...note, sesion_id: session.id, notas_evolucion: 'Segunda evolución' });
    await request(`/api/pacientes/${second.id}/sesiones`, 'POST', { ...note, sesion_id: session.id }, 404);
    await request(route + '/sesiones', 'POST', { ...note, notas_evolucion: ' ' }, 400);
    await request(route + '/sesiones', 'POST', { ...note, fecha_hora: 'invalid' }, 400);
    const detail = await request(route);
    assert.equal(detail.paciente.nombre_completo, 'María Actualizada');
    assert.equal(detail.sesiones.length, 1);
    assert.equal(detail.sesiones[0].estado_sesion, 'Realizada');
    assert.match(detail.sesiones[0].notas_evolucion, /Primera evolución/);
    assert.match(detail.sesiones[0].notas_evolucion, /Segunda evolución/);
    const appointment = { paciente_id: patient.id, fecha_hora: '2026-10-05T13:00:00.000Z', duracion_minutos: 50, estado_sesion: 'Programada', modalidad: 'Online' };
    const booked = await request('/api/sesiones', 'POST', appointment, 201);
    const range = '/api/sesiones?desde=2026-10-01T00:00:00.000Z&hasta=2026-11-01T00:00:00.000Z';
    assert.equal((await request(range)).length, 1);
    assert.equal((await request(range))[0].nombre_completo, 'María Actualizada');
    assert.equal((await request(range))[0].notas_evolucion, undefined);
    await request(route + '/sesiones', 'POST', { ...note, sesion_id: booked.id, notas_evolucion: 'Nota antes de reprogramar' });
    const changed = { ...appointment, fecha_hora: '2026-10-06T14:00:00.000Z', duracion_minutos: 60, estado_sesion: 'Realizada', modalidad: 'Presencial' };
    await request(`/api/sesiones/${booked.id}`, 'PUT', changed);
    const calendarDetail = (await request(route)).sesiones.find(s => s.id === booked.id);
    assert.equal(calendarDetail.fecha_hora, changed.fecha_hora);
    assert.equal(calendarDetail.duracion_minutos, 60);
    assert.equal(calendarDetail.modalidad, 'Presencial');
    assert.equal(calendarDetail.estado_sesion, 'Realizada');
    assert.match(calendarDetail.notas_evolucion, /Nota antes de reprogramar/);
    await request(`/api/sesiones/${booked.id}`, 'PUT', { ...changed, estado_sesion: 'Cancelada' });
    assert.equal((await request(range))[0].estado_sesion, 'Cancelada');
    assert.equal((await request('/api/sesiones?desde=2026-10-01T00:00:00.000Z&hasta=2026-10-06T14:00:00.000Z')).length, 0);
    await request(`/api/sesiones/${booked.id}`, 'PUT', { ...changed, paciente_id: second.id }, 400);
    await request('/api/sesiones', 'POST', { ...appointment, paciente_id: 'inexistente' }, 404);
    for (const invalid of [{ duracion_minutos: 0 }, { duracion_minutos: 50.5 }, { modalidad: 'Otra' }, { estado_sesion: 'Otro' }, { fecha_hora: '2026-02-30T13:00:00.000Z' }])
        await request('/api/sesiones', 'POST', { ...appointment, ...invalid }, 400);
    await request('/api/sesiones/inexistente', 'PUT', appointment, 404);
    await request('/api/sesiones?desde=invalido&hasta=invalido', 'GET', undefined, 400);
    console.log('Calendario verificado: alta, rangos, reprogramación, estados, duración, modalidad y conservación de notas.');
    await request('/api/perfil', 'PUT', { nombre: 'Profesional A', especialidad: 'Ansiedad', tono: 'Educativo', enlace_consulta: 'https://example.test/consulta' });
    const draft = await request('/api/marketing/contenido', 'POST', { tema: 'Autoestima', formato: 'Reel Script', tono: 'Empático' });
    for (const key of ['gancho', 'desarrollo', 'ejercicio', 'cta', 'hashtags'])
        assert.ok(draft[key]);
    assert.match(draft.cta, /Profesional A/);
    const templates = await request('/api/marketing/plantillas');
    assert.equal(templates.length, 5);
    const editedTemplate = { ...templates[0], contenido: 'Mensaje A {{nombre_paciente}}', dias_espera: 5 };
    await request('/api/marketing/plantillas', 'PUT', editedTemplate);
    const guideData = { titulo: 'Guía de prueba A', descripcion: 'Recurso sintético', tipo: 'guia', contenido: 'Contenido descargable sintético', preguntas: [], publicado: false };
    const guide = await request('/api/marketing/recursos', 'POST', guideData, 201);
    await request(`/api/publico/${guide.id}`, 'GET', undefined, 404);
    await request('/api/marketing/recursos', 'PUT', { ...guideData, id: guide.id, publicado: true });
    cookie = ''; // Independent browser session for professional B.
    const accountB = await request('/api/auth/register', 'POST', { nombre: 'Profesional B', email: 'profesional-b@example.test', password: 'Test-password-5678!' }, 201);
    const cookieB = cookie;
    assert.notEqual(accountB.usuario.id, accountA.usuario.id);
    assert.equal((await request('/api/pacientes')).length, 0);
    assert.equal((await request(range)).length, 0);
    assert.equal((await request('/api/marketing/recursos')).length, 0);
    assert.equal((await request('/api/perfil')).nombre, 'Profesional B');
    await request(route, 'GET', undefined, 404);
    await request(route, 'PUT', values, 404);
    await request(route + '/sesiones', 'POST', note, 404);
    await request('/api/sesiones', 'POST', appointment, 404);
    const bPatient = await request('/api/pacientes', 'POST', { ...values, nombre_completo: 'Paciente B' }, 201);
    await request(`/api/sesiones/${booked.id}`, 'PUT', { ...changed, paciente_id: bPatient.id }, 404);
    await request('/api/marketing/plantillas', 'PUT', editedTemplate, 404);
    await request('/api/marketing/recursos', 'PUT', { ...guideData, id: guide.id, publicado: false }, 404);
    const bTemplates = await request('/api/marketing/plantillas');
    assert.ok(bTemplates.every(t => t.id !== templates[0].id));
    const csrf = await fetch(base + '/api/perfil', { method: 'PUT', headers: { Cookie: cookieB, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(csrf.status, 403);
    cookie = '';
    const pub = await request(`/api/publico/${guide.id}`);
    assert.equal(pub.usuario_id, undefined);
    assert.equal(pub.contenido, undefined);
    assert.equal(pub.profesional, 'Profesional A');
    const capture = { nombre_completo: 'Prospecto público', email: 'prospecto@example.test', consentimiento: true, marketing: false, website: '' };
    await request(`/api/publico/${guide.id}`, 'POST', { ...capture, consentimiento: false }, 400);
    const delivered = await request(`/api/publico/${guide.id}`, 'POST', capture, 201);
    assert.equal(delivered.contenido, guideData.contenido);
    assert.equal(delivered.paciente_id, undefined);
    await request(`/api/publico/${guide.id}`, 'POST', capture, 201);
    cookie = cookieB;
    assert.equal((await request('/api/pacientes')).length, 1);
    cookie = cookieA;
    const prospect = (await request('/api/pacientes')).find(p => p.email === capture.email);
    assert.equal(prospect.estado, 'Nuevo contacto');
    assert.match(prospect.fuente_captacion, /Guía de prueba A/);
    assert.equal((await request('/api/pacientes')).length, 3);
    assert.equal((await request('/api/marketing/recursos'))[0].captaciones, 1);
    const testResource = await request('/api/marketing/recursos', 'POST', { ...guideData, titulo: 'Reflexión', tipo: 'test', preguntas: ['Pregunta uno', 'Pregunta dos'], publicado: true }, 201);
    cookie = '';
    await request(`/api/publico/${testResource.id}`, 'POST', capture, 400);
    const reflection = await request(`/api/publico/${testResource.id}`, 'POST', { ...capture, respuestas: [1, 2] }, 201);
    assert.match(reflection.aviso, /no tiene puntuación diagnóstica/);
    cookie = cookieA;
    await request('/api/marketing/recursos', 'PUT', { ...guideData, id: guide.id, publicado: false });
    cookie = '';
    await request(`/api/publico/${guide.id}`, 'GET', undefined, 404);
    await request(`/api/publico/${guide.id}`, 'POST', capture, 404);
    await request('/api/auth/login', 'POST', { email: 'profesional-a@example.test', password: 'Wrong-password-123' }, 401);
    await request('/api/auth/login', 'POST', { email: 'profesional-a@example.test', password: 'Test-password-1234!' });
    const revokedCookie = cookie;
    await request('/api/auth/logout', 'POST');
    cookie = revokedCookie;
    await request('/api/pacientes', 'GET', undefined, 401);
    cookie = cookieA;
    console.log('SaaS verificado: autenticación, dos profesionales aislados, roles, CSRF, plantillas, contenido, captación y revocación de sesión.');
    assert.equal((await db.prepare('SELECT count(*) AS total FROM pacientes').get()).total, 4);
    assert.equal((await db.prepare('SELECT nombre_completo FROM pacientes WHERE id = ?').get(patient.id)).nombre_completo, 'María Actualizada');
    const activationToken = 'a'.repeat(64);
    const pendingId = randomUUID();
    (await db.prepare("INSERT INTO usuarios (id, email, password_hash, nombre, rol) VALUES (?, ?, 'pending', 'Principal prueba', 'administrador')").run(pendingId, 'principal@example.test'));
    (await db.prepare('INSERT INTO setup_tokens (token_hash, usuario_id, expires_at) VALUES (?, ?, ?)').run(createHash('sha256').update(activationToken).digest('hex'), pendingId, Date.now() + 60000));
    cookie = '';
    await request('/api/auth/register', 'POST', { nombre: 'Intento', email: 'principal@example.test', password: 'Test-password-9999!' }, 409);
    await request('/api/auth/login', 'POST', { email: 'principal@example.test', password: 'Test-password-9999!' }, 401);
    await request('/api/auth/activate', 'POST', { email: 'principal@example.test', password: 'Test-password-9999!', token: 'invalid' }, 400);
    const activation = await request('/api/auth/activate', 'POST', { email: 'principal@example.test', password: 'Test-password-9999!', token: activationToken });
    assert.equal(activation.usuario.rol, 'administrador');
    assert.equal((await request('/api/pacientes')).length, 0);
    await request('/api/auth/activate', 'POST', { email: 'principal@example.test', password: 'Test-password-9999!', token: activationToken }, 400);
    (await db.prepare('UPDATE auth_sessions SET expires_at = 0 WHERE usuario_id = ?').run(pendingId));
    await request('/api/perfil', 'GET', undefined, 401);
    console.log('Activación verificada: cuenta reservada, enlace de un uso y expiración de sesión.');
    (await db.prepare('INSERT INTO configuracion_sitio (id, profesional_id) VALUES (1, ?)').run(accountA.usuario.id));
    cookie = '';
    for (const [path, method] of [['/api/dashboard', 'GET'], ['/api/disponibilidad', 'GET'], ['/api/disponibilidad', 'PUT'], ['/api/disponibilidad', 'POST'], ['/api/disponibilidad', 'DELETE']])
        await request(path, method, method === 'GET' ? undefined : {}, 401);
    const landingResponse = await fetch(base + '/');
    assert.equal(landingResponse.status, 200);
    assert.match(await landingResponse.text(), /Un espacio para/);
    assert.equal((await fetch(base + '/dashboard', { redirect: 'manual' })).status, 307);
    cookie = cookieA;
    const availabilityRule = { dias: [1, 2, 3, 4, 5], hora_inicio: '09:00', hora_fin: '18:00', duracion_minutos: 50, modalidad: 'Ambas', activa: true };
    await request('/api/disponibilidad', 'PUT', availabilityRule);
    const schedule = await request('/api/disponibilidad');
    assert.equal(schedule.es_profesional_publico, true);
    assert.ok(schedule.horarios.length > 100);
    cookie = '';
    const publicSlots = await request('/api/reservas/disponibilidad');
    assert.ok(publicSlots.horarios.length > 100);
    const chosenSlot = publicSlots.horarios[0];
    assert.equal(chosenSlot.usuario_id, undefined);
    assert.equal(chosenSlot.nombre_completo, undefined);
    for (const s of publicSlots.horarios) {
        const day = new Date(s.fecha_hora).toLocaleDateString('en-US', { timeZone: 'America/Santiago', weekday: 'short' });
        const hour = new Date(s.fecha_hora).toLocaleTimeString('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' });
        assert.ok(!['Sat', 'Sun'].includes(day));
        assert.ok(hour >= '09:00' && hour <= '17:10');
        assert.equal(s.modalidad, 'Ambas');
        assert.equal(s.duracion_minutos, 50);
    }
    const booking = { nombre_completo: 'Reserva pública', email: 'reserva@example.test', telefono: '', horario_id: chosenSlot.id, modalidad: 'Online', consentimiento: true, solicitud_id: randomUUID() };
    await request('/api/reservas', 'POST', { ...booking, consentimiento: false }, 400);
    const confirmation = await request('/api/reservas', 'POST', booking, 201);
    assert.equal(confirmation.fecha_hora, chosenSlot.fecha_hora);
    assert.equal(confirmation.modalidad, 'Online');
    await request('/api/reservas', 'POST', booking);
    await request('/api/reservas', 'POST', { ...booking, solicitud_id: randomUUID() }, 409);
    assert.ok(!(await request('/api/reservas/disponibilidad')).horarios.some(s => s.id === chosenSlot.id));
    const raceSlot = publicSlots.horarios[1];
    const raced = await Promise.all([1, 2].map(i => fetch(base + '/api/reservas', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ ...booking, horario_id: raceSlot.id, email: `race-${i}@example.test`, solicitud_id: randomUUID() }) })));
    assert.deepEqual(raced.map(r => r.status).sort(), [201, 409]);
    cookie = cookieB;
    assert.equal((await request('/api/dashboard')).pacientes_activos, 0);
    assert.equal((await request('/api/disponibilidad')).horarios.length, 0);
    await request('/api/disponibilidad', 'DELETE', { id: chosenSlot.id }, 404);
    cookie = cookieA;
    const dashboard = await request('/api/dashboard');
    assert.equal(dashboard.pacientes_activos, 1);
    assert.equal(dashboard.leads_mes, 3);
    const fromWeb = (await request('/api/pacientes')).find(p => p.email === booking.email);
    const reservedSession = (await request(`/api/pacientes/${fromWeb.id}`)).sesiones[0];
    assert.equal(reservedSession.estado_sesion, 'Programada');
    await request('/api/sesiones', 'POST', { ...appointment, fecha_hora: chosenSlot.fecha_hora }, 409);
    await request('/api/disponibilidad', 'PUT', { ...availabilityRule, hora_inicio: '10:00', hora_fin: '13:00' });
    assert.equal((await request(`/api/pacientes/${fromWeb.id}`)).sesiones[0].fecha_hora, reservedSession.fecha_hora);
    const newSlots = (await request('/api/reservas/disponibilidad')).horarios;
    assert.ok(newSlots.every(s => { const hour = new Date(s.fecha_hora).toLocaleTimeString('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' }); return hour >= '10:00' && hour <= '12:10'; }));
    await request('/api/disponibilidad', 'DELETE', { id: newSlots[0].id });
    assert.ok(!(await request('/api/reservas/disponibilidad')).horarios.some(s => s.id === newSlots[0].id));
    await request('/api/disponibilidad', 'PUT', { ...availabilityRule, activa: false });
    assert.equal((await request('/api/reservas/disponibilidad')).horarios.length, 0);
    console.log('Landing y reservas verificadas: horario semanal, modalidades, idempotencia, concurrencia, métricas privadas y editor.');

    // Archiving is owner-scoped and preserves clinical records and sessions.
    cookie = cookieA;
    const beforeArchive = await request(route);
    assert.equal(beforeArchive.paciente.status, 'active');
    const activeList = await request('/api/pacientes');
    assert.ok(activeList.length > 0);
    assert.ok(activeList.every(p => Object.hasOwn(p, 'status') && p.status === 'active'));
    await request('/api/pacientes?status=unknown', 'GET', undefined, 400);
    await request(route, 'PATCH', { status: 'deleted' }, 400);
    await request(route, 'PATCH', {}, 400);
    cookie = '';
    await request(route, 'PATCH', { status: 'archived' }, 401);
    cookie = cookieB;
    await request(route, 'PATCH', { status: 'archived' }, 404);
    cookie = cookieA;
    const archiveCsrf = await fetch(base + route, { method: 'PATCH', headers: { Cookie: cookieA, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({status:'archived'}) });
    assert.equal(archiveCsrf.status, 403);
    await request(route, 'PATCH', { status: 'archived', usuario_id: accountB.usuario.id, notas_confidenciales: 'Must not change' });
    assert.ok(!(await request('/api/pacientes')).some(p => p.id === patient.id));
    const archivedList = await request('/api/pacientes?status=archived&q=MARIA&estado=Tratamiento%20activo');
    assert.equal(archivedList[0].id, patient.id);
    assert.ok(archivedList.every(p => Object.hasOwn(p, 'status') && p.status === 'archived'));
    const afterArchive = await request(route);
    assert.deepEqual(afterArchive, { ...beforeArchive, paciente: { ...beforeArchive.paciente, status: 'archived' } });
    cookie = cookieB;
    assert.equal((await request('/api/pacientes?status=archived')).length, 0);
    await request(route, 'PATCH', { status: 'active' }, 404);
    cookie = cookieA;
    await request(route, 'PATCH', { status: 'active' });
    await request(route, 'PATCH', { status: 'active' });
    assert.ok((await request('/api/pacientes?status=active')).some(p => p.id === patient.id));
    assert.ok(!(await request('/api/pacientes?status=archived')).some(p => p.id === patient.id));
    assert.deepEqual(await request(route), beforeArchive);
    // Simulate a legacy nullable column in the isolated test database only.
    await testDatabase.client.query('ALTER TABLE mymind.pacientes ALTER COLUMN status DROP NOT NULL');
    await db.prepare('UPDATE pacientes SET status = NULL WHERE id = ?').run(patient.id);
    const legacyActive = await request('/api/pacientes?status=active');
    assert.equal(legacyActive.find(p => p.id === patient.id)?.status, 'active');
    assert.equal((await request('/api/pacientes')).find(p => p.id === patient.id)?.status, 'active');
    assert.ok(!(await request('/api/pacientes?status=archived')).some(p => p.id === patient.id));
    cookie = cookieB;
    assert.ok(!(await request('/api/pacientes')).some(p => p.id === patient.id));
    cookie = cookieA;
    await request(route, 'PATCH', { status: 'archived' });
    assert.equal((await request('/api/pacientes?status=archived')).find(p => p.id === patient.id)?.status, 'archived');
    await request(route, 'PATCH', { status: 'active' });
    await testDatabase.client.query('ALTER TABLE mymind.pacientes ALTER COLUMN status SET NOT NULL');
    console.log('Status nulo verificado: respuesta active, filtros correctos y aislamiento de propietarios.');
    console.log('Archivo verificado: filtros, restauración, privacidad entre profesionales y conservación íntegra de ficha y sesiones.');
    console.log('API verificada: creación, edición, búsqueda, filtros, privacidad del listado, validación, historial y persistencia PostgreSQL.');
}
finally {
    if (server.exitCode === null) {
        const stopped = once(server, 'exit');
        server.kill();
        await stopped;
    }
    await testDatabase.close();
}
