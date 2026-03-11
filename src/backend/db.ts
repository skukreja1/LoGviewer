import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';

const db = new Database('app.db');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  );

  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    userId INTEGER,
    name TEXT,
    host TEXT,
    port INTEGER,
    username TEXT,
    authMethod TEXT,
    password TEXT,
    privateKey TEXT,
    passphrase TEXT,
    FOREIGN KEY(userId) REFERENCES users(id)
  );
`);

// Seed admin user if not exists
const seedAdmin = () => {
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'admin123';
  
  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(adminUser);
  if (!existing) {
    const hashed = bcrypt.hashSync(adminPass, 10);
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(adminUser, hashed);
    console.log(`Admin user created: ${adminUser}`);
  }
};

seedAdmin();

export default db;
