const express = require('express');
const router = express.Router();
const { getDb, saveDatabase } = require('../database');

router.post('/register', (req, res) => {
  try {
    const { username } = req.body;
    if (!username || !username.trim()) {
      return res.status(400).json({ success: false, message: '用户名不能为空' });
    }
    const db = getDb();
    db.run('INSERT INTO users (username) VALUES (?)', [username.trim()]);
    saveDatabase();
    
    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result[0].values[0][0];
    res.json({ success: true, data: { id, username: username.trim() } });
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE')) {
      res.status(400).json({ success: false, message: '用户名已存在' });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
});

router.post('/login', (req, res) => {
  try {
    const { username } = req.body;
    if (!username || !username.trim()) {
      return res.status(400).json({ success: false, message: '用户名不能为空' });
    }
    const db = getDb();
    const results = db.exec('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (results.length === 0 || results[0].values.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在，请先注册' });
    }
    const user = {
      id: results[0].values[0][0],
      username: results[0].values[0][1],
      created_at: results[0].values[0][2]
    };
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const results = db.exec('SELECT * FROM users ORDER BY created_at DESC');
    const users = results.length > 0 ? results[0].values.map(row => ({
      id: row[0],
      username: row[1],
      created_at: row[2]
    })) : [];
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
