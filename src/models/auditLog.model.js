const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const ACTIONS = {
  UPDATE_USER_NOTES: 'UPDATE_USER_NOTES',
};

const auditLogSchema = mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: Object.values(ACTIONS),
      index: true,
    },
    performedBy: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    targetUser: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    metadata: {
      type: mongoose.SchemaTypes.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.plugin(toJSON);

/**
 * @typedef AuditLog
 */
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
module.exports.ACTIONS = ACTIONS;
