const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'pharmacy.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS medicines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  generic_name TEXT,
  category TEXT,
  unit TEXT DEFAULT 'tablets',
  reorder_level INTEGER DEFAULT 10,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  batch_no TEXT NOT NULL,
  mfg_date TEXT,
  expiry_date TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  cost_price REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dispense_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id),
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  quantity INTEGER NOT NULL,
  dispensed_at TEXT DEFAULT (datetime('now')),
  dispensed_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_batches_medicine ON batches(medicine_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(name);
`);

// Seed a couple of medicines/batches only if empty, so the app is usable on first run
const count = db.prepare('SELECT COUNT(*) c FROM medicines').get().c;
if (count === 0) {
  const insertMed = db.prepare(
    `INSERT INTO medicines (name, generic_name, category, unit, reorder_level) VALUES (?,?,?,?,?)`
  );
  const insertBatch = db.prepare(
    `INSERT INTO batches (medicine_id, batch_no, mfg_date, expiry_date, quantity, cost_price) VALUES (?,?,?,?,?,?)`
  );

  const paracetamol = insertMed.run('Paracetamol 500mg', 'Paracetamol', 'Analgesic', 'tablets', 20).lastInsertRowid;
  insertBatch.run(paracetamol, 'PCM-A1', '2024-01-01', '2026-10-15', 40, 0.5);
  insertBatch.run(paracetamol, 'PCM-A2', '2024-06-01', '2027-03-01', 100, 0.5);
  insertBatch.run(paracetamol, 'PCM-OLD', '2023-01-01', '2024-01-01', 15, 0.4); // expired, should not count

  const amox = insertMed.run('Amoxicillin 250mg', 'Amoxicillin', 'Antibiotic', 'capsules', 15).lastInsertRowid;
  insertBatch.run(amox, 'AMX-A1', '2025-01-01', '2026-11-01', 8, 1.2);
  insertBatch.run(amox, 'AMX-A2', '2025-05-01', '2026-12-20', 30, 1.2);

  const cough = insertMed.run('Cough Syrup 100ml', 'Dextromethorphan', 'Cough & Cold', 'bottles', 5).lastInsertRowid;
  insertBatch.run(cough, 'CS-A1', '2024-03-01', '2026-09-30', 3, 2.0);
}

module.exports = db;
