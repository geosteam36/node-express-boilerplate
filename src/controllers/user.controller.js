const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { userService, auditLogService } = require('../services');

// CSV column order — matches the fields exportUsers() returns minus internal fields
const CSV_COLUMNS = ['id', 'name', 'email', 'role', 'isEmailVerified', 'notes', 'avatarPath', 'isTwoFactorEnabled'];

/**
 * Escape a single CSV cell value.
 * Wraps in double-quotes if the value contains a comma, double-quote, or newline.
 */
const escapeCsvCell = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Serialise an array of plain user objects to a CSV string.
 * @param {Object[]} users
 * @returns {string}
 */
const usersToCSV = (users) => {
  const header = CSV_COLUMNS.join(',');
  const rows = users.map((u) => {
    // _id from .lean() is an ObjectId; normalise to string
    const id = u._id ? u._id.toString() : '';
    const row = {
      id,
      name: u.name,
      email: u.email,
      role: u.role,
      isEmailVerified: u.isEmailVerified,
      notes: u.notes,
      avatarPath: u.avatarPath,
      isTwoFactorEnabled: u.isTwoFactorEnabled,
    };
    return CSV_COLUMNS.map((col) => escapeCsvCell(row[col])).join(',');
  });
  return [header, ...rows].join('\n');
};

const createUser = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(httpStatus.CREATED).send(user);
});

const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'role', 'isEmailVerified']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await userService.queryUsers(filter, options);
  res.send(result);
});

const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  res.send(user);
});

const updateUser = catchAsync(async (req, res) => {
  const user = await userService.updateUserById(req.params.userId, req.body);
  res.send(user);
});

const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUserById(req.params.userId);
  res.status(httpStatus.NO_CONTENT).send();
});

const updateUserNotes = catchAsync(async (req, res) => {
  if (!req.body.notes) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Notes content is required');
  }

  const user = await userService.updateUserById(req.params.userId, { notes: req.body.notes });

  auditLogService.logAction({
    action: auditLogService.ACTIONS.UPDATE_USER_NOTES,
    performedBy: req.user.id,
    targetUser: user.id,
    metadata: { notes: req.body.notes },
  });

  res.send(user);
});

const updateUserAvatar = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Avatar file is required');
  }

  const avatarPath = `/uploads/${req.file.filename}`;
  const user = await userService.updateUserById(req.params.userId, { avatarPath });
  res.send(user);
});

const exportUsersHandler = catchAsync(async (req, res) => {
  const users = await userService.exportUsers();

  // Format is either the ?format= query param (normalised by Joi) or Accept header
  const wantsCSV = req.query.format === 'csv' || (req.headers.accept || '').includes('text/csv');

  if (wantsCSV) {
    const csv = usersToCSV(users);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    return res.send(csv);
  }

  // JSON: map lean docs through toJSON-equivalent projection (id, no private fields)
  const sanitised = users.map((u) => ({
    id: u._id ? u._id.toString() : '',
    name: u.name,
    email: u.email,
    role: u.role,
    isEmailVerified: u.isEmailVerified,
    ...(u.notes !== undefined && { notes: u.notes }),
    ...(u.avatarPath !== undefined && { avatarPath: u.avatarPath }),
    isTwoFactorEnabled: u.isTwoFactorEnabled,
  }));

  return res.send(sanitised);
});

module.exports = {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  updateUserNotes,
  updateUserAvatar,
  exportUsers: exportUsersHandler,
};
