/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule instantiateReactComponent
 */

'use strict';

var ReactCompositeComponent = require('ReactCompositeComponent');
var ReactEmptyComponent = require('ReactEmptyComponent');
var ReactHostComponent = require('ReactHostComponent');

var getNextDebugID = require('getNextDebugID');
var invariant = require('invariant');
var warning = require('warning');

// To avoid a cyclic dependency, we create the final class in this module
var ReactCompositeComponentWrapper = function(element) {
  this.construct(element);
};

function getDeclarationErrorAddendum(owner) {
  if (owner) {
    var name = owner.getName();
    if (name) {
      return ' Check the render method of `' + name + '`.';
    }
  }
  return '';
}

/**
 * Check if the type reference is a known internal type. I.e. not a user
 * provided composite type.
 *
 * @param {function} type
 * @return {boolean} Returns true if this is a valid internal type.
 */
function isInternalComponentType(type) {
  return (
    typeof type === 'function' &&
    typeof type.prototype !== 'undefined' &&
    typeof type.prototype.mountComponent === 'function' &&
    typeof type.prototype.receiveComponent === 'function'
  );
}

/**
 * Given a ReactNode, create an instance that will actually be mounted.
 *
 * @param {ReactNode} node
 * @param {boolean} shouldHaveDebugID
 * @return {object} A new instance of the element's constructor.
 * @protected
 */
//初始化组件的入口:已删除不在主线路线的代码
function instantiateReactComponent(node, shouldHaveDebugID) {
  var instance;
  if (node === null || node === false) {
    //node为空的时候创建一个空组件
    instance = ReactEmptyComponent.create(instantiateReactComponent);
  } else if (typeof node === 'object') {
    var element = node;
    // node为object并且element的type为string,创建dom组件
    if (typeof element.type === 'string') {
      instance = ReactHostComponent.createInternalComponent(element);
    } else if (isInternalComponentType(element.type)) {
      //不处理:不是字符串表示的自定义组件暂时无法使用,此处不做组件初始化操作
      instance = new element.type(element);
    } else {
      //创建自定义组件
      instance = new ReactCompositeComponentWrapper(element);
    }
  } else if (typeof node === 'string' || typeof node === 'number') {
    //创建文本组件
    instance = ReactHostComponent.createInstanceForText(node);
  } else {
    //不做处理
  }
  // 这两个字段被DOM和ART扩散算法使用
  instance._mountIndex = 0;
  instance._mountImage = null;
  return instance;
}

Object.assign(
  ReactCompositeComponentWrapper.prototype,
  ReactCompositeComponent,
  {
    _instantiateReactComponent: instantiateReactComponent,
  },
);

module.exports = instantiateReactComponent;
