import { Op } from 'sequelize';
import { sequelize, User, RefreshToken, RevokedAccessToken } from '../models/index.js';
import { disconnectUser, disconnectToken } from '../sockets/auth.socket.js';

const afterCommit = (transaction, fn) => (transaction ? transaction.afterCommit(fn) : fn());

export const endAllSessions = async (userId, transaction) => {
  await RefreshToken.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null }, transaction });
  await User.increment('tokenVersion', { where: { id: userId }, transaction });
  afterCommit(transaction, () => disconnectUser(userId));
};

export const revokeAccessToken = async ({ jti, exp, userId }, transaction) => {
  if (!jti) return;
  await RevokedAccessToken.findOrCreate({
    where: { jti },
    defaults: { jti, userId, expiresAt: new Date(exp * 1000) },
    transaction,
  });
  afterCommit(transaction, () => disconnectToken(jti));
};

export const isAccessTokenRevoked = async (jti) => Boolean(await RevokedAccessToken.findOne({ where: { jti }, attributes: ['id'] }));

export const purgeExpiredTokens = async (now = new Date()) => {
  const [revokedAccessTokens, refreshTokens] = await sequelize.transaction(async (transaction) => Promise.all([
    RevokedAccessToken.destroy({ where: { expiresAt: { [Op.lt]: now } }, transaction }),
    RefreshToken.destroy({ where: { expiresAt: { [Op.lt]: now } }, transaction }),
  ]));
  return { revokedAccessTokens, refreshTokens };
};
