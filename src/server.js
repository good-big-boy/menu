const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./database');
const { UPLOAD_BASE_DIR } = require('./middleware/upload');

const categoriesRouter = require('./routes/categories');
const flavorsRouter = require('./routes/flavors');
const ingredientsRouter = require('./routes/ingredients');
const recipesRouter = require('./routes/recipes');
const usersRouter = require('./routes/users');
const menusRouter = require('./routes/menus');
const favoritesRouter = require('./routes/favorites');

const app = express();
const PORT = process.env.PORT || 3001;

const corsOptions = {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : true,
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(UPLOAD_BASE_DIR));

app.use('/api/categories', categoriesRouter);
app.use('/api/flavors', flavorsRouter);
app.use('/api/ingredients', ingredientsRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/users', usersRouter);
app.use('/api/menus', menusRouter);
app.use('/api/favorites', favoritesRouter);

app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: '菜谱管理 API 服务运行正常',
    timestamp: new Date().toISOString()
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '服务器内部错误'
  });
});

const startServer = async () => {
  try {
    await initDatabase();
    
    app.listen(PORT, () => {
      console.log(`菜谱管理 API 服务已启动: http://localhost:${PORT}`);
      console.log(`前端页面: http://localhost:3000`);
      console.log(`API 接口: http://localhost:${PORT}/api`);
      console.log(`文件存储目录: ${UPLOAD_BASE_DIR}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
