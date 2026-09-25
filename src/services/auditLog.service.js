const {
  AuditLog,
  AuditLog: { ACTIONS },
} = require('../models');

/**
 * Create an audit log entry.
 * Failures are intentionally non-fatal: a logging error must never break the
 * primary request.  Callers should not await this function.
 * @param {Object} params
 * @param {string}   params.action      - One of ACTIONS
 * @param {ObjectId} params.performedBy - ID of the user who triggered the change
 * @param {ObjectId} params.targetUser  - ID of the user who was changed
 * @param {Object}   [params.metadata]  - Arbitrary extra detail
 * @returns {Promise<AuditLog>}
 */
const logAction = ({ action, performedBy, targetUser, metadata = {} }) => {
  return AuditLog.create({ action, performedBy, targetUser, metadata });
};

module.exports = {
  logAction,
  ACTIONS,
};
