const { Pool } = require('pg');

let pool = null;

const categoryDefaults = [
  ['家常菜', 'fa-home'],
  ['川菜', 'fa-pepper-hot'],
  ['粤菜', 'fa-fish'],
  ['湘菜', 'fa-fire'],
  ['鲁菜', 'fa-utensils'],
  ['苏菜', 'fa-leaf'],
  ['浙菜', 'fa-water'],
  ['闽菜', 'fa-shrimp'],
  ['徽菜', 'fa-mountain'],
  ['甜品', 'fa-cake-candles'],
  ['汤类', 'fa-bowl-food'],
  ['凉菜', 'fa-snowflake']
];

const flavorDefaults = [
  ['清淡', 'fa-leaf'],
  ['麻辣', 'fa-fire'],
  ['酸甜', 'fa-lemon'],
  ['咸鲜', 'fa-salt'],
  ['香辣', 'fa-pepper-hot'],
  ['糖醋', 'fa-candy-cane'],
  ['红烧', 'fa-fire-alt'],
  ['清蒸', 'fa-water'],
  ['烧烤', 'fa-fire-flame-curved'],
  ['油炸', 'fa-bowl-rice']
];

const ingredientDefaults = [
  ['猪肉', 'fa-cow'],
  ['牛肉', 'fa-cow'],
  ['鸡肉', 'fa-drumstick-bite'],
  ['鱼肉', 'fa-fish'],
  ['虾', 'fa-shrimp'],
  ['鸡蛋', 'fa-egg'],
  ['豆腐', 'fa-cube'],
  ['土豆', 'fa-potato'],
  ['番茄', 'fa-tomato'],
  ['胡萝卜', 'fa-carrot'],
  ['青椒', 'fa-pepper-hot'],
  ['洋葱', 'fa-onion'],
  ['大蒜', 'fa-garlic'],
  ['生姜', 'fa-leaf'],
  ['葱', 'fa-seedling'],
  ['盐', 'fa-salt'],
  ['酱油', 'fa-bottle'],
  ['醋', 'fa-bottle-water'],
  ['糖', 'fa-candy-cane'],
  ['辣椒', 'fa-pepper-hot']
];

const getPool = () => {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
};

const normalizeSqliteSyntax = (sql) => {
  return sql
    .replace(/date\('now',\s*'-7 days'\)/gi, "CURRENT_DATE - INTERVAL '7 days'")
    .replace(/\bSUBSTR\s*\(/gi, 'SUBSTRING(');
};

const convertQuestionMarkPlaceholders = (sql) => {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
};

const normalizeSql = (sql) => {
  const text = normalizeSqliteSyntax(sql);
  return text.includes('?') ? convertQuestionMarkPlaceholders(text) : text;
};

const query = async (text, params = []) => {
  return getPool().query(text, params);
};

const toExecResult = (result) => {
  if (!result?.fields?.length) {
    return [];
  }
  const columns = result.fields.map((f) => f.name);
  const values = result.rows.map((row) => columns.map((column) => row[column]));
  return [{ columns, values }];
};

const exec = async (sql, params = []) => {
  const normalized = normalizeSql(sql);
  const result = await query(normalized, params);
  return toExecResult(result);
};

const run = async (sql, params = []) => {
  const normalized = normalizeSql(sql);
  await query(normalized, params);
};

const initSchema = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS categories (
      id BIGSERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT 'fa-circle',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS flavors (
      id BIGSERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT 'fa-circle',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id BIGSERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT 'fa-circle',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS recipes (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      flavor TEXT NOT NULL,
      servings TEXT DEFAULT '2人份',
      cooking_method TEXT,
      description TEXT,
      image_path TEXT,
      video_path TEXT,
      calories INTEGER DEFAULT 0,
      protein DOUBLE PRECISION DEFAULT 0,
      fat DOUBLE PRECISION DEFAULT 0,
      carbs DOUBLE PRECISION DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id BIGSERIAL PRIMARY KEY,
      recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      ingredient_name TEXT NOT NULL,
      quantity TEXT
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS recipe_steps (
      id BIGSERIAL PRIMARY KEY,
      recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      step_number INTEGER NOT NULL,
      description TEXT NOT NULL,
      title TEXT,
      image_path TEXT
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS recipe_seasonings (
      id BIGSERIAL PRIMARY KEY,
      recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      name TEXT NOT NULL
    )
  `);

  await query('ALTER TABLE recipe_steps ADD COLUMN IF NOT EXISTS title TEXT');

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS daily_menus (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      menu_date TEXT NOT NULL,
      meal_type TEXT NOT NULL,
      user_image_path TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, menu_date, meal_type)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id BIGSERIAL PRIMARY KEY,
      menu_id BIGINT NOT NULL REFERENCES daily_menus(id) ON DELETE CASCADE,
      recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS favorites (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, recipe_id)
    )
  `);
};

const seedDefaults = async () => {
  for (const [name, icon] of categoryDefaults) {
    await query('INSERT INTO categories (name, icon) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [name, icon]);
  }
  for (const [name, icon] of flavorDefaults) {
    await query('INSERT INTO flavors (name, icon) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [name, icon]);
  }
  for (const [name, icon] of ingredientDefaults) {
    await query('INSERT INTO ingredients (name, icon) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [name, icon]);
  }
};

const buildConnectionString = () => {
  const explicit = process.env.SUPABASE_TRANSACTION_POOLER_URL || process.env.DATABASE_URL;
  if (explicit) {
    return explicit;
  }

  const host = process.env.PGHOST || process.env.SUPABASE_DB_HOST;
  const port = process.env.PGPORT || process.env.SUPABASE_DB_PORT || '6543';
  const database = process.env.PGDATABASE || process.env.SUPABASE_DB_NAME || 'postgres';
  const user = process.env.PGUSER || process.env.SUPABASE_DB_USER;
  const password = process.env.PGPASSWORD || process.env.SUPABASE_DB_PASSWORD;

  if (!host || !user || password === undefined) {
    return '';
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${database}`;
};

const initDatabase = async () => {
  const connectionString = buildConnectionString();
  if (!connectionString) {
    throw new Error('Missing DB config. Set SUPABASE_TRANSACTION_POOLER_URL (or DATABASE_URL), or provide SUPABASE_DB_HOST/SUPABASE_DB_USER/SUPABASE_DB_PASSWORD.');
  }

  pool = new Pool({
    connectionString,
    max: Number(process.env.PGPOOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000),
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
  });

  await query('SELECT 1');
  await initSchema();
  await seedDefaults();
  return pool;
};

const getDb = () => ({
  query,
  exec,
  run
});

const saveDatabase = async () => {};

module.exports = {
  initDatabase,
  getDb,
  query,
  saveDatabase
};
