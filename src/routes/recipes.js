const express = require('express');
const multer = require('multer');
const { getDb, saveDatabase } = require('../database');
const { sanitizeSegment, uploadFile, toPublicAssetUrl } = require('../lib/objectStorage');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

const rowToObject = (columns, values) => {
  const obj = {};
  values.forEach((val, idx) => {
    obj[columns[idx]] = val;
  });
  return obj;
};

const parseArrayInput = (input) => {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const toStepPayload = (step) => {
  if (!step) return { title: '', description: '' };
  if (typeof step === 'string') {
    return { title: '', description: step };
  }
  return {
    title: step.title || '',
    description: step.description || ''
  };
};

const toSeasoningName = (item) => {
  if (!item) return '';
  if (typeof item === 'string') return item.trim();
  return (item.name || '').trim();
};

const buildRecipeDetail = async (db, recipe) => {
  const ingResults = await db.exec(
    'SELECT ri.ingredient_name as name, ri.quantity, i.icon FROM recipe_ingredients ri LEFT JOIN ingredients i ON ri.ingredient_name = i.name WHERE ri.recipe_id = ? ORDER BY ri.id',
    [recipe.id]
  );
  const ingredients = ingResults.length > 0
    ? ingResults[0].values.map((row) => rowToObject(ingResults[0].columns, row))
    : [];

  const stepResults = await db.exec(
    'SELECT step_number, title, description, image_path FROM recipe_steps WHERE recipe_id = ? ORDER BY step_number',
    [recipe.id]
  );
  const steps = stepResults.length > 0
    ? stepResults[0].values.map((row) => {
      const obj = rowToObject(stepResults[0].columns, row);
      return {
        stepNumber: obj.step_number,
        title: obj.title || '',
        description: obj.description,
        image: toPublicAssetUrl(obj.image_path)
      };
    })
    : [];

  const seasoningResults = await db.exec(
    'SELECT name FROM recipe_seasonings WHERE recipe_id = ? ORDER BY id',
    [recipe.id]
  );
  const seasonings = seasoningResults.length > 0
    ? seasoningResults[0].values.map((row) => rowToObject(seasoningResults[0].columns, row))
    : [];

  return {
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    flavor: recipe.flavor,
    servings: recipe.servings,
    cookingMethod: recipe.cooking_method,
    description: recipe.description,
    image: toPublicAssetUrl(recipe.image_path),
    video: toPublicAssetUrl(recipe.video_path),
    ingredients,
    seasonings,
    steps,
    createdAt: recipe.created_at,
    updatedAt: recipe.updated_at
  };
};

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { category, flavor, ingredient, search } = req.query;

    let sql = 'SELECT r.* FROM recipes r';
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
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY r.created_at DESC';

    const results = await db.exec(sql, params);
    const recipes = results.length > 0
      ? results[0].values.map((row) => rowToObject(results[0].columns, row))
      : [];

    const detailList = [];
    for (const recipe of recipes) {
      detailList.push(await buildRecipeDetail(db, recipe));
    }

    res.json({ success: true, data: detailList });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const results = await db.exec('SELECT * FROM recipes WHERE id = ?', [id]);
    if (results.length === 0 || results[0].values.length === 0) {
      return res.status(404).json({ success: false, message: '菜谱不存在' });
    }

    const recipe = rowToObject(results[0].columns, results[0].values[0]);
    res.json({ success: true, data: await buildRecipeDetail(db, recipe) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', upload.any(), async (req, res) => {
  try {
    const { name, category, flavor, servings, cookingMethod, description, ingredients, seasonings, steps } = req.body;
    if (!name || !category || !flavor) {
      return res.status(400).json({ success: false, message: '名称、分类和口味不能为空' });
    }

    const db = getDb();
    const safeRecipeName = sanitizeSegment(name);
    const imageFile = req.files?.find((f) => f.fieldname === 'image');
    const videoFile = req.files?.find((f) => f.fieldname === 'video');
    const imagePath = imageFile ? await uploadFile(imageFile, `recipes/${safeRecipeName}`) : null;
    const videoPath = videoFile ? await uploadFile(videoFile, `recipes/${safeRecipeName}`) : null;

    const insertRecipeResult = await db.exec(
      'INSERT INTO recipes (name, category, flavor, servings, cooking_method, description, image_path, video_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
      [name, category, flavor, servings || '2人份', cookingMethod, description, imagePath, videoPath]
    );
    const recipeId = insertRecipeResult[0].values[0][0];

    const ingredientsData = parseArrayInput(ingredients);
    for (const ing of ingredientsData) {
      await db.run(
        'INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES (?, ?, ?)',
        [recipeId, ing.name, ing.quantity || '']
      );
    }

    const seasoningsData = parseArrayInput(seasonings);
    for (const item of seasoningsData) {
      const seasoningName = toSeasoningName(item);
      if (!seasoningName) continue;
      await db.run(
        'INSERT INTO recipe_seasonings (recipe_id, name) VALUES (?, ?)',
        [recipeId, seasoningName]
      );
    }

    const stepsData = parseArrayInput(steps);
    for (let index = 0; index < stepsData.length; index += 1) {
      const step = toStepPayload(stepsData[index]);
      const stepFile = req.files?.find((f) => f.fieldname === `step_${index}`);
      const stepImagePath = stepFile ? await uploadFile(stepFile, `recipes/${safeRecipeName}`) : null;
      await db.run(
        'INSERT INTO recipe_steps (recipe_id, step_number, title, description, image_path) VALUES (?, ?, ?, ?, ?)',
        [recipeId, index + 1, step.title, step.description, stepImagePath]
      );
    }

    await saveDatabase();
    res.json({ success: true, data: { id: recipeId } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', upload.any(), async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { name, category, flavor, servings, cookingMethod, description, ingredients, seasonings, steps } = req.body;

    const results = await db.exec('SELECT * FROM recipes WHERE id = ?', [id]);
    if (results.length === 0 || results[0].values.length === 0) {
      return res.status(404).json({ success: false, message: '菜谱不存在' });
    }

    const existingRecipe = rowToObject(results[0].columns, results[0].values[0]);
    const recipeName = name || existingRecipe.name;
    const safeRecipeName = sanitizeSegment(recipeName);
    const imageFile = req.files?.find((f) => f.fieldname === 'image');
    const videoFile = req.files?.find((f) => f.fieldname === 'video');
    const imagePath = imageFile ? await uploadFile(imageFile, `recipes/${safeRecipeName}`) : existingRecipe.image_path;
    const videoPath = videoFile ? await uploadFile(videoFile, `recipes/${safeRecipeName}`) : existingRecipe.video_path;

    await db.run(
      'UPDATE recipes SET name = ?, category = ?, flavor = ?, servings = ?, cooking_method = ?, description = ?, image_path = ?, video_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [
        name || existingRecipe.name,
        category || existingRecipe.category,
        flavor || existingRecipe.flavor,
        servings || existingRecipe.servings,
        cookingMethod || existingRecipe.cooking_method,
        description !== undefined ? description : existingRecipe.description,
        imagePath,
        videoPath,
        id
      ]
    );

    await db.run('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [id]);
    const ingredientsData = parseArrayInput(ingredients);
    for (const ing of ingredientsData) {
      await db.run(
        'INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity) VALUES (?, ?, ?)',
        [id, ing.name, ing.quantity || '']
      );
    }

    await db.run('DELETE FROM recipe_seasonings WHERE recipe_id = ?', [id]);
    const seasoningsData = parseArrayInput(seasonings);
    for (const item of seasoningsData) {
      const seasoningName = toSeasoningName(item);
      if (!seasoningName) continue;
      await db.run(
        'INSERT INTO recipe_seasonings (recipe_id, name) VALUES (?, ?)',
        [id, seasoningName]
      );
    }

    const existingStepsResult = await db.exec('SELECT image_path FROM recipe_steps WHERE recipe_id = ? ORDER BY step_number ASC', [id]);
    const existingStepImages = existingStepsResult.length > 0 ? existingStepsResult[0].values.map((row) => row[0]) : [];

    await db.run('DELETE FROM recipe_steps WHERE recipe_id = ?', [id]);
    const stepsData = parseArrayInput(steps);
    for (let index = 0; index < stepsData.length; index += 1) {
      const step = toStepPayload(stepsData[index]);
      const stepFile = req.files?.find((f) => f.fieldname === `step_${index}`);
      const stepImagePath = stepFile
        ? await uploadFile(stepFile, `recipes/${safeRecipeName}`)
        : (existingStepImages[index] || null);

      await db.run(
        'INSERT INTO recipe_steps (recipe_id, step_number, title, description, image_path) VALUES (?, ?, ?, ?, ?)',
        [id, index + 1, step.title, step.description, stepImagePath]
      );
    }

    await saveDatabase();
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    await db.run('DELETE FROM recipes WHERE id = ?', [id]);
    await saveDatabase();
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
