'use strict';

throw new Error(
  'React PG cannot be used outside a react-server environment. ' +
    'You must configure Node.js using the `--conditions react-server` flag.'
);
