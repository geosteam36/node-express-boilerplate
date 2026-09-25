const path = require('path');
const multer = require('multer');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const UPLOAD_DIR = path.join(__dirname, '../../public/uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(httpStatus.BAD_REQUEST, 'Only JPEG and PNG images are allowed'));
  }
};

const uploadAvatar = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
}).single('avatar');

/**
 * Wraps multer's uploadAvatar so that MulterError (e.g. file too large) and
 * fileFilter errors are both forwarded to Express's error handler as ApiErrors.
 */
const handleAvatarUpload = (req, res, next) => {
  uploadAvatar(req, res, (err) => {
    if (!err) {
      return next();
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(httpStatus.BAD_REQUEST, 'File size must not exceed 2 MB'));
    }
    // ApiError thrown by fileFilter, or any other unexpected error
    return next(err);
  });
};

module.exports = { handleAvatarUpload };
