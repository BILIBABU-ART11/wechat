const config = require('../config');

let pool = null;

function hasMysqlConfig() {
  return Boolean(config.mysql.host && config.mysql.user && config.mysql.password);
}

function getPool() {
  if (!hasMysqlConfig()) return null;
  if (pool) return pool;
  const mysql = require('mysql2/promise');
  pool = mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    waitForConnections: true,
    connectionLimit: 8,
    charset: 'utf8mb4'
  });
  return pool;
}

module.exports = {
  hasMysqlConfig,
  getPool
};
