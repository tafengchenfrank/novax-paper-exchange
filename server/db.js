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
    role TEXT NOT NULL DEFAULT 'user',
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

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    used_at TEXT,
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

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    category TEXT NOT NULL,
    body TEXT NOT NULL,
    contact TEXT,
    page_path TEXT,
    user_agent TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS hidden_public_trades (
    owner_id INTEGER NOT NULL,
    trade_id TEXT NOT NULL,
    reason TEXT,
    hidden_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (owner_id, trade_id),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS hidden_trade_comments (
    comment_id INTEGER PRIMARY KEY,
    reason TEXT,
    hidden_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (comment_id) REFERENCES trade_comments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS content_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    owner_id INTEGER,
    trade_id TEXT,
    comment_id INTEGER,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (comment_id) REFERENCES trade_comments(id) ON DELETE CASCADE
  );
`;

const postgresSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
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

  CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    body TEXT NOT NULL,
    contact TEXT,
    page_path TEXT,
    user_agent TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS hidden_public_trades (
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trade_id TEXT NOT NULL,
    reason TEXT,
    hidden_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (owner_id, trade_id)
  );

  CREATE TABLE IF NOT EXISTS hidden_trade_comments (
    comment_id INTEGER PRIMARY KEY REFERENCES trade_comments(id) ON DELETE CASCADE,
    reason TEXT,
    hidden_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS content_reports (
    id SERIAL PRIMARY KEY,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    trade_id TEXT,
    comment_id INTEGER REFERENCES trade_comments(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

const statementSql = {
  health: "SELECT 1 AS ok",
  createUser: `
    INSERT INTO users (name, email, password_hash, salt)
    VALUES (?, ?, ?, ?)
    RETURNING id, name, email, role, created_at
  `,
  getUserByEmail: "SELECT id, name, email, role, password_hash, salt, created_at FROM users WHERE email = ?",
  getUserById: "SELECT id, name, email, role, password_hash, salt, created_at FROM users WHERE id = ?",
  updateUserProfile: `
    UPDATE users
    SET name = ?, email = ?
    WHERE id = ?
    RETURNING id, name, email, role, created_at
  `,
  updateUserRole: `
    UPDATE users
    SET role = ?
    WHERE id = ?
    RETURNING id, name, email, role, created_at
  `,
  updateUserPassword: "UPDATE users SET password_hash = ?, salt = ? WHERE id = ?",
  createSession: `
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `,
  getSession: `
    SELECT users.id, users.name, users.email, users.role, users.created_at, sessions.expires_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
  `,
  deleteSession: "DELETE FROM sessions WHERE token_hash = ?",
  deleteUserSessions: "DELETE FROM sessions WHERE user_id = ?",
  deleteExpiredSessions: "DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP",
  createPasswordReset: `
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `,
  getPasswordReset: `
    SELECT
      password_reset_tokens.id AS reset_id,
      password_reset_tokens.user_id,
      password_reset_tokens.expires_at,
      password_reset_tokens.used_at,
      users.id,
      users.name,
      users.email,
      users.role,
      users.created_at
    FROM password_reset_tokens
    JOIN users ON users.id = password_reset_tokens.user_id
    WHERE password_reset_tokens.token_hash = ?
  `,
  markPasswordResetUsed: `
    UPDATE password_reset_tokens
    SET used_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
  markUserPasswordResetsUsed: `
    UPDATE password_reset_tokens
    SET used_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND used_at IS NULL
  `,
  deleteStalePasswordResets: `
    DELETE FROM password_reset_tokens
    WHERE used_at IS NOT NULL OR expires_at <= ?
  `,
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
    LEFT JOIN hidden_trade_comments ON hidden_trade_comments.comment_id = trade_comments.id
    WHERE trade_comments.owner_id = ? AND trade_comments.trade_id = ?
      AND hidden_trade_comments.comment_id IS NULL
    ORDER BY trade_comments.created_at ASC, trade_comments.id ASC
    LIMIT 20
  `,
  getTradeCommentById: `
    SELECT
      trade_comments.id,
      trade_comments.owner_id,
      trade_comments.trade_id,
      trade_comments.author_id,
      trade_comments.body,
      trade_comments.created_at,
      users.name AS author_name,
      hidden_trade_comments.comment_id AS hidden_comment_id
    FROM trade_comments
    JOIN users ON users.id = trade_comments.author_id
    LEFT JOIN hidden_trade_comments ON hidden_trade_comments.comment_id = trade_comments.id
    WHERE trade_comments.id = ?
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
  createFeedback: `
    INSERT INTO feedback (user_id, category, body, contact, page_path, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING id, category, body, contact, page_path, status, created_at
  `,
  getFeedback: `
    SELECT
      feedback.id,
      feedback.category,
      feedback.body,
      feedback.contact,
      feedback.page_path,
      feedback.user_agent,
      feedback.status,
      feedback.created_at,
      users.id AS user_id,
      users.name AS user_name,
      users.email AS user_email
    FROM feedback
    LEFT JOIN users ON users.id = feedback.user_id
    ORDER BY feedback.created_at DESC, feedback.id DESC
    LIMIT 50
  `,
  getAdminSummary: `
    SELECT
      (SELECT COUNT(*) FROM users) AS users_count,
      (SELECT COUNT(*) FROM users WHERE role = 'admin') AS admin_users_count,
      (SELECT COUNT(*) FROM accounts) AS synced_accounts_count,
      (SELECT COUNT(*) FROM feedback) AS feedback_count,
      (SELECT COUNT(*) FROM feedback WHERE status = 'new') AS new_feedback_count
  `,
  getAdminUsers: `
    SELECT
      users.id,
      users.name,
      users.email,
      users.role,
      users.created_at,
      accounts.equity,
      accounts.roi,
      accounts.trades_count,
      accounts.updated_at AS account_updated_at,
      (SELECT COUNT(*) FROM follows WHERE follows.followed_id = users.id) AS followers_count,
      (SELECT COUNT(*) FROM follows WHERE follows.follower_id = users.id) AS following_count,
      (SELECT COUNT(*) FROM feedback WHERE feedback.user_id = users.id) AS feedback_count,
      (SELECT COUNT(*) FROM content_reports WHERE content_reports.reporter_id = users.id) AS reports_made_count
    FROM users
    LEFT JOIN accounts ON accounts.user_id = users.id
    ORDER BY users.created_at DESC, users.id DESC
    LIMIT 100
  `,
  getHiddenTradeKeys: "SELECT owner_id, trade_id FROM hidden_public_trades",
  getHiddenComment: "SELECT comment_id FROM hidden_trade_comments WHERE comment_id = ?",
  hideTrade: `
    INSERT INTO hidden_public_trades (owner_id, trade_id, reason, hidden_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(owner_id, trade_id) DO UPDATE SET
      reason = excluded.reason,
      hidden_at = CURRENT_TIMESTAMP
  `,
  unhideTrade: "DELETE FROM hidden_public_trades WHERE owner_id = ? AND trade_id = ?",
  hideComment: `
    INSERT INTO hidden_trade_comments (comment_id, reason, hidden_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(comment_id) DO UPDATE SET
      reason = excluded.reason,
      hidden_at = CURRENT_TIMESTAMP
  `,
  unhideComment: "DELETE FROM hidden_trade_comments WHERE comment_id = ?",
  createContentReport: `
    INSERT INTO content_reports (reporter_id, target_type, owner_id, trade_id, comment_id, reason, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING id, target_type, owner_id, trade_id, comment_id, reason, details, status, created_at
  `,
  getContentReports: `
    SELECT
      content_reports.id,
      content_reports.target_type,
      content_reports.owner_id,
      content_reports.trade_id,
      content_reports.comment_id,
      content_reports.reason,
      content_reports.details,
      content_reports.status,
      content_reports.created_at,
      reporter.id AS reporter_id,
      reporter.name AS reporter_name,
      owner.name AS owner_name,
      trade_comments.body AS comment_body,
      author.name AS comment_author_name
    FROM content_reports
    JOIN users reporter ON reporter.id = content_reports.reporter_id
    LEFT JOIN users owner ON owner.id = content_reports.owner_id
    LEFT JOIN trade_comments ON trade_comments.id = content_reports.comment_id
    LEFT JOIN users author ON author.id = trade_comments.author_id
    ORDER BY content_reports.created_at DESC, content_reports.id DESC
    LIMIT 50
  `,
  getHiddenTrades: `
    SELECT
      hidden_public_trades.owner_id,
      hidden_public_trades.trade_id,
      hidden_public_trades.reason,
      hidden_public_trades.hidden_at,
      users.name AS owner_name
    FROM hidden_public_trades
    JOIN users ON users.id = hidden_public_trades.owner_id
    ORDER BY hidden_public_trades.hidden_at DESC
    LIMIT 50
  `,
  getHiddenComments: `
    SELECT
      hidden_trade_comments.comment_id,
      hidden_trade_comments.reason,
      hidden_trade_comments.hidden_at,
      trade_comments.owner_id,
      trade_comments.trade_id,
      trade_comments.body,
      author.name AS author_name,
      owner.name AS owner_name
    FROM hidden_trade_comments
    JOIN trade_comments ON trade_comments.id = hidden_trade_comments.comment_id
    JOIN users author ON author.id = trade_comments.author_id
    JOIN users owner ON owner.id = trade_comments.owner_id
    ORDER BY hidden_trade_comments.hidden_at DESC
    LIMIT 50
  `,
  getModerationSummary: `
    SELECT
      (SELECT COUNT(*) FROM content_reports) AS reports_count,
      (SELECT COUNT(*) FROM content_reports WHERE status = 'open') AS open_reports_count,
      (SELECT COUNT(*) FROM hidden_public_trades) AS hidden_trades_count,
      (SELECT COUNT(*) FROM hidden_trade_comments) AS hidden_comments_count
  `,
  markTradeReportsActioned: `
    UPDATE content_reports
    SET status = 'actioned'
    WHERE target_type = 'trade' AND owner_id = ? AND trade_id = ? AND status = 'open'
  `,
  markCommentReportsActioned: `
    UPDATE content_reports
    SET status = 'actioned'
    WHERE target_type = 'comment' AND comment_id = ? AND status = 'open'
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
  migrateSqliteDatabase(raw);

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
  await migratePostgresDatabase(raw);

  return {
    raw,
    storage: "postgres",
    location: config.databaseDisplay,
    statements: prepareStatements((sql) => preparePostgresStatement(raw, sql)),
  };
}

function migrateSqliteDatabase(raw) {
  const userColumns = raw.prepare("PRAGMA table_info(users)").all();
  if (!userColumns.some((column) => column.name === "role")) {
    raw.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  }
}

async function migratePostgresDatabase(raw) {
  await raw.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'");
  await raw.query("UPDATE users SET role = 'user' WHERE role IS NULL OR role NOT IN ('user', 'admin')");
  await raw.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_role_check'
          AND conrelid = 'users'::regclass
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));
      END IF;
    END $$;
  `);
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
