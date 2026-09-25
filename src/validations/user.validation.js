const Joi = require('joi');
const { password, objectId } = require('./custom.validation');

const createUser = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    name: Joi.string().required(),
    role: Joi.string().required().valid('user', 'admin'),
  }),
};

const getUsers = {
  query: Joi.object().keys({
    name: Joi.string(),
    role: Joi.string().valid('user', 'admin'),
    isEmailVerified: Joi.boolean(),
    sortBy: Joi.string().custom((value, helpers) => {
      const valid = value.split(',').every((token) => /^[a-zA-Z]+:(asc|desc)$/.test(token));
      if (!valid) {
        return helpers.message('"sortBy" must be in the format field:asc or field:desc (comma-separated)');
      }
      return value;
    }),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const getUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId),
  }),
};

const updateUser = {
  params: Joi.object().keys({
    userId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      email: Joi.string().email(),
      password: Joi.string().custom(password),
      name: Joi.string(),
    })
    .min(1),
};

const deleteUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId),
  }),
};

const updateUserNotes = {
  params: Joi.object().keys({
    userId: Joi.required().custom(objectId),
  }),
  body: Joi.object().keys({
    notes: Joi.string().max(1000).required(),
  }),
};

const updateUserAvatar = {
  params: Joi.object().keys({
    userId: Joi.required().custom(objectId),
  }),
};

const exportUsers = {
  query: Joi.object().keys({
    format: Joi.string().valid('json', 'csv').default('json'),
  }),
};

module.exports = {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  updateUserNotes,
  updateUserAvatar,
  exportUsers,
};
