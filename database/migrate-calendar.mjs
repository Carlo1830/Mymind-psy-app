// Compatible with both the server and the database initialization CLI.
export function migrateCalendar(database) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const columns = database.prepare('PRAGMA table_info(sesiones)').all().map(column => column.name);
    if (!columns.includes('duracion_minutos')) database.exec('ALTER TABLE sesiones ADD COLUMN duracion_minutos INTEGER NOT NULL DEFAULT 50 CHECK (duracion_minutos BETWEEN 5 AND 480)');
    if (!columns.includes('modalidad')) database.exec("ALTER TABLE sesiones ADD COLUMN modalidad TEXT NOT NULL DEFAULT 'Presencial' CHECK (modalidad IN ('Presencial', 'Online'))");
    database.exec('COMMIT');
  } catch (error) { database.exec('ROLLBACK'); throw error; }
}
