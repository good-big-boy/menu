const express = require('express');
const { query } = require('../database');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || !username.trim()) {
      return res.status(400).json({ success: false, message: '用户名不能为空' });
    }

    const trimmed = username.trim();
    const { rows } = await query('INSERT INTO users (username) VALUES ($1) RETURNING id', [trimmed]);
    res.json({ success: true, data: { id: rows[0].id, username: trimmed } });
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ success: false, message: '用户名已存在' });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || !username.trim()) {
      return res.status(400).json({ success: false, message: '用户名不能为空' });
    }

    const { rows } = await query('SELECT * FROM users WHERE username = $1', [username.trim()]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '用户不存在，请先注册' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM users ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
