require('dotenv').config();

// Same TLS options as the running app (src/config/database.js): providers like Aiven refuse plain connections,
// so without this `db:migrate` against them is rejected. Off unless DB_SSL=true, so local and test runs are unchanged.
const dialectOptions = process.env.DB_SSL === 'true'
  ? { ssl: { ca: process.env.DB_SSL_CA, rejectUnauthorized: true } }
  : {};

const base = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD || null,
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  dialect: 'mysql',
  dialectOptions,
  timezone: '+00:00',
  seederStorage: 'sequelize',
};

module.exports = {
  development: { ...base, database: process.env.DB_NAME },
  test: { ...base, database: `${process.env.DB_NAME}_test`, logging: false },
  production: { ...base, database: process.env.DB_NAME, logging: false },
};
