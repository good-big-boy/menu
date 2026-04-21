const express = require('express');
const { query } = require('../database');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM flavors ORDER BY created_at');
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: '口味名称不能为空' });
    }

    const { rows } = await query(
      'INSERT INTO flavors (name, icon) VALUES ($1, $2) RETURNING id',
      [name, icon || 'fa-circle']
    );
    res.json({ success: true, data: { id: rows[0].id, name, icon: icon || 'fa-circle' } });
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ success: false, message: '口味已存在' });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, icon } = req.body;
    const { id } = req.params;
    await query('UPDATE flavors SET name = $1, icon = $2 WHERE id = $3', [name, icon, id]);
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ success: false, message: '口味已存在' });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM flavors WHERE id = $1', [id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
