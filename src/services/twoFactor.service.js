const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const httpStatus = require('http-status');
const userService = require('./user.service');
const ApiError = require('../utils/ApiError');

const APP_NAME = 'NodeExpressApp';

/**
 * Generate a new TOTP secret for a user and persist it (unconfirmed until verify).
 * Returns the otpauth URL and a base64 QR code data URL.
 * @param {User} user - Mongoose document
 * @returns {Promise<{ otpauthUrl: string, qrCodeDataUrl: string }>}
 */
const generateSecret = async (user) => {
  const secret = speakeasy.generateSecret({ name: `${APP_NAME} (${user.email})` });

  // Persist the raw base32 secret before the user confirms with a TOTP code.
  // isTwoFactorEnabled stays false until verify() succeeds.
  await userService.updateUserById(user.id, { twoFactorSecret: secret.base32 });

  const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url);

  return { otpauthUrl: secret.otpauth_url, qrCodeDataUrl };
};

/**
 * Verify a TOTP token against the user's stored secret and enable 2FA.
 * @param {User} user - Mongoose document (must have twoFactorSecret populated)
 * @param {string} token - 6-digit TOTP code from authenticator app
 * @returns {Promise<void>}
 */
const verifyAndEnable = async (user, token) => {
  if (!user.twoFactorSecret) {
    throw new ApiError(httpStatus.BAD_REQUEST, '2FA setup has not been initiated; call /2fa/generate first');
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token,
    window: 1, // tolerate ±30 s clock drift
  });

  if (!verified) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid 2FA token');
  }

  await userService.updateUserById(user.id, { isTwoFactorEnabled: true });
};

/**
 * Verify a TOTP token for an already-enabled user (second factor at login).
 * @param {User} user - Mongoose document
 * @param {string} token - 6-digit TOTP code
 * @returns {void}  throws ApiError on failure
 */
const validateLoginToken = (user, token) => {
  if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
    throw new ApiError(httpStatus.BAD_REQUEST, '2FA is not enabled for this user');
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token,
    window: 1,
  });

  if (!verified) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid 2FA token');
  }
};

module.exports = {
  generateSecret,
  verifyAndEnable,
  validateLoginToken,
};
