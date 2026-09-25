import { migrateSaas } from '../database/migrate-saas.mjs';
import { migrateCalendar } from '../database/migrate-calendar.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';

const directory = new URL('../data/', import.meta.url);
mkdirSync(directory, { recursive: true });
const database = new DatabaseSync(new URL('mymind.sqlite', directory));
try {
  database.exec(readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8'));
  migrateCalendar(database);
  migrateSaas(database);
  console.log('Base SQLite inicializada en data/mymind.sqlite');
} finally {
  database.close();
}


