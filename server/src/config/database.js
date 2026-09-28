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
});

export default sequelize;
