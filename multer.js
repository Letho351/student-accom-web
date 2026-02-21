const multer = require('multer');
const path = require('path');

const upload = multer({
  dest: 'tmp/', // temporary storage
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error('Images only'));
  }
});

module.exports = upload;