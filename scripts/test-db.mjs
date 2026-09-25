import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const schema = readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8');

test('El esquema conserva relaciones, estados y valores por defecto', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(schema);
    db.exec(schema);
    db.prepare('INSERT INTO pacientes (nombre_completo) VALUES (?)').run('Paciente de prueba');
    const patient = db.prepare('SELECT * FROM pacientes').get();
    assert.equal(patient.estado, 'Nuevo contacto');
    assert.ok(patient.id);
    assert.ok(Number.isFinite(Date.parse(patient.fecha_registro)));
    assert.throws(() => db.prepare('INSERT INTO pacientes (nombre_completo, estado) VALUES (?, ?)').run('Prueba', 'Otro'));
    assert.throws(() => db.prepare('INSERT INTO pacientes (nombre_completo) VALUES (?)').run('  '));
    assert.throws(() => db.prepare('INSERT INTO sesiones (paciente_id, fecha_hora) VALUES (?, ?)').run('inexistente', '2026-10-01T15:00:00.000Z'));
    assert.throws(() => db.prepare('INSERT INTO sesiones (paciente_id, fecha_hora) VALUES (?, ?)').run(patient.id, 'fecha inválida'));
    const insert = db.prepare('INSERT INTO sesiones (paciente_id, fecha_hora, estado_sesion) VALUES (?, ?, ?)');
    for (const state of ['Programada', 'Realizada', 'Cancelada']) insert.run(patient.id, '2026-10-01T15:00:00.000Z', state);
    assert.throws(() => insert.run(patient.id, '2026-10-01T15:00:00.000Z', 'Otro'));
    assert.throws(() => db.prepare('DELETE FROM pacientes WHERE id = ?').run(patient.id));
    assert.equal(db.prepare('SELECT count(*) AS total FROM sesiones').get().total, 3);
  } finally { db.close(); }
});

test('La migración conserva sesiones existentes y puede repetirse', async () => {
  const { migrateCalendar } = await import('../database/migrate-calendar.mjs');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE sesiones (id TEXT PRIMARY KEY, notas_evolucion TEXT); INSERT INTO sesiones VALUES ('previa', 'Nota conservada');");
    migrateCalendar(db);
    migrateCalendar(db);
    const row = db.prepare('SELECT * FROM sesiones').get();
    assert.equal(row.notas_evolucion, 'Nota conservada');
    assert.equal(row.duracion_minutos, 50);
    assert.equal(row.modalidad, 'Presencial');
    assert.throws(() => db.prepare('UPDATE sesiones SET duracion_minutos = ?').run(0));
    assert.throws(() => db.prepare('UPDATE sesiones SET modalidad = ?').run('Otra'));
  } finally { db.close(); }
});

test('La migración SaaS no entrega registros previos a nuevas cuentas', async () => {
  const { migrateSaas } = await import('../database/migrate-saas.mjs');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(schema);
    db.prepare('INSERT INTO pacientes (id, nombre_completo) VALUES (?, ?)').run('legacy', 'Registro anterior');
    db.prepare('INSERT INTO sesiones (paciente_id, fecha_hora, notas_evolucion) VALUES (?, ?, ?)').run('legacy', '2026-09-24T12:00:00Z', 'Nota anterior');
    migrateSaas(db); migrateSaas(db);
    assert.equal(db.prepare('SELECT usuario_id FROM pacientes').get().usuario_id, null);
    db.prepare('INSERT INTO usuarios (id, email, password_hash, nombre) VALUES (?, ?, ?, ?)').run('a', 'a@example.test', 'pending', 'A');
    db.prepare('INSERT INTO usuarios (id, email, password_hash, nombre) VALUES (?, ?, ?, ?)').run('b', 'b@example.test', 'pending', 'B');
    assert.throws(() => db.prepare('INSERT INTO pacientes (nombre_completo) VALUES (?)').run('Sin propietario'));
    db.prepare('UPDATE pacientes SET usuario_id = ? WHERE id = ?').run('a', 'legacy');
    assert.throws(() => db.prepare('UPDATE pacientes SET usuario_id = ? WHERE id = ?').run('b', 'legacy'));
    assert.equal(db.prepare('SELECT notas_evolucion FROM sesiones').get().notas_evolucion, 'Nota anterior');
    assert.equal(db.prepare('SELECT count(*) AS total FROM pacientes WHERE usuario_id = ?').get('b').total, 0);
  } finally { db.close(); }
});
