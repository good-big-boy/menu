const multer = require('multer');
const path = require('path');
const fs = require('fs');

const resolveUploadBaseDir = () => {
  const candidates = [
    process.env.UPLOAD_BASE_DIR,
    path.join(process.cwd(), 'uploads'),
    '/tmp/uploads'
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch (error) {
      // try next candidate
    }
  }

  throw new Error('No writable upload directory. Set UPLOAD_BASE_DIR to a writable path.');
};

const UPLOAD_BASE_DIR = resolveUploadBaseDir();

const ensureDirExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

ensureDirExists(UPLOAD_BASE_DIR);

const createStorage = (subfolder) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const recipeName = req.body.name || 'unknown';
        const destDir = path.join(UPLOAD_BASE_DIR, subfolder, recipeName);
        ensureDirExists(destDir);
        cb(null, destDir);
      } catch (error) {
        cb(error);
      }
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
  });
};

const uploadRecipeImage = multer({
  storage: createStorage('recipes'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片文件'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadRecipeVideo = multer({
  storage: createStorage('recipes'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('只支持视频文件'));
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 }
});

const uploadStepImage = multer({
  storage: createStorage('recipes'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片文件'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadCustomIcon = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const destDir = path.join(UPLOAD_BASE_DIR, 'icons');
        ensureDirExists(destDir);
        cb(null, destDir);
      } catch (error) {
        cb(error);
      }
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, 'icon-' + uniqueSuffix + ext);
    }
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片文件'));
    }
  },
  limits: { fileSize: 2 * 1024 * 1024 }
});

module.exports = {
  uploadRecipeImage,
  uploadRecipeVideo,
  uploadStepImage,
  uploadCustomIcon,
  UPLOAD_BASE_DIR
};
