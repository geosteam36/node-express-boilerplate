const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { authService, userService, tokenService, emailService, twoFactorService } = require('../services');

const register = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);
  const tokens = await tokenService.generateAuthTokens(user);
  res.status(httpStatus.CREATED).send({ user, tokens });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await authService.loginUserWithEmailAndPassword(email, password);

  if (user.isTwoFactorEnabled) {
    // Credentials are correct but 2FA is required; return a challenge instead of tokens.
    return res.send({ twoFactorRequired: true, userId: user.id });
  }

  const tokens = await tokenService.generateAuthTokens(user);
  return res.send({ user, tokens });
});

const logout = catchAsync(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await authService.refreshAuth(req.body.refreshToken);
  res.send({ ...tokens });
});

const forgotPassword = catchAsync(async (req, res) => {
  const resetPasswordToken = await tokenService.generateResetPasswordToken(req.body.email);
  await emailService.sendResetPasswordEmail(req.body.email, resetPasswordToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.query.token, req.body.password);
  res.status(httpStatus.NO_CONTENT).send();
});

const sendVerificationEmail = catchAsync(async (req, res) => {
  const verifyEmailToken = await tokenService.generateVerifyEmailToken(req.user);
  await emailService.sendVerificationEmail(req.user.email, verifyEmailToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const verifyEmail = catchAsync(async (req, res) => {
  await authService.verifyEmail(req.query.token);
  res.status(httpStatus.NO_CONTENT).send();
});

const generate2faSecret = catchAsync(async (req, res) => {
  const { otpauthUrl, qrCodeDataUrl } = await twoFactorService.generateSecret(req.user);
  res.send({ otpauthUrl, qrCodeDataUrl });
});

const verify2fa = catchAsync(async (req, res) => {
  await twoFactorService.verifyAndEnable(req.user, req.body.token);
  res.status(httpStatus.NO_CONTENT).send();
});

const validate2faLogin = catchAsync(async (req, res) => {
  const { userId, token } = req.body;
  const user = await authService.loginWithTwoFactor(userId, token);
  const tokens = await tokenService.generateAuthTokens(user);
  res.send({ user, tokens });
});

module.exports = {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
  generate2faSecret,
  verify2fa,
  validate2faLogin,
};
