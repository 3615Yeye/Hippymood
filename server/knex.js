// Loading configuration file with database credentials
var config = require('../build/serverConfig');
var dbConfig = {
  client: 'mysql',
  connection: {
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  }
};

module.exports = dbConfig;
