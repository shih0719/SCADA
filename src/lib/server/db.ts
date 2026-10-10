import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { applyPendingRestoreIfAny } from './pending-restore';

export const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'scada.db');

// If a backup restore was staged by src/lib/server/backup.ts in a previous
// process lifetime, swap the staged db file into place now, before we open
// our single long-lived connection below. See backup.ts for the full design
// rationale (no hot-swapping of an open connection).
applyPendingRestoreIfAny(DATA_DIR, DB_PATH);

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS spaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  floorplan_image_path TEXT,
  floorplan_width INTEGER,
  floorplan_height INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  port INTEGER NOT NULL,
  slave_id INTEGER NOT NULL DEFAULT 1,
  poll_interval_ms INTEGER NOT NULL DEFAULT 1500,
  timeout_ms INTEGER NOT NULL DEFAULT 1000,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS circuits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER NOT NULL REFERENCES spaces(id),
  device_id INTEGER NOT NULL REFERENCES devices(id),
  coil_address INTEGER NOT NULL,
  name TEXT NOT NULL,
  pos_x REAL,
  pos_y REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_circuits_space ON circuits(space_id);
CREATE INDEX IF NOT EXISTS idx_circuits_device ON circuits(device_id);

CREATE TABLE IF NOT EXISTS scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS scene_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  circuit_id INTEGER NOT NULL REFERENCES circuits(id) ON DELETE CASCADE,
  value INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scene_actions_scene ON scene_actions(scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_actions_circuit ON scene_actions(circuit_id);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  scene_id INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  time_of_day TEXT NOT NULL,
  days_of_week TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  last_triggered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_schedules_scene ON schedules(scene_id);
`);
