const express = require('express');
const router = express.Router();
const { getDb, saveDatabase } = require('../database');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const results = db.exec('SELECT * FROM categories ORDER BY created_at');
    const categories = results.length > 0 ? results[0].values.map(row => {
      const cols = results[0].columns;
      const obj = {};
      row.forEach((val, idx) => obj[cols[idx]] = val);
      return obj;
    }) : [];
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: '分类名称不能为空' });
    }
    const db = getDb();
    db.run('INSERT INTO categories (name, icon) VALUES (?, ?)', [name, icon || 'fa-circle']);
    saveDatabase();
    
    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result[0].values[0][0];
    res.json({ success: true, data: { id, name, icon: icon || 'fa-circle' } });
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE')) {
      res.status(400).json({ success: false, message: '分类已存在' });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
});

router.put('/:id', (req, res) => {
  try {
    const { name, icon } = req.body;
    const { id } = req.params;
    const db = getDb();
    db.run('UPDATE categories SET name = ?, icon = ? WHERE id = ?', [name, icon, id]);
    saveDatabase();
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    db.run('DELETE FROM categories WHERE id = ?', [id]);
    saveDatabase();
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
