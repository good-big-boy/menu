const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'recipe.db');

let db = null;

const initDatabase = async () => {
  const SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT 'fa-circle',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS flavors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT 'fa-circle',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT 'fa-circle',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      flavor TEXT NOT NULL,
      servings TEXT DEFAULT '2人份',
      cooking_method TEXT,
      description TEXT,
      image_path TEXT,
      video_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      ingredient_name TEXT NOT NULL,
      quantity TEXT,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS recipe_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      step_number INTEGER NOT NULL,
      description TEXT NOT NULL,
      image_path TEXT,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS daily_menus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      menu_date TEXT NOT NULL,
      meal_type TEXT NOT NULL,
      user_image_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, menu_date, meal_type),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_id INTEGER NOT NULL,
      recipe_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (menu_id) REFERENCES daily_menus(id) ON DELETE CASCADE,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  // 检查并添加营养字段（如果不存在）
  try {
    const columns = db.exec("PRAGMA table_info(recipes)");
    const existingColumns = columns[0].values.map(c => c[1]);
    if (!existingColumns.includes('calories')) {
      db.run(`ALTER TABLE recipes ADD COLUMN calories INTEGER DEFAULT 0`);
    }
    if (!existingColumns.includes('protein')) {
      db.run(`ALTER TABLE recipes ADD COLUMN protein REAL DEFAULT 0`);
    }
    if (!existingColumns.includes('fat')) {
      db.run(`ALTER TABLE recipes ADD COLUMN fat REAL DEFAULT 0`);
    }
    if (!existingColumns.includes('carbs')) {
      db.run(`ALTER TABLE recipes ADD COLUMN carbs REAL DEFAULT 0`);
    }
  } catch (e) {
    console.log('Note: Could not check/add recipe columns:', e.message);
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      recipe_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, recipe_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  saveDatabase();
  
  const categoryCount = db.exec('SELECT COUNT(*) as count FROM categories');
  if (categoryCount[0].values[0][0] === 0) {
    const defaults = [
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
      ['凉菜', 'fa-snowflake'],
    ];
    defaults.forEach(([name, icon]) => {
      db.run('INSERT OR IGNORE INTO categories (name, icon) VALUES (?, ?)', [name, icon]);
    });
  }

  const flavorCount = db.exec('SELECT COUNT(*) as count FROM flavors');
  if (flavorCount[0].values[0][0] === 0) {
    const defaults = [
      ['清淡', 'fa-leaf'],
      ['麻辣', 'fa-fire'],
      ['酸甜', 'fa-lemon'],
      ['咸鲜', 'fa-salt'],
      ['香辣', 'fa-pepper-hot'],
      ['糖醋', 'fa-candy-cane'],
      ['红烧', 'fa-fire-alt'],
      ['清蒸', 'fa-water'],
      ['烧烤', 'fa-fire-flame-curved'],
      ['油炸', 'fa-bowl-rice'],
    ];
    defaults.forEach(([name, icon]) => {
      db.run('INSERT OR IGNORE INTO flavors (name, icon) VALUES (?, ?)', [name, icon]);
    });
  }

  const ingredientCount = db.exec('SELECT COUNT(*) as count FROM ingredients');
  if (ingredientCount[0].values[0][0] === 0) {
    const defaults = [
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
      ['辣椒', 'fa-pepper-hot'],
    ];
    defaults.forEach(([name, icon]) => {
      db.run('INSERT OR IGNORE INTO ingredients (name, icon) VALUES (?, ?)', [name, icon]);
    });
  }

  saveDatabase();
  console.log('Database initialized successfully');
  return db;
};

const saveDatabase = () => {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, buffer);
  }
};

const getDb = () => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
};

module.exports = { initDatabase, getDb, saveDatabase };
