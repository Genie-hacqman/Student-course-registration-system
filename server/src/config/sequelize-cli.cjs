require('dotenv').config();

const base = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD || null,
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  dialect: 'mysql',
  timezone: '+00:00',
  seederStorage: 'sequelize',
};

module.exports = {
  development: { ...base, database: process.env.DB_NAME },
  test: { ...base, database: `${process.env.DB_NAME}_test`, logging: false },
  production: { ...base, database: process.env.DB_NAME, logging: false },
};
