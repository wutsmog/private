import {completeBoundary} from './ReactDOMFizzInstructionSet';

// This is a string so Closure's advanced compilation mode doesn't mangle it.
// eslint-disable-next-line dot-notation
window['$RC'] = completeBoundary;
