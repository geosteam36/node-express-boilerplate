const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

/**
 * Require an authenticated administrator. This is deliberately separate from
 * auth('manageUsers'), which permits users to manage their own base profile.
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(new ApiError(httpStatus.FORBIDDEN, 'Forbidden'));
  }
  return next();
};

module.exports = requireAdmin;
