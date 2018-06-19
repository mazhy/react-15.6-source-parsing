/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactDOMTextComponent
 */

'use strict';

var DOMChildrenOperations = require('DOMChildrenOperations');
var DOMLazyTree = require('DOMLazyTree');
var ReactDOMComponentTree = require('ReactDOMComponentTree');

var escapeTextContentForBrowser = require('escapeTextContentForBrowser');
var invariant = require('invariant');
var validateDOMNesting = require('validateDOMNesting');

/**
 * Text nodes violate a couple assumptions that React makes about components:
 *
 *  - When mounting text into the DOM, adjacent text nodes are merged.
 *  - Text nodes cannot be assigned a React root ID.
 *
 * This component is used to wrap strings between comment nodes so that they
 * can undergo the same reconciliation that is applied to elements.
 *
 * TODO: Investigate representing React components in the DOM with text nodes.
 *
 * @class ReactDOMTextComponent
 * @extends ReactComponent
 * @internal
 */
var ReactDOMTextComponent = function(text) {
  //保存当前字符串
  this._currentElement = text;
  this._stringText = '' + text;
  //ReactDOMComponentTree时需要的参数
  this._hostNode = null;
  this._hostParent = null;
  //属性
  this._domID = 0;
  this._mountIndex = 0;
  this._closingComment = null;
  this._commentNodes = null;
};

Object.assign(ReactDOMTextComponent.prototype, {
  mountComponent: function(transaction, hostParent, hostContainerInfo, context, ) {
    var domID = hostContainerInfo._idCounter++;
    var openingValue = ' react-text: ' + domID + ' ';
    var closingValue = ' /react-text ';
    this._domID = domID;
    this._hostParent = hostParent;
    //根据transaction.useCreateElement判断文本是否是通过createElement方法创建的节点
    if (transaction.useCreateElement) {
      //如果是createElement创建的节点,为这个节点创建相应的标签和标识domID,这样就跟别的React节点一样,可以参与虚拟dom的diff权利
      var ownerDocument = hostContainerInfo._ownerDocument;
      var openingComment = ownerDocument.createComment(openingValue);
      var closingComment = ownerDocument.createComment(closingValue);
      var lazyTree = DOMLazyTree(ownerDocument.createDocumentFragment());
      //开始标签
      DOMLazyTree.queueChild(lazyTree, DOMLazyTree(openingComment));
      //如果是文本类型,则创建文本节点
      if (this._stringText) {
        DOMLazyTree.queueChild(
          lazyTree,
          DOMLazyTree(ownerDocument.createTextNode(this._stringText)),
        );
      }
      //结束标签
      DOMLazyTree.queueChild(lazyTree, DOMLazyTree(closingComment));
      ReactDOMComponentTree.precacheNode(this, openingComment);
      this._closingComment = closingComment;
      return lazyTree;
    } else {
      //如果不是通过createElemet创建的节点,则直接返回文本
      var escapedText = escapeTextContentForBrowser(this._stringText);//boolean number转为字符串
      //静态页面下直接返回文本
      if (transaction.renderToStaticMarkup) {
        return escapedText;
      }
      //如果不是通过createElement创建的文本,则将标签和属性注释掉,直接返回文本内容
      return ( '<!--' + openingValue + '-->' + escapedText + '<!--' + closingValue + '-->' );
    }
  },

  /**
   * Updates this component by updating the text content.
   *
   * @param {ReactText} nextText The next text content
   * @param {ReactReconcileTransaction} transaction
   * @internal
   */
  //更新文本内容
  receiveComponent: function(nextText, transaction) {
    if (nextText !== this._currentElement) {
      this._currentElement = nextText;
      var nextStringText = '' + nextText;
      if (nextStringText !== this._stringText) {
        this._stringText = nextStringText;
        var commentNodes = this.getHostNode();
        //更新文本内容
        DOMChildrenOperations.replaceDelimitedText(
          commentNodes[0],
          commentNodes[1],
          nextStringText,
        );
      }
    }
  },

  getHostNode: function() {
    var hostNode = this._commentNodes;
    if (hostNode) {
      return hostNode;
    }
    if (!this._closingComment) {
      var openingComment = ReactDOMComponentTree.getNodeFromInstance(this);
      var node = openingComment.nextSibling;
      while (true) {
        invariant(
          node != null,
          'Missing closing comment for text component %s',
          this._domID,
        );
        if (node.nodeType === 8 && node.nodeValue === ' /react-text ') {
          this._closingComment = node;
          break;
        }
        node = node.nextSibling;
      }
    }
    hostNode = [this._hostNode, this._closingComment];
    this._commentNodes = hostNode;
    return hostNode;
  },

  unmountComponent: function() {
    this._closingComment = null;
    this._commentNodes = null;
    ReactDOMComponentTree.uncacheNode(this);
  },
});

module.exports = ReactDOMTextComponent;
