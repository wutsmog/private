'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./cjs/react-reconciler-reflection.production.min.js');
} else {
  module.exports = require('./cjs/react-reconciler-reflection.development.js');
}
