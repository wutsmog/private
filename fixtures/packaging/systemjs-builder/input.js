import React from 'react';
import ReactDOM from 'react-dom';

var CSSTransitionGroup = React.addons.CSSTransitionGroup;
ReactDOM.render(
  React.createElement(CSSTransitionGroup, {
    transitionName: 'example',
    transitionAppear: true,
    transitionAppearTimeout: 500,
    transitionEnterTimeout: 0,
    transitionLeaveTimeout: 0,
  }, React.createElement('h1', null,
    'Hello World!'
  )),
  document.getElementById('container')
);
