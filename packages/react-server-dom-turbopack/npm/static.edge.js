'use strict';

var s;
if (process.env.NODE_ENV === 'production') {
  s = require('./cjs/react-server-dom-turbopack-server.edge.production.js');
} else {
  s = require('./cjs/react-server-dom-turbopack-server.edge.development.js');
}

if (s.prerender) {
  exports.prerender = s.prerender;
}
