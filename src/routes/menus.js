const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb, saveDatabase } = require('../database');
const { UPLOAD_BASE_DIR } = require('../middleware/upload');

const ensureDirExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const menuStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const destDir = path.join(UPLOAD_BASE_DIR, 'menus');
    ensureDirExists(destDir);
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'menu-' + uniqueSuffix + ext);
  }
});

const menuUpload = multer({ storage: menuStorage, limits: { fileSize: 10 * 1024 * 1024 } });

router.put('/:userId/menus', menuUpload.single('user_image'), (req, res) => {
  try {
    const { userId } = req.params;
    const { menu_date, meal_type, recipe_ids } = req.body;

    if (!menu_date || !meal_type) {
      return res.status(400).json({ success: false, message: '日期和餐类型不能为空' });
    }

    const db = getDb();
    const parsedRecipeIds = recipe_ids ? (typeof recipe_ids === 'string' ? JSON.parse(recipe_ids) : recipe_ids) : [];

    const existing = db.exec('SELECT id FROM daily_menus WHERE user_id = ? AND menu_date = ? AND meal_type = ?', [userId, menu_date, meal_type]);
    let menuId;
    const userImagePath = req.file ? `menus/${req.file.filename}` : undefined;

    if (existing.length > 0 && existing[0].values.length > 0) {
      menuId = existing[0].values[0][0];
      if (userImagePath) {
        db.run('UPDATE daily_menus SET user_image_path = ? WHERE id = ?', [userImagePath, menuId]);
      }
      db.run('DELETE FROM menu_items WHERE menu_id = ?', [menuId]);
    } else {
      db.run('INSERT INTO daily_menus (user_id, menu_date, meal_type, user_image_path) VALUES (?, ?, ?, ?)',
        [userId, menu_date, meal_type, userImagePath || null]);
      const result = db.exec('SELECT MAX(id) as id FROM daily_menus');
      menuId = result[0].values[0][0];
    }

    if (parsedRecipeIds && Array.isArray(parsedRecipeIds) && parsedRecipeIds.length > 0) {
      parsedRecipeIds.forEach(recipeId => {
        db.run('INSERT INTO menu_items (menu_id, recipe_id) VALUES (?, ?)', [menuId, recipeId]);
      });
    }

    saveDatabase();
    res.json({ success: true, data: { id: menuId } });
  } catch (error) {
    console.error('更新菜单错误:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:userId/menus', (req, res) => {
  try {
    const { userId } = req.params;
    const { date } = req.query;
    
    const db = getDb();
    let query = 'SELECT * FROM daily_menus WHERE user_id = ?';
    const params = [userId];
    
    if (date) {
      query += ' AND menu_date = ?';
      params.push(date);
    }
    
    query += ' ORDER BY menu_date DESC, meal_type ASC';
    
    const results = db.exec(query, params);
    const menus = results.length > 0 ? results[0].values.map(row => ({
      id: row[0],
      user_id: row[1],
      menu_date: row[2],
      meal_type: row[3],
      user_image_path: row[4],
      created_at: row[5]
    })) : [];
    
    const menusWithItems = menus.map(menu => {
      const itemResults = db.exec(`
        SELECT mi.id, mi.recipe_id, r.name, r.image_path, r.calories, r.protein, r.fat, r.carbs, r.cooking_method
        FROM menu_items mi
        LEFT JOIN recipes r ON mi.recipe_id = r.id
        WHERE mi.menu_id = ?
      `, [menu.id]);
      const items = itemResults.length > 0 ? itemResults[0].values.map(row => ({
        id: row[0],
        recipe_id: row[1],
        name: row[2],
        image_path: row[3],
        calories: row[4],
        protein: row[5],
        fat: row[6],
        carbs: row[7],
        cooking_method: row[8]
      })) : [];
      return { ...menu, items };
    });
    
    res.json({ success: true, data: menusWithItems });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:userId/menus', (req, res) => {
  try {
    const { userId } = req.params;
    const { menu_date, meal_type, user_image_path, recipe_ids } = req.body;
    
    if (!menu_date || !meal_type) {
      return res.status(400).json({ success: false, message: '日期和餐类型不能为空' });
    }
    
    const db = getDb();
    
    const existing = db.exec('SELECT id FROM daily_menus WHERE user_id = ? AND menu_date = ? AND meal_type = ?', [userId, menu_date, meal_type]);
    let menuId;
    
    if (existing.length > 0 && existing[0].values.length > 0) {
      menuId = existing[0].values[0][0];
      if (user_image_path !== undefined) {
        db.run('UPDATE daily_menus SET user_image_path = ? WHERE id = ?', [user_image_path, menuId]);
      }
    } else {
      db.run('INSERT INTO daily_menus (user_id, menu_date, meal_type, user_image_path) VALUES (?, ?, ?, ?)',
        [userId, menu_date, meal_type, user_image_path || null]);
      const result = db.exec('SELECT last_insert_rowid() as id');
      menuId = result[0].values[0][0];
    }
    
    if (recipe_ids && Array.isArray(recipe_ids)) {
      db.run('DELETE FROM menu_items WHERE menu_id = ?', [menuId]);
      recipe_ids.forEach(recipeId => {
        db.run('INSERT INTO menu_items (menu_id, recipe_id) VALUES (?, ?)', [menuId, recipeId]);
      });
    }
    
    saveDatabase();
    res.json({ success: true, data: { id: menuId } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:userId/menus/:menuId', (req, res) => {
  try {
    const { userId, menuId } = req.params;
    const db = getDb();
    db.run('DELETE FROM daily_menus WHERE id = ? AND user_id = ?', [menuId, userId]);
    saveDatabase();
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:userId/stats/daily', (req, res) => {
  try {
    const { userId } = req.params;
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ success: false, message: '日期不能为空' });
    }
    
    const db = getDb();
    
    const meals = db.exec(`
      SELECT dm.id as menu_id, dm.meal_type,
             mi.recipe_id, r.name as recipe_name, r.calories, r.protein, r.fat, r.carbs
      FROM daily_menus dm
      LEFT JOIN menu_items mi ON dm.id = mi.menu_id
      LEFT JOIN recipes r ON mi.recipe_id = r.id
      WHERE dm.user_id = ? AND dm.menu_date = ?
      ORDER BY dm.meal_type ASC
    `, [userId, date]);
    
    const mealsList = [];
    if (meals.length > 0) {
      meals[0].values.forEach(row => {
        mealsList.push({
          meal_type: row[1],
          recipe_name: row[3],
          calories: row[4] || 0,
          protein: row[5] || 0,
          fat: row[6] || 0,
          carbs: row[7] || 0
        });
      });
    }
    
    const totalCalories = mealsList.reduce((sum, m) => sum + m.calories, 0);
    const totalProtein = mealsList.reduce((sum, m) => sum + m.protein, 0);
    const totalFat = mealsList.reduce((sum, m) => sum + m.fat, 0);
    const totalCarbs = mealsList.reduce((sum, m) => sum + m.carbs, 0);
    
    const mealTypeStatsMap = {};
    mealsList.forEach(meal => {
      if (!mealTypeStatsMap[meal.meal_type]) {
        mealTypeStatsMap[meal.meal_type] = { meal_type: meal.meal_type, calories: 0, protein: 0, fat: 0, carbs: 0 };
      }
      mealTypeStatsMap[meal.meal_type].calories += meal.calories;
      mealTypeStatsMap[meal.meal_type].protein += meal.protein;
      mealTypeStatsMap[meal.meal_type].fat += meal.fat;
      mealTypeStatsMap[meal.meal_type].carbs += meal.carbs;
    });
    const mealTypeStats = Object.values(mealTypeStatsMap);
    
    const frequencyData = Object.values(mealTypeStatsMap).map(m => ({
      meal_type: m.meal_type,
      calories: m.calories,
      value: m.calories
    }));
    
    res.json({
      success: true,
      data: {
        date,
        meals: mealsList,
        totalCalories,
        totalProtein,
        totalFat,
        totalCarbs,
        mealTypeStats,
        frequencyData
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:userId/stats', (req, res) => {
  try {
    const { userId } = req.params;
    const db = getDb();
    
    const menus = db.exec(`
      SELECT dm.menu_date, dm.meal_type, COUNT(mi.recipe_id) as recipe_count,
             SUM(COALESCE(r.calories, 0)) as total_calories,
             SUM(COALESCE(r.protein, 0)) as total_protein,
             SUM(COALESCE(r.fat, 0)) as total_fat,
             SUM(COALESCE(r.carbs, 0)) as total_carbs
      FROM daily_menus dm
      LEFT JOIN menu_items mi ON dm.id = mi.menu_id
      LEFT JOIN recipes r ON mi.recipe_id = r.id
      WHERE dm.user_id = ?
      GROUP BY dm.menu_date, dm.meal_type
      ORDER BY dm.menu_date DESC
    `, [userId]);
    
    const dailyStats = menus.length > 0 ? menus[0].values.map(row => ({
      date: row[0],
      meal_type: row[1],
      recipe_count: row[2],
      total_calories: row[3] || 0,
      total_protein: row[4] || 0,
      total_fat: row[5] || 0,
      total_carbs: row[6] || 0
    })) : [];
    
    const cookingFrequency = db.exec(`
      SELECT dm.menu_date, COUNT(DISTINCT dm.meal_type) as meal_count
      FROM daily_menus dm
      WHERE dm.user_id = ?
      GROUP BY dm.menu_date
      ORDER BY dm.menu_date DESC
      LIMIT 30
    `, [userId]);
    
    const frequencyData = cookingFrequency.length > 0 ? cookingFrequency[0].values.map(row => ({
      date: row[0],
      meal_count: row[1]
    })) : [];
    
    const weeklyStats = db.exec(`
      SELECT SUM(COALESCE(r.calories, 0)) as total_calories,
             SUM(COALESCE(r.protein, 0)) as total_protein,
             SUM(COALESCE(r.fat, 0)) as total_fat,
             SUM(COALESCE(r.carbs, 0)) as total_carbs,
             COUNT(DISTINCT dm.menu_date) as cooking_days
      FROM daily_menus dm
      LEFT JOIN menu_items mi ON dm.id = mi.menu_id
      LEFT JOIN recipes r ON mi.recipe_id = r.id
      WHERE dm.user_id = ? AND dm.menu_date >= date('now', '-7 days')
    `, [userId]);
    
    const weeklyData = weeklyStats.length > 0 && weeklyStats[0].values.length > 0 ? {
      total_calories: weeklyStats[0].values[0][0] || 0,
      total_protein: weeklyStats[0].values[0][1] || 0,
      total_fat: weeklyStats[0].values[0][2] || 0,
      total_carbs: weeklyStats[0].values[0][3] || 0,
      cooking_days: weeklyStats[0].values[0][4] || 0
    } : { total_calories: 0, total_protein: 0, total_fat: 0, total_carbs: 0, cooking_days: 0 };
    
    res.json({ 
      success: true, 
      data: { dailyStats, frequencyData, weeklyData }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:userId/stats/monthly', (req, res) => {
  try {
    const { userId } = req.params;
    const { year, month } = req.query;
    
    const db = getDb();
    const currentYear = year || new Date().getFullYear();
    const currentMonth = month ? String(month).padStart(2, '0') : String(new Date().getMonth() + 1).padStart(2, '0');
    const daysInMonth = new Date(currentYear, parseInt(currentMonth), 0).getDate();
    
    const dailyData = db.exec(`
      SELECT dm.menu_date, 
             SUM(COALESCE(r.calories, 0)) as total_calories,
             SUM(COALESCE(r.protein, 0)) as total_protein,
             SUM(COALESCE(r.fat, 0)) as total_fat,
             SUM(COALESCE(r.carbs, 0)) as total_carbs,
             COUNT(DISTINCT dm.meal_type) as meal_count
      FROM daily_menus dm
      LEFT JOIN menu_items mi ON dm.id = mi.menu_id
      LEFT JOIN recipes r ON mi.recipe_id = r.id
      WHERE dm.user_id = ? AND dm.menu_date LIKE ?
      GROUP BY dm.menu_date
      ORDER BY dm.menu_date ASC
    `, [userId, `${currentYear}-${currentMonth}%`]);
    
    const dailyCalories = {};
    const dailyProtein = {};
    const dailyFat = {};
    const dailyCarbs = {};
    const dailyMealCount = {};
    const dailyStatsList = [];
    
    if (dailyData.length > 0) {
      dailyData[0].values.forEach(row => {
        const date = row[0];
        const day = parseInt(date.split('-')[2]);
        dailyCalories[day] = row[1] || 0;
        dailyProtein[day] = row[2] || 0;
        dailyFat[day] = row[3] || 0;
        dailyCarbs[day] = row[4] || 0;
        dailyMealCount[day] = row[5] || 0;
      });
    }
    
    const mealTypeData = db.exec(`
      SELECT dm.menu_date, dm.meal_type,
             SUM(COALESCE(r.calories, 0)) as total_calories,
             SUM(COALESCE(r.protein, 0)) as total_protein,
             SUM(COALESCE(r.fat, 0)) as total_fat,
             SUM(COALESCE(r.carbs, 0)) as total_carbs
      FROM daily_menus dm
      LEFT JOIN menu_items mi ON dm.id = mi.menu_id
      LEFT JOIN recipes r ON mi.recipe_id = r.id
      WHERE dm.user_id = ? AND dm.menu_date LIKE ?
      GROUP BY dm.menu_date, dm.meal_type
      ORDER BY dm.menu_date ASC, dm.meal_type ASC
    `, [userId, `${currentYear}-${currentMonth}%`]);
    
    const dailyStatsByMealType = [];
    if (mealTypeData.length > 0) {
      mealTypeData[0].values.forEach(row => {
        dailyStatsByMealType.push({
          date: row[0],
          meal_type: row[1],
          total_calories: row[2] || 0,
          total_protein: row[3] || 0,
          total_fat: row[4] || 0,
          total_carbs: row[5] || 0
        });
      });
    }
    
    const caloriesData = [];
    const proteinData = [];
    const fatData = [];
    const carbsData = [];
    const mealCountData = [];
    
    let totalCalories = 0, totalProtein = 0, totalFat = 0, totalCarbs = 0;
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2, '0');
      const cal = dailyCalories[d] || 0;
      const pro = dailyProtein[d] || 0;
      const fat = dailyFat[d] || 0;
      const carb = dailyCarbs[d] || 0;
      const mc = dailyMealCount[d] || 0;
      
      caloriesData.push({ label: `${currentMonth}-${dayStr}`, value: cal });
      proteinData.push({ label: `${currentMonth}-${dayStr}`, value: pro });
      fatData.push({ label: `${currentMonth}-${dayStr}`, value: fat });
      carbsData.push({ label: `${currentMonth}-${dayStr}`, value: carb });
      mealCountData.push({ label: `${currentMonth}-${dayStr}`, value: mc });
      
      totalCalories += cal;
      totalProtein += pro;
      totalFat += fat;
      totalCarbs += carb;
    }
    
    const cookingDays = Object.keys(dailyCalories).length;
    
    res.json({
      success: true,
      data: {
        year: parseInt(currentYear),
        month: parseInt(currentMonth),
        calories: caloriesData,
        protein: proteinData,
        fat: fatData,
        carbs: carbsData,
        mealCount: mealCountData,
        dailyStats: dailyStatsByMealType.length > 0 ? dailyStatsByMealType : dailyStatsList,
        totalCalories,
        totalProtein,
        totalFat,
        totalCarbs,
        cookingDays
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:userId/stats/yearly', (req, res) => {
  try {
    const { userId } = req.params;
    const { year } = req.query;
    
    const db = getDb();
    const currentYear = year || new Date().getFullYear();
    
    const monthlyData = db.exec(`
      SELECT SUBSTR(dm.menu_date, 1, 7) as month,
             SUM(COALESCE(r.calories, 0)) as total_calories,
             SUM(COALESCE(r.protein, 0)) as total_protein,
             SUM(COALESCE(r.fat, 0)) as total_fat,
             SUM(COALESCE(r.carbs, 0)) as total_carbs,
             COUNT(DISTINCT dm.menu_date) as cooking_days,
             COUNT(DISTINCT dm.id) as meal_count
      FROM daily_menus dm
      LEFT JOIN menu_items mi ON dm.id = mi.menu_id
      LEFT JOIN recipes r ON mi.recipe_id = r.id
      WHERE dm.user_id = ? AND dm.menu_date LIKE ?
      GROUP BY SUBSTR(dm.menu_date, 1, 7)
      ORDER BY month ASC
    `, [userId, `${currentYear}%`]);
    
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const caloriesData = Array(12).fill(null).map((_, i) => ({ label: monthNames[i], value: 0 }));
    const proteinData = Array(12).fill(null).map((_, i) => ({ label: monthNames[i], value: 0 }));
    const fatData = Array(12).fill(null).map((_, i) => ({ label: monthNames[i], value: 0 }));
    const carbsData = Array(12).fill(null).map((_, i) => ({ label: monthNames[i], value: 0 }));
    const cookingDaysData = Array(12).fill(null).map((_, i) => ({ label: monthNames[i], value: 0 }));
    
    let totalCalories = 0, totalProtein = 0, totalFat = 0, totalCarbs = 0, totalMealCount = 0;
    const monthlyStatsList = [];
    
    if (monthlyData.length > 0) {
      monthlyData[0].values.forEach(row => {
        const monthStr = row[0];
        const monthIdx = parseInt(monthStr.split('-')[1]) - 1;
        if (monthIdx >= 0 && monthIdx < 12) {
          const cal = row[1] || 0;
          const pro = row[2] || 0;
          const fat = row[3] || 0;
          const carb = row[4] || 0;
          const cd = row[5] || 0;
          const mc = row[6] || 0;
          
          caloriesData[monthIdx].value = cal;
          proteinData[monthIdx].value = pro;
          fatData[monthIdx].value = fat;
          carbsData[monthIdx].value = carb;
          cookingDaysData[monthIdx].value = cd;
          
          totalCalories += cal;
          totalProtein += pro;
          totalFat += fat;
          totalCarbs += carb;
          totalMealCount += mc;
          
          monthlyStatsList.push({
            month: monthIdx + 1,
            total_calories: cal,
            total_protein: pro,
            total_fat: fat,
            total_carbs: carb
          });
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        year: currentYear,
        calories: caloriesData,
        protein: proteinData,
        fat: fatData,
        carbs: carbsData,
        cookingDays: cookingDaysData,
        monthlyStats: monthlyStatsList,
        totalCalories,
        totalProtein,
        totalFat,
        totalCarbs,
        totalMealCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
