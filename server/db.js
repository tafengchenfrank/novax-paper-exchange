import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

const sqliteSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS accounts (
    user_id INTEGER PRIMARY KEY,
    snapshot TEXT NOT NULL,
    equity REAL NOT NULL,
    roi REAL NOT NULL,
    trades_count INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL,
    followed_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, followed_id),
    CHECK (follower_id <> followed_id),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (followed_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trade_likes (
    user_id INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,
    trade_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, owner_id, trade_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trade_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    trade_id TEXT NOT NULL,
    author_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id INTEGER NOT NULL,
    actor_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    owner_id INTEGER,
    trade_id TEXT,
    body TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );
`;

const postgresSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS accounts (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    snapshot TEXT NOT NULL,
    equity DOUBLE PRECISION NOT NULL,
    roi DOUBLE PRECISION NOT NULL,
    trades_count INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followed_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, followed_id),
    CHECK (follower_id <> followed_id)
  );

  CREATE TABLE IF NOT EXISTS trade_likes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trade_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, owner_id, trade_id)
  );

  CREATE TABLE IF NOT EXISTS trade_comments (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trade_id TEXT NOT NULL,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    trade_id TEXT,
    body TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

const statementSql = {
  health: "SELECT 1 AS ok",
  createUser: `
    INSERT INTO users (name, email, password_hash, salt)
    VALUES (?, ?, ?, ?)
    RETURNING id, name, email, created_at
  `,
  getUserByEmail: "SELECT id, name, email, password_hash, salt, created_at FROM users WHERE email = ?",
  getUserById: "SELECT id, name, email, password_hash, salt, created_at FROM users WHERE id = ?",
  updateUserProfile: `
    UPDATE users
    SET name = ?, email = ?
    WHERE id = ?
    RETURNING id, name, email, created_at
  `,
  updateUserPassword: "UPDATE users SET password_hash = ?, salt = ? WHERE id = ?",
  createSession: `
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `,
  getSession: `
    SELECT users.id, users.name, users.email, users.created_at, sessions.expires_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
  `,
  deleteSession: "DELETE FROM sessions WHERE token_hash = ?",
  deleteExpiredSessions: "DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP",
  upsertAccount: `
    INSERT INTO accounts (user_id, snapshot, equity, roi, trades_count, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      snapshot = excluded.snapshot,
      equity = excluded.equity,
      roi = excluded.roi,
      trades_count = excluded.trades_count,
      updated_at = CURRENT_TIMESTAMP
  `,
  getAccount: "SELECT snapshot, equity, roi, trades_count, updated_at FROM accounts WHERE user_id = ?",
  getLeaderboard: `
    SELECT users.id, users.name, accounts.equity, accounts.roi, accounts.trades_count, accounts.updated_at
    FROM accounts
    JOIN users ON users.id = accounts.user_id
    ORDER BY accounts.roi DESC, accounts.equity DESC
    LIMIT 25
  `,
  followUser: {
    sqlite: `
      INSERT OR IGNORE INTO follows (follower_id, followed_id)
      VALUES (?, ?)
    `,
    postgres: `
      INSERT INTO follows (follower_id, followed_id)
      VALUES (?, ?)
      ON CONFLICT DO NOTHING
    `,
  },
  unfollowUser: "DELETE FROM follows WHERE follower_id = ? AND followed_id = ?",
  getFollowingIds: "SELECT followed_id FROM follows WHERE follower_id = ?",
  getFollow: "SELECT 1 AS ok FROM follows WHERE follower_id = ? AND followed_id = ?",
  getFollowersCount: "SELECT COUNT(*) AS count FROM follows WHERE followed_id = ?",
  getFollowingCount: "SELECT COUNT(*) AS count FROM follows WHERE follower_id = ?",
  getFollowingPreview: `
    SELECT
      users.id,
      users.name,
      accounts.equity,
      accounts.roi,
      accounts.trades_count,
      accounts.updated_at,
      follows.created_at AS followed_at
    FROM follows
    JOIN users ON users.id = follows.followed_id
    LEFT JOIN accounts ON accounts.user_id = users.id
    WHERE follows.follower_id = ?
    ORDER BY follows.created_at DESC
    LIMIT 10
  `,
  getFollowingFeedSources: `
    SELECT
      users.id,
      users.name,
      accounts.snapshot,
      accounts.equity,
      accounts.roi,
      accounts.trades_count,
      accounts.updated_at,
      follows.created_at AS followed_at
    FROM follows
    JOIN users ON users.id = follows.followed_id
    JOIN accounts ON accounts.user_id = users.id
    WHERE follows.follower_id = ?
    ORDER BY accounts.updated_at DESC
    LIMIT 50
  `,
  getPublicProfile: `
    SELECT
      users.id,
      users.name,
      users.created_at,
      accounts.snapshot,
      accounts.equity,
      accounts.roi,
      accounts.trades_count,
      accounts.updated_at
    FROM users
    LEFT JOIN accounts ON accounts.user_id = users.id
    WHERE users.id = ?
  `,
  likeTrade: {
    sqlite: `
      INSERT OR IGNORE INTO trade_likes (user_id, owner_id, trade_id)
      VALUES (?, ?, ?)
    `,
    postgres: `
      INSERT INTO trade_likes (user_id, owner_id, trade_id)
      VALUES (?, ?, ?)
      ON CONFLICT DO NOTHING
    `,
  },
  unlikeTrade: "DELETE FROM trade_likes WHERE user_id = ? AND owner_id = ? AND trade_id = ?",
  getTradeLike: "SELECT 1 AS ok FROM trade_likes WHERE user_id = ? AND owner_id = ? AND trade_id = ?",
  getTradeLikesCount: "SELECT COUNT(*) AS count FROM trade_likes WHERE owner_id = ? AND trade_id = ?",
  createTradeComment: `
    INSERT INTO trade_comments (owner_id, trade_id, author_id, body)
    VALUES (?, ?, ?, ?)
    RETURNING id, body, created_at
  `,
  getTradeComments: `
    SELECT
      trade_comments.id,
      trade_comments.body,
      trade_comments.created_at,
      users.id AS author_id,
      users.name AS author_name
    FROM trade_comments
    JOIN users ON users.id = trade_comments.author_id
    WHERE trade_comments.owner_id = ? AND trade_comments.trade_id = ?
    ORDER BY trade_comments.created_at ASC, trade_comments.id ASC
    LIMIT 20
  `,
  createNotification: `
    INSERT INTO notifications (recipient_id, actor_id, type, owner_id, trade_id, body)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  getNotifications: `
    SELECT
      notifications.id,
      notifications.type,
      notifications.owner_id,
      notifications.trade_id,
      notifications.body,
      notifications.read_at,
      notifications.created_at,
      users.id AS actor_id,
      users.name AS actor_name
    FROM notifications
    JOIN users ON users.id = notifications.actor_id
    WHERE notifications.recipient_id = ?
    ORDER BY notifications.created_at DESC, notifications.id DESC
    LIMIT 20
  `,
  markNotificationsRead: `
    UPDATE notifications
    SET read_at = CURRENT_TIMESTAMP
    WHERE recipient_id = ? AND read_at IS NULL
  `,
};

export const database = await createDatabase();
export const db = database.raw;
export const statements = database.statements;

export async function checkDatabase() {
  const row = await statements.health.get();
  if (!row?.ok) throw new Error("Database health query failed.");
  return database.location;
}

export async function closeDatabase() {
  if (database.storage === "postgres") {
    await database.raw.end();
    return;
  }
  database.raw.close();
}

async function createDatabase() {
  if (config.storage === "postgres") {
    return createPostgresDatabase();
  }
  return createSqliteDatabase();
}

function createSqliteDatabase() {
  mkdirSync(dirname(config.databasePath), { recursive: true });
  const raw = new DatabaseSync(config.databasePath);
  raw.exec("PRAGMA foreign_keys = ON");
  raw.exec("PRAGMA journal_mode = WAL");
  raw.exec(sqliteSchema);

  return {
    raw,
    storage: "sqlite",
    location: config.databasePath,
    statements: prepareStatements((sql) => prepareSqliteStatement(raw, sql)),
  };
}

async function createPostgresDatabase() {
  const { Pool } = await importPostgres();
  const raw = new Pool({
    connectionString: config.databaseUrl,
    ssl: shouldUsePostgresSsl() ? { rejectUnauthorized: false } : undefined,
  });

  await raw.query(postgresSchema);

  return {
    raw,
    storage: "postgres",
    location: config.databaseDisplay,
    statements: prepareStatements((sql) => preparePostgresStatement(raw, sql)),
  };
}

function prepareStatements(prepare) {
  return Object.fromEntries(
    Object.entries(statementSql).map(([name, value]) => {
      const sql = typeof value === "string" ? value : value[config.storage];
      return [name, prepare(sql)];
    }),
  );
}

function prepareSqliteStatement(raw, sql) {
  const statement = raw.prepare(sql);
  return {
    async get(...params) {
      return normalizeRow(statement.get(...params)) || null;
    },
    async all(...params) {
      return statement.all(...params).map(normalizeRow);
    },
    async run(...params) {
      return statement.run(...params);
    },
  };
}

function preparePostgresStatement(raw, sql) {
  const text = toPostgresPlaceholders(sql);
  return {
    async get(...params) {
      const result = await raw.query(text, params);
      return normalizeRow(result.rows[0]) || null;
    },
    async all(...params) {
      const result = await raw.query(text, params);
      return result.rows.map(normalizeRow);
    },
    async run(...params) {
      const result = await raw.query(text, params);
      return { changes: result.rowCount || 0 };
    },
  };
}

async function importPostgres() {
  try {
    return await import("pg");
  } catch (error) {
    throw new Error(`PostgreSQL mode requires the "pg" package. Run npm install first. ${error.message}`);
  }
}

function shouldUsePostgresSsl() {
  return config.isProduction || /sslmode=require|\.neon\.tech/i.test(config.databaseUrl);
}

function toPostgresPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function normalizeRow(row) {
  if (!row) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeValue(value)]));
}

function normalizeValue(value) {
  if (value instanceof Date) return value.toISOString();
  return value;
}
