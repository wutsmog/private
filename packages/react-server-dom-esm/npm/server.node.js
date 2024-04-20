'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./cjs/react-server-dom-esm-server.node.production.js');
} else {
  module.exports = require('./cjs/react-server-dom-esm-server.node.development.js');
}
