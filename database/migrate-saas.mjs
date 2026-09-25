import path from 'node:path';
import { readFileSync } from 'node:fs';
export function migrateSaas(database) {
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(readFileSync(path.join(process.cwd(), 'database', 'saas.sql'), 'utf8'));
    const columns = database.prepare('PRAGMA table_info(pacientes)').all().map(c => c.name);
    if (!columns.includes('usuario_id')) database.exec('ALTER TABLE pacientes ADD COLUMN usuario_id TEXT REFERENCES usuarios(id)');
    if (!columns.includes('fuente_captacion')) database.exec("ALTER TABLE pacientes ADD COLUMN fuente_captacion TEXT NOT NULL DEFAULT 'Registro manual'");
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_paciente_owner ON pacientes(usuario_id, estado);
      CREATE INDEX IF NOT EXISTS idx_paciente_owner_email ON pacientes(usuario_id, email);
      CREATE TRIGGER IF NOT EXISTS paciente_owner_required BEFORE INSERT ON pacientes
      WHEN NEW.usuario_id IS NULL BEGIN SELECT RAISE(ABORT, 'Se requiere propietario'); END;
      CREATE TRIGGER IF NOT EXISTS paciente_owner_immutable BEFORE UPDATE OF usuario_id ON pacientes
      WHEN OLD.usuario_id IS NOT NULL AND NEW.usuario_id IS NOT OLD.usuario_id
      BEGIN SELECT RAISE(ABORT, 'No se permite cambiar propietario'); END;
    `);
    database.exec('COMMIT');
  } catch (error) { database.exec('ROLLBACK'); throw error; }
}

