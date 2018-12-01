'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./cjs/jest-mock-scheduler.production.min.js');
} else {
  module.exports = require('./cjs/jest-mock-scheduler.development.js');
}
