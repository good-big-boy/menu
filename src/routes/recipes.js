const express = require('express');
const router = express.Router();
const { getDb, saveDatabase } = require('../database');
const { UPLOAD_BASE_DIR } = require('../middleware/upload');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ensureDirExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const recipeName = req.body.name || 'unknown';
    const destDir = path.join(UPLOAD_BASE_DIR, 'recipes', recipeName);
    ensureDirExists(destDir);
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

const rowToObject = (columns, values) => {
  const obj = {};
  values.forEach((val, idx) => obj[columns[idx]] = val);
  return obj;
};

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { category, flavor, ingredient, search } = req.query;
    
    let query = `SELECT r.* FROM recipes r`;
    const conditions = [];
    const params = [];
    
    if (category) {
      conditions.push('r.category = ?');
      params.push(category);
    }
    if (flavor) {
      conditions.push('r.flavor = ?');
      params.push(flavor);
    }
    if (ingredient) {
      conditions.push('r.id IN (SELECT recipe_id FROM recipe_ingredients WHERE ingredient_name = ?)');
      params.push(ingredient);
    }
    if (search) {
      conditions.push('(r.name LIKE ? OR r.description LIKE ? OR r.id IN (SELECT recipe_id FROM recipe_ingredients WHERE ingredient_name LIKE ?))');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY r.created_at DESC';
    
    console.log('查询参数:', { category, flavor, ingredient, search });
    console.log('SQL查询:', query, params);
    
    const results = db.exec(query, params);
    const recipes = results.length > 0 ? results[0].values.map(row => rowToObject(results[0].columns, row)) : [];
    
    const recipesWithDetails = recipes.map(recipe => {
      const ingResults = db.exec('SELECT ri.ingredient_name as name, ri.quantity, i.icon FROM recipe_ingredients ri LEFT JOIN ingredients i ON ri.ingredient_name = i.name WHERE ri.recipe_id = ? ORDER BY ri.id', [recipe.id]);
      const ingredients = ingResults.length > 0 ? ingResults[0].values.map(row => rowToObject(ingResults[0].columns, row)) : [];
      
      const stepResults = db.exec('SELECT step_number, description, image_path FROM recipe_steps WHERE recipe_id = ? ORDER BY step_number', [recipe.id]);
      const steps = stepResults.length > 0 ? stepResults[0].values.map(row => {
        const obj = rowToObject(stepResults[0].columns, row);
        return {
          stepNumber: obj.step_number,
          description: obj.description,
          image: obj.image_path ? `/uploads/${obj.image_path}` : null
        };
      }) : [];
      
      return {
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
        createdAt: recipe.created_at,
        updatedAt: recipe.updated_at
      };
    });
    
    console.log('返回菜谱数量:', recipesWithDetails.length);
    
    res.json({ success: true, data: recipesWithDetails });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    const results = db.exec('SELECT * FROM recipes WHERE id = ?', [id]);
    if (results.length === 0 || results[0].values.length === 0) {
      return res.status(404).json({ success: false, message: '菜谱不存在' });
    }
    
    const recipe = rowToObject(results[0].columns, results[0].values[0]);
    
    const ingResults = db.exec('SELECT ri.ingredient_name as name, ri.quantity, i.icon FROM recipe_ingredients ri LEFT JOIN ingredients i ON ri.ingredient_name = i.name WHERE ri.recipe_id = ? ORDER BY ri.id', [id]);
    const ingredients = ingResults.length > 0 ? ingResults[0].values.map(row => rowToObject(ingResults[0].columns, row)) : [];
    
    const stepResults = db.exec('SELECT step_number, description, image_path FROM recipe_steps WHERE recipe_id = ? ORDER BY step_number', [id]);
    const steps = stepResults.length > 0 ? stepResults[0].values.map(row => {
      const obj = rowToObject(stepResults[0].columns, row);
      return {
        stepNumber: obj.step_number,
        description: obj.description,
        image: obj.image_path ? `/uploads/${obj.image_path}` : null
      };
    }) : [];
    
    res.json({
      success: true,
      data: {
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
        createdAt: recipe.created_at,
        updatedAt: recipe.updated_at
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', upload.any(), (req, res) => {
  try {
    const { name, category, flavor, servings, cookingMethod, description, ingredients, steps } = req.body;
    
    console.log('收到菜谱数据:', { name, category, flavor, servings, cookingMethod, description });
    console.log('食材数据:', ingredients);
    console.log('步骤数据:', steps);
    console.log('文件:', req.files?.map(f => f.fieldname));
    
    if (!name || !category || !flavor) {
      return res.status(400).json({ success: false, message: '名称、分类和口味不能为空' });
    }
    
    const db = getDb();
    const imagePath = req.files?.find(f => f.fieldname === 'image') ? `recipes/${name}/${req.files.find(f => f.fieldname === 'image').filename}` : null;
    const videoPath = req.files?.find(f => f.fieldname === 'video') ? `recipes/${name}/${req.files.find(f => f.fieldname === 'video').filename}` : null;
    
    db.run(`INSERT INTO recipes (name, category, flavor, servings, cooking_method, description, image_path, video_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, category, flavor, servings || '2人份', cookingMethod, description, imagePath, videoPath]);
    
    const maxIdResult = db.exec('SELECT MAX(id) as id FROM recipes');
    const recipeId = maxIdResult[0].values[0][0];
    console.log('获取到的 recipeId:', recipeId);
    
    saveDatabase();
    
    const ingredientsData = ingredients ? (typeof ingredients === 'string' ? JSON.parse(ingredients) : ingredients) : [];
    console.log('解析后的食材数据:', ingredientsData);
    console.log('食材数据类型:', typeof ingredientsData);
    console.log('食材数据长度:', ingredientsData?.length);
    
    if (ingredientsData && Array.isArray(ingredientsData) && ingredientsData.length > 0) {
      ingredientsData.forEach((ing, index) => {
        console.log(`插入食材 ${index + 1}:`, { recipeId, name: ing.name, quantity: ing.quantity || '' });
        db.run('INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES (?, ?, ?)',
          [recipeId, ing.name, ing.quantity || '']);
      });
      console.log('食材插入完成');
    } else {
      console.log('没有食材数据需要插入');
    }
    
    const stepsData = steps ? (typeof steps === 'string' ? JSON.parse(steps) : steps) : [];
    console.log('解析后的步骤数据:', stepsData);
    console.log('步骤数据类型:', typeof stepsData);
    console.log('步骤数据长度:', stepsData?.length);
    
    if (stepsData && Array.isArray(stepsData) && stepsData.length > 0) {
      stepsData.forEach((step, index) => {
        const stepFile = req.files?.find(f => f.fieldname === `step_${index}`);
        const stepImagePath = stepFile ? `recipes/${name}/${stepFile.filename}` : null;
        console.log(`插入步骤 ${index + 1}:`, { recipeId, stepNumber: index + 1, description: step.description, image: stepImagePath });
        db.run('INSERT INTO recipe_steps (recipe_id, step_number, description, image_path) VALUES (?, ?, ?, ?)',
          [recipeId, index + 1, step.description, stepImagePath]);
      });
      console.log('步骤插入完成');
    } else {
      console.log('没有步骤数据需要插入');
    }
    
    saveDatabase();
    console.log('数据库保存完成');
    
    res.json({ success: true, data: { id: recipeId } });
  } catch (error) {
    console.error('保存菜谱错误:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', upload.any(), (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { name, category, flavor, servings, cookingMethod, description, ingredients, steps } = req.body;
    
    console.log('=== 更新菜谱 ===');
    console.log('菜谱ID:', id);
    console.log('食材数据:', ingredients);
    console.log('步骤数据:', steps);
    
    const results = db.exec('SELECT * FROM recipes WHERE id = ?', [id]);
    if (results.length === 0 || results[0].values.length === 0) {
      return res.status(404).json({ success: false, message: '菜谱不存在' });
    }
    
    const existingRecipe = rowToObject(results[0].columns, results[0].values[0]);
    const recipeName = name || existingRecipe.name;
    const imagePath = req.files?.find(f => f.fieldname === 'image') ? `recipes/${recipeName}/${req.files.find(f => f.fieldname === 'image').filename}` : existingRecipe.image_path;
    const videoPath = req.files?.find(f => f.fieldname === 'video') ? `recipes/${recipeName}/${req.files.find(f => f.fieldname === 'video').filename}` : existingRecipe.video_path;
    
    db.run(`UPDATE recipes SET name = ?, category = ?, flavor = ?, servings = ?, cooking_method = ?, description = ?, image_path = ?, video_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [name || existingRecipe.name, category || existingRecipe.category, flavor || existingRecipe.flavor,
       servings || existingRecipe.servings, cookingMethod || existingRecipe.cooking_method,
       description !== undefined ? description : existingRecipe.description, imagePath, videoPath, id]);
    
    db.run('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [id]);
    const ingredientsData = ingredients ? (typeof ingredients === 'string' ? JSON.parse(ingredients) : ingredients) : [];
    console.log('解析后的食材数据:', ingredientsData);
    if (ingredientsData && Array.isArray(ingredientsData) && ingredientsData.length > 0) {
      ingredientsData.forEach((ing, index) => {
        console.log(`更新食材 ${index + 1}:`, { recipeId: id, name: ing.name, quantity: ing.quantity || '' });
        db.run('INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES (?, ?, ?)',
          [id, ing.name, ing.quantity || '']);
      });
      console.log('食材更新完成');
    }
    
    // Get existing step images BEFORE deleting
    const existingStepsResult = db.exec('SELECT image_path FROM recipe_steps WHERE recipe_id = ? ORDER BY step_number ASC', [id]);
    const existingStepImages = existingStepsResult.length > 0 ? existingStepsResult[0].values.map(row => row[0]) : [];
    
    db.run('DELETE FROM recipe_steps WHERE recipe_id = ?', [id]);
    const stepsData = steps ? (typeof steps === 'string' ? JSON.parse(steps) : steps) : [];
    console.log('解析后的步骤数据:', stepsData);
    console.log('现有步骤图片:', existingStepImages);
    if (stepsData && Array.isArray(stepsData) && stepsData.length > 0) {
      stepsData.forEach((step, index) => {
        const stepFile = req.files?.find(f => f.fieldname === `step_${index}`);
        let stepImagePath = null;
        
        if (stepFile) {
          // New file uploaded
          stepImagePath = `recipes/${recipeName}/${stepFile.filename}`;
        } else if (existingStepImages[index]) {
          // Preserve existing image
          stepImagePath = existingStepImages[index];
        }
        
        console.log(`更新步骤 ${index + 1}:`, { recipeId: id, stepNumber: index + 1, description: step.description || step, image: stepImagePath });
        db.run('INSERT INTO recipe_steps (recipe_id, step_number, description, image_path) VALUES (?, ?, ?, ?)',
          [id, index + 1, step.description || step || '', stepImagePath]);
      });
      console.log('步骤更新完成');
    }
    
    saveDatabase();
    console.log('数据库保存完成');
    
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    console.error('更新菜谱错误:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    db.run('DELETE FROM recipes WHERE id = ?', [id]);
    saveDatabase();
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
