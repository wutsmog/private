/**
 * Copyright 2014-2015, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactEmptyComponent
 */

'use strict';

var ReactElement = require('ReactElement');
var ReactReconciler = require('ReactReconciler');

var assign = require('Object.assign');

var placeholderElement;

var ReactEmptyComponentInjection = {
  injectEmptyComponent: function(component) {
    placeholderElement = ReactElement.createElement(component);
  },
};

var ReactEmptyComponent = function(instantiate) {
  this._currentElement = null;
  this._rootNodeID = null;
  this._renderedComponent = instantiate(placeholderElement);
};
assign(ReactEmptyComponent.prototype, {
  construct: function(element) {
  },
  mountComponent: function(
    rootID,
    transaction,
    nativeParent,
    nativeContainerInfo,
    context
  ) {
    this._rootNodeID = rootID;
    return ReactReconciler.mountComponent(
      this._renderedComponent,
      rootID,
      transaction,
      nativeParent,
      nativeContainerInfo,
      context
    );
  },
  receiveComponent: function() {
  },
  getNativeNode: function() {
    return ReactReconciler.getNativeNode(this._renderedComponent);
  },
  unmountComponent: function(rootID, transaction, context) {
    ReactReconciler.unmountComponent(this._renderedComponent);
    this._rootNodeID = null;
    this._renderedComponent = null;
  },
});

ReactEmptyComponent.injection = ReactEmptyComponentInjection;

module.exports = ReactEmptyComponent;
