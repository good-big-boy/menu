const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// 获取用户收藏列表
router.get('/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const db = getDb();

    const recipes = db.exec(`
      SELECT r.*
      FROM recipes r
      INNER JOIN favorites f ON r.id = f.recipe_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `, [userId]);

    const favoritesList = [];
    if (recipes.length > 0) {
      const columns = recipes[0].columns;
      recipes[0].values.forEach(row => {
        const recipe = {};
        columns.forEach((col, idx) => {
          recipe[col] = row[idx];
        });

        const ingredientsResult = db.exec('SELECT ri.ingredient_name as name, ri.quantity, i.icon FROM recipe_ingredients ri LEFT JOIN ingredients i ON ri.ingredient_name = i.name WHERE recipe_id = ? ORDER BY ri.id', [recipe.id]);
        const ingredients = ingredientsResult.length > 0
          ? ingredientsResult[0].values.map(ing => ({ name: ing[0], quantity: ing[1], icon: ing[2] }))
          : [];

        const stepsResult = db.exec('SELECT step_number, description, image_path FROM recipe_steps WHERE recipe_id = ? ORDER BY step_number ASC', [recipe.id]);
        const steps = stepsResult.length > 0
          ? stepsResult[0].values.map(s => ({
              stepNumber: s[0],
              description: s[1],
              image: s[2] ? `/uploads/${s[2]}` : null
            }))
          : [];

        favoritesList.push({
          id: recipe.id,
          name: recipe.name,
          category: recipe.category,
          flavor: recipe.flavor,
          servings: recipe.servings,
          cookingMethod: recipe.cooking_method,
          description: recipe.description,
          image: recipe.image_path ? `/uploads/${recipe.image_path}` : null,
          video: recipe.video_path ? `/uploads/${recipe.video_path}` : null,
          ingredients,
          steps,
          calories: recipe.calories || 0,
          protein: recipe.protein || 0,
          fat: recipe.fat || 0,
          carbs: recipe.carbs || 0
        });
      });
    }

    res.json({ success: true, data: favoritesList });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 添加收藏
router.post('/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const { recipeId } = req.body;
    const db = getDb();

    const existing = db.exec('SELECT id FROM favorites WHERE user_id = ? AND recipe_id = ?', [userId, recipeId]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return res.json({ success: true, message: '已在收藏列表中', alreadyFavorited: true });
    }

    db.run('INSERT INTO favorites (user_id, recipe_id) VALUES (?, ?)', [userId, recipeId]);
    res.json({ success: true, message: '收藏成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 取消收藏
router.delete('/:userId/:recipeId', (req, res) => {
  try {
    const { userId, recipeId } = req.params;
    const db = getDb();

    db.run('DELETE FROM favorites WHERE user_id = ? AND recipe_id = ?', [userId, recipeId]);
    res.json({ success: true, message: '取消收藏成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 检查是否已收藏
router.get('/:userId/check/:recipeId', (req, res) => {
  try {
    const { userId, recipeId } = req.params;
    const db = getDb();

    const result = db.exec('SELECT id FROM favorites WHERE user_id = ? AND recipe_id = ?', [userId, recipeId]);
    const isFavorited = result.length > 0 && result[0].values.length > 0;
    res.json({ success: true, data: { isFavorited } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
