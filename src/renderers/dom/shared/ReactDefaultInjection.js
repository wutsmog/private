/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactDefaultInjection
 */

'use strict';

var ARIADOMPropertyConfig = require('ARIADOMPropertyConfig');
var BeforeInputEventPlugin = require('BeforeInputEventPlugin');
var DOMProperty = require('DOMProperty');
var ChangeEventPlugin = require('ChangeEventPlugin');
var DefaultEventPluginOrder = require('DefaultEventPluginOrder');
var EnterLeaveEventPlugin = require('EnterLeaveEventPlugin');
var EventPluginHub = require('EventPluginHub');
var EventPluginUtils = require('EventPluginUtils');
var HTMLDOMPropertyConfig = require('HTMLDOMPropertyConfig');
var ReactBrowserEventEmitter = require('ReactBrowserEventEmitter');
var ReactComponentEnvironment = require('ReactComponentEnvironment');
var ReactComponentBrowserEnvironment =
  require('ReactComponentBrowserEnvironment');
var ReactDOMComponent = require('ReactDOMComponent');
var ReactDOMComponentTree = require('ReactDOMComponentTree');
var ReactDOMEmptyComponent = require('ReactDOMEmptyComponent');
var ReactDOMTreeTraversal = require('ReactDOMTreeTraversal');
var ReactDOMTextComponent = require('ReactDOMTextComponent');
var ReactDefaultBatchingStrategy = require('ReactDefaultBatchingStrategy');
var ReactEmptyComponent = require('ReactEmptyComponent');
var ReactEventListener = require('ReactEventListener');
var ReactHostComponent = require('ReactHostComponent');
var ReactReconcileTransaction = require('ReactReconcileTransaction');
var ReactUpdates = require('ReactUpdates');
var SVGDOMPropertyConfig = require('SVGDOMPropertyConfig');
var SelectEventPlugin = require('SelectEventPlugin');
var SimpleEventPlugin = require('SimpleEventPlugin');

var alreadyInjected = false;

function inject() {
  if (alreadyInjected) {
    // TODO: This is currently true because these injections are shared between
    // the client and the server package. They should be built independently
    // and not share any injection state. Then this problem will be solved.
    return;
  }
  alreadyInjected = true;

  ReactBrowserEventEmitter.injection.injectReactEventListener(
    ReactEventListener
  );

  /**
   * Inject modules for resolving DOM hierarchy and plugin ordering.
   */
  EventPluginHub.injection.injectEventPluginOrder(DefaultEventPluginOrder);
  EventPluginUtils.injection.injectComponentTree(ReactDOMComponentTree);
  EventPluginUtils.injection.injectTreeTraversal(ReactDOMTreeTraversal);

  /**
   * Some important event plugins included by default (without having to require
   * them).
   */
  EventPluginHub.injection.injectEventPluginsByName({
    SimpleEventPlugin: SimpleEventPlugin,
    EnterLeaveEventPlugin: EnterLeaveEventPlugin,
    ChangeEventPlugin: ChangeEventPlugin,
    SelectEventPlugin: SelectEventPlugin,
    BeforeInputEventPlugin: BeforeInputEventPlugin,
  });

  ReactHostComponent.injection.injectGenericComponentClass(
    ReactDOMComponent
  );

  ReactHostComponent.injection.injectTextComponentClass(
    ReactDOMTextComponent
  );

  DOMProperty.injection.injectDOMPropertyConfig(ARIADOMPropertyConfig);
  DOMProperty.injection.injectDOMPropertyConfig(HTMLDOMPropertyConfig);
  DOMProperty.injection.injectDOMPropertyConfig(SVGDOMPropertyConfig);

  ReactEmptyComponent.injection.injectEmptyComponentFactory(
    function(instantiate) {
      return new ReactDOMEmptyComponent(instantiate);
    }
  );

  ReactUpdates.injection.injectReconcileTransaction(
    ReactReconcileTransaction
  );
  ReactUpdates.injection.injectBatchingStrategy(
    ReactDefaultBatchingStrategy
  );

  ReactComponentEnvironment.injection.injectEnvironment(ReactComponentBrowserEnvironment);
}

module.exports = {
  inject: inject,
};
