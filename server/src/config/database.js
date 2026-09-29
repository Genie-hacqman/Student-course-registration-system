import { Sequelize } from 'sequelize';
import env from './env.js';
import logger from './logger.js';

const sequelize = new Sequelize(env.dbName, env.DB_USER, env.DB_PASSWORD, {
  host: env.DB_HOST,
  port: env.DB_PORT,
  dialect: 'mysql',
  logging: env.NODE_ENV === 'development' ? (sql) => logger.debug(sql) : false,
  timezone: '+00:00',
  define: {
    underscored: true,
    timestamps: true,
    freezeTableName: false,
  },
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  // See DB_SSL in env.js: off by default (plain local MySQL needs nothing here), opt-in for
  // providers that require TLS. DB_SSL_CA lets the provider's own CA be pinned; without it, Node's
  // default trusted CA list is used, which is enough for most managed providers' public certs.
  dialectOptions: env.DB_SSL ? { ssl: { ca: env.DB_SSL_CA, rejectUnauthorized: true } } : {},
});

export default sequelize;
