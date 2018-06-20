/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactCompositeComponent
 */

'use strict';

var React = require('React');
var ReactComponentEnvironment = require('ReactComponentEnvironment');
var ReactCurrentOwner = require('ReactCurrentOwner');
var ReactErrorUtils = require('ReactErrorUtils');
var ReactInstanceMap = require('ReactInstanceMap');
var ReactInstrumentation = require('ReactInstrumentation');
var ReactNodeTypes = require('ReactNodeTypes');
var ReactReconciler = require('ReactReconciler');

if (__DEV__) {
  var checkReactTypeSpec = require('checkReactTypeSpec');
}

var emptyObject = require('emptyObject');
var invariant = require('invariant');
var shallowEqual = require('shallowEqual');
var shouldUpdateReactComponent = require('shouldUpdateReactComponent');
var warning = require('warning');

import type {ReactPropTypeLocations} from 'ReactPropTypeLocations';

var CompositeTypes = {
  ImpureClass: 0,
  PureClass: 1,
  StatelessFunctional: 2,
};

function StatelessComponent(Component) {}
StatelessComponent.prototype.render = function() {
  var Component = ReactInstanceMap.get(this)._currentElement.type;
  var element = Component(this.props, this.context, this.updater);
  return element;
};

function shouldConstruct(Component) {
  return !!(Component.prototype && Component.prototype.isReactComponent);
}

function isPureComponent(Component) {
  return !!(Component.prototype && Component.prototype.isPureReactComponent);
}

// Separated into a function to contain deoptimizations caused by try/finally.
function measureLifeCyclePerf(fn, debugID, timerType) {
  if (debugID === 0) {
    return fn();
  }

  ReactInstrumentation.debugTool.onBeginLifeCycleTimer(debugID, timerType);
  try {
    return fn();
  } finally {
    ReactInstrumentation.debugTool.onEndLifeCycleTimer(debugID, timerType);
  }
}

/**
 * ------------------ The Life-Cycle of a Composite Component ------------------
 *
 * - constructor: Initialization of state. The instance is now retained.
 *   - componentWillMount
 *   - render
 *   - [children's constructors]
 *     - [children's componentWillMount and render]
 *     - [children's componentDidMount]
 *     - componentDidMount
 *
 *       Update Phases:
 *       - componentWillReceiveProps (only called if parent updated)
 *       - shouldComponentUpdate
 *         - componentWillUpdate
 *           - render
 *           - [children's constructors or receive props phases]
 *         - componentDidUpdate
 *
 *     - componentWillUnmount
 *     - [children's componentWillUnmount]
 *   - [children destroyed]
 * - (destroyed): The instance is now blank, released by React and ready for GC.
 *
 * -----------------------------------------------------------------------------
 */

/**
 * An incrementing ID assigned to each component when it is mounted. This is
 * used to enforce the order in which `ReactUpdates` updates dirty components.
 *
 * @private
 */


/**
 * @lends {ReactCompositeComponent.prototype}
 */
var ReactCompositeComponent = {
  /**
   * Base constructor for all composite component.
   *
   * @param {ReactElement} element
   * @final
   * @internal
   */
  construct: function(element) {
    this._currentElement = element;
    this._rootNodeID = 0;
    this._compositeType = null;
    this._instance = null;
    this._hostParent = null;
    this._hostContainerInfo = null;

    // See ReactUpdateQueue
    this._updateBatchNumber = null;
    this._pendingElement = null;
    this._pendingStateQueue = null;
    this._pendingReplaceState = false;
    this._pendingForceUpdate = false;

    this._renderedNodeType = null;
    this._renderedComponent = null;
    this._context = null;
    this._mountOrder = 0;
    this._topLevelWrapper = null;
    // See ReactUpdates and ReactUpdateQueue.
    this._pendingCallbacks = null;
    // ComponentWillUnmount shall only be called once
    this._calledComponentWillUnmount = false;
  },

  /**
   * Initializes the component, renders markup, and registers event listeners.
   *
   * @param {ReactReconcileTransaction|ReactServerRenderingTransaction} transaction
   * @param {?object} hostParent
   * @param {?object} hostContainerInfo
   * @param {?object} context
   * @return {?string} Rendered markup to be inserted into the DOM.
   * @final
   * @internal
   */
  /**
   * 初始化组件,渲染标记,注册事件监听器
   */
  mountComponent: function(transaction,hostParent, hostContainerInfo, context, ) {
    //当前元素对应的上下文
    this._context = context;
    this._mountOrder = nextMountID++;
    this._hostParent = hostParent;
    this._hostContainerInfo = hostContainerInfo;
    var publicProps = this._currentElement.props;
    var publicContext = this._processContext(context);
    var Component = this._currentElement.type;
    var updateQueue = transaction.getUpdateQueue();
    var doConstruct = shouldConstruct(Component);
    //初始化公共类
    var inst = this._constructComponent(doConstruct, publicProps, publicContext,updateQueue,);
    var renderedElement;
    // 用于判断组件是否为stateless,无状态组件没有状态更新队列,只专注渲染
    if (!doConstruct && (inst == null || inst.render == null)) {
      renderedElement = inst;
      warnIfInvalidElement(Component, renderedElement);
      inst = new StatelessComponent(Component);
      this._compositeType = CompositeTypes.StatelessFunctional;
    } else {
      if (isPureComponent(Component)) {
        this._compositeType = CompositeTypes.PureClass;
      } else {
        this._compositeType = CompositeTypes.ImpureClass;
      }
    }
    // 这些初始化参数本应该在构造器中设置,在此设置是为了便于进行简单的类抽象
    inst.props = publicProps;
    inst.context = publicContext;
    inst.refs = emptyObject;
    inst.updater = updateQueue;
    this._instance = inst;
    // 将实例存储为一个引用
    ReactInstanceMap.set(inst, this);
    //初始化state
    var initialState = inst.state;
    if (initialState === undefined) {
      inst.state = initialState = null;
    }
    //初始化更新队列
    this._pendingStateQueue = null;
    this._pendingReplaceState = false;
    this._pendingForceUpdate = false;
    var markup;
    //如果挂载时发生错误
    if (inst.unstable_handleError) {
      markup = this.performInitialMountWithErrorHandling(renderedElement,hostParent, hostContainerInfo,transaction,context,);
    } else {
      //执行初始化挂载
      markup = this.performInitialMount(renderedElement, hostParent, hostContainerInfo, transaction,context,);
    }
    //如果存在componentDidMount,则调用
    if (inst.componentDidMount) {
      transaction.getReactMountReady().enqueue(inst.componentDidMount, inst);
    }
    return markup;
  },

  _constructComponent: function(
    doConstruct,
    publicProps,
    publicContext,
    updateQueue,
  ) {
      return this._constructComponentWithoutOwner(
        doConstruct,
        publicProps,
        publicContext,
        updateQueue,
      );
  },

  _constructComponentWithoutOwner: function(
    doConstruct,
    publicProps,
    publicContext,
    updateQueue,
  ) {
    var Component = this._currentElement.type;

    if (doConstruct) {
        return new Component(publicProps, publicContext, updateQueue);
    }
    return Component(publicProps, publicContext, updateQueue);
  },

  performInitialMountWithErrorHandling: function( renderedElement,  hostParent, hostContainerInfo, transaction, context, ) {
    var markup;
    var checkpoint = transaction.checkpoint();
    try {
      //捕捉错误,如果没有错误,则初始化挂载
      markup = this.performInitialMount( renderedElement,  hostParent, hostContainerInfo, transaction, context, );
    } catch (e) {
      transaction.rollback(checkpoint);
      this._instance.unstable_handleError(e);
      if (this._pendingStateQueue) {
        this._instance.state = this._processPendingState( this._instance.props, this._instance.context, );
      }
      checkpoint = transaction.checkpoint();
      //如果捕捉到错误,则执行unmountComponent()后在初始化挂载
      this._renderedComponent.unmountComponent(true);
      transaction.rollback(checkpoint);
      markup = this.performInitialMount(  renderedElement, hostParent, hostContainerInfo, transaction,  context, );
    }
    return markup;
  },

  performInitialMount: function( renderedElement,  hostParent, hostContainerInfo, transaction, context, ) {
    var inst = this._instance;
    var debugID = 0;
    //如果存在componentWillMount() 就调用
    if (inst.componentWillMount) {
      inst.componentWillMount();
      //在componentWillMount时调用setState,是不会触发re-render的,而是自动合并
      if (this._pendingStateQueue) {
        inst.state = this._processPendingState(inst.props, inst.context);
      }
    }
    //如果不是无状态组件,即可开始渲染
    if (renderedElement === undefined) {
      renderedElement = this._renderValidatedComponent();
    }
    var nodeType = ReactNodeTypes.getType(renderedElement);
    this._renderedNodeType = nodeType;
    // 得到 _currentElement 对应的 component 类实例
    var child = this._instantiateReactComponent(renderedElement, nodeType !== ReactNodeTypes.EMPTY );
    this._renderedComponent = child;
    //render递归渲染
    var markup = ReactReconciler.mountComponent( child,  transaction,  hostParent,  hostContainerInfo,
                                                  this._processChildContext(context),  debugID,);
    return markup;
  },

  getHostNode: function() {
    return ReactReconciler.getHostNode(this._renderedComponent);
  },

  /**
   * Releases any resources allocated by `mountComponent`.
   *
   * @final
   * @internal
   */
  unmountComponent: function(safely) {
    if (!this._renderedComponent) {
      return;
    }

    var inst = this._instance;
    //如果存在componentWillUnmount,则调用
    if (inst.componentWillUnmount && !inst._calledComponentWillUnmount) {
      inst._calledComponentWillUnmount = true;

      if (safely) {
        var name = this.getName() + '.componentWillUnmount()';
        ReactErrorUtils.invokeGuardedCallback(
          name,
          inst.componentWillUnmount.bind(inst),
        );
      } else {
          inst.componentWillUnmount();
      }
    }
    //如果组件已经渲染,则对组件进行componentWillUnmount()
    if (this._renderedComponent) {
      ReactReconciler.unmountComponent(this._renderedComponent, safely);
      this._renderedNodeType = null;
      this._renderedComponent = null;
      this._instance = null;
    }
    //重置相关参数、更新队列以及更新状态
    this._pendingStateQueue = null;
    this._pendingReplaceState = false;
    this._pendingForceUpdate = false;
    this._pendingCallbacks = null;
    this._pendingElement = null;

    this._context = null;
    this._rootNodeID = 0;
    this._topLevelWrapper = null;
    //删除这个实例
    ReactInstanceMap.remove(inst);
  },

  /**
   * Filters the context object to only contain keys specified in
   * `contextTypes`
   *
   * @param {object} context
   * @return {?object}
   * @private
   */
  _maskContext: function(context) {
    var Component = this._currentElement.type;
    var contextTypes = Component.contextTypes;
    if (!contextTypes) {
      return emptyObject;
    }
    var maskedContext = {};
    for (var contextName in contextTypes) {
      maskedContext[contextName] = context[contextName];
    }
    return maskedContext;
  },

  /**
   * Filters the context object to only contain keys specified in
   * `contextTypes`, and asserts that they are valid.
   *
   * @param {object} context
   * @return {?object}
   * @private
   */
  _processContext: function(context) {
    var maskedContext = this._maskContext(context);
    if (__DEV__) {
      var Component = this._currentElement.type;
      if (Component.contextTypes) {
        this._checkContextTypes(
          Component.contextTypes,
          maskedContext,
          'context',
        );
      }
    }
    return maskedContext;
  },

  /**
   * @param {object} currentContext
   * @return {object}
   * @private
   */
  _processChildContext: function(currentContext) {
    var Component = this._currentElement.type;
    var inst = this._instance;
    var childContext;

    if (inst.getChildContext) {
      if (__DEV__) {
        ReactInstrumentation.debugTool.onBeginProcessingChildContext();
        try {
          childContext = inst.getChildContext();
        } finally {
          ReactInstrumentation.debugTool.onEndProcessingChildContext();
        }
      } else {
        childContext = inst.getChildContext();
      }
    }

    if (childContext) {
      for (var name in childContext) {
        invariant(
          name in Component.childContextTypes,
          '%s.getChildContext(): key "%s" is not defined in childContextTypes.',
          this.getName() || 'ReactCompositeComponent',
          name,
        );
      }
      return Object.assign({}, currentContext, childContext);
    }
    return currentContext;
  },

  /**
   * Assert that the context types are valid
   *
   * @param {object} typeSpecs Map of context field to a ReactPropType
   * @param {object} values Runtime values that need to be type-checked
   * @param {string} location e.g. "prop", "context", "child context"
   * @private
   */
  _checkContextTypes: function(
    typeSpecs,
    values,
    location: ReactPropTypeLocations,
  ) {
    if (__DEV__) {
      checkReactTypeSpec(
        typeSpecs,
        values,
        location,
        this.getName(),
        null,
        this._debugID,
      );
    }
  },

  // receiveComponent 是通过调用 updateComponent 进行组件更新的
  receiveComponent: function(nextElement, transaction, nextContext) {
    var prevElement = this._currentElement;
    var prevContext = this._context;
    this._pendingElement = null;
    this.updateComponent(transaction,prevElement,nextElement,prevContext,nextContext,);
  },

  /**
   * If any of `_pendingElement`, `_pendingStateQueue`, or `_pendingForceUpdate`
   * is set, update the component.
   *
   * @param {ReactReconcileTransaction} transaction
   * @internal
   */
  performUpdateIfNecessary: function(transaction) {
    if (this._pendingElement != null) {
      ReactReconciler.receiveComponent(
        this,
        this._pendingElement,
        transaction,
        this._context,
      );
    } else if (this._pendingStateQueue !== null || this._pendingForceUpdate) {
      this.updateComponent(
        transaction,
        this._currentElement,
        this._currentElement,
        this._context,
        this._context,
      );
    } else {
      this._updateBatchNumber = null;
    }
  },

  /**
   * Perform an update to a mounted component. The componentWillReceiveProps and
   * shouldComponentUpdate methods are called, then (assuming the update isn't
   * skipped) the remaining update lifecycle methods are called and the DOM
   * representation is updated.
   *
   * By default, this implements React's rendering and reconciliation algorithm.
   * Sophisticated clients may wish to override this.
   *
   * @param {ReactReconcileTransaction} transaction
   * @param {ReactElement} prevParentElement
   * @param {ReactElement} nextParentElement
   * @internal
   * @overridable
   */
  updateComponent: function(transaction,prevParentElement,nextParentElement,prevUnmaskedContext,nextUnmaskedContext,) {
    var inst = this._instance;
    var willReceive = false;
    var nextContext;

    // 上下文是否改变
    if (this._context === nextUnmaskedContext) {
      nextContext = inst.context;
    } else {
      nextContext = this._processContext(nextUnmaskedContext);
      willReceive = true;
    }

    var prevProps = prevParentElement.props;
    var nextProps = nextParentElement.props;

    // 新旧属性不同
    if (prevParentElement !== nextParentElement) {
      willReceive = true;
    }
    //新旧属性不同,并且存在componentWillReceiveProps,就执行componentWillReceiveProps()
    if (willReceive && inst.componentWillReceiveProps) {
      inst.componentWillReceiveProps(nextProps, nextContext);
    }
    //将新的state合并到更新队列中,此时的nextState是最新的state
    var nextState = this._processPendingState(nextProps, nextContext);
    var shouldUpdate = true;
    //根据更新队列和shouldComponentUpdate的状态来判断是否需要更新组件
    if (!this._pendingForceUpdate) {
      if (inst.shouldComponentUpdate) {
        shouldUpdate = inst.shouldComponentUpdate(nextProps,nextState,nextContext,);
      } else {
        if (this._compositeType === CompositeTypes.PureClass) {
          shouldUpdate =!shallowEqual(prevProps, nextProps) ||!shallowEqual(inst.state, nextState);
        }
      }
    }

    this._updateBatchNumber = null;
    if (shouldUpdate) {
      //重置更新队列
      this._pendingForceUpdate = false;
      //即将更新this.props,this.state,和this.context
      this._performComponentUpdate(nextParentElement,nextProps, nextState,nextContext,transaction,nextUnmaskedContext,);
    } else {
      // 如果确定组件不更新,仍然要这是props和state
      this._currentElement = nextParentElement;
      this._context = nextUnmaskedContext;
      inst.props = nextProps;
      inst.state = nextState;
      inst.context = nextContext;
    }
  },

  _processPendingState: function(props, context) {
    var inst = this._instance;
    var queue = this._pendingStateQueue;
    var replace = this._pendingReplaceState;
    this._pendingReplaceState = false;
    this._pendingStateQueue = null;

    if (!queue) {
      return inst.state;
    }

    if (replace && queue.length === 1) {
      return queue[0];
    }

    var nextState = Object.assign({}, replace ? queue[0] : inst.state);
    for (var i = replace ? 1 : 0; i < queue.length; i++) {
      var partial = queue[i];
      Object.assign(
        nextState,
        typeof partial === 'function'
          ? partial.call(inst, nextState, props, context)
          : partial,
      );
    }

    return nextState;
  },

  /**
   * Merges new props and state, notifies delegate methods of update and
   * performs update.
   *
   * @param {ReactElement} nextElement Next element
   * @param {object} nextProps Next public object to set as properties.
   * @param {?object} nextState Next object to set as state.
   * @param {?object} nextContext Next public object to set as context.
   * @param {ReactReconcileTransaction} transaction
   * @param {?object} unmaskedContext
   * @private
   */
  /**
   * 当组件需要更新时,调用
   */
  _performComponentUpdate: function(nextElement,nextProps,nextState,nextContext,transaction,unmaskedContext) {
    var inst = this._instance;
    var hasComponentDidUpdate = Boolean(inst.componentDidUpdate);
    var prevProps;
    var prevState;
    var prevContext;
    //如果存在componentDidUpdate,则将当前的props,state和context保存一份
    if (hasComponentDidUpdate) {
      prevProps = inst.props;
      prevState = inst.state;
      prevContext = inst.context;
    }
    //执行componentWillUpdate
    if (inst.componentWillUpdate) {
      inst.componentWillUpdate(nextProps, nextState, nextContext);
    }
    //更新this.props,this.state,this.context
    this._currentElement = nextElement;
    this._context = unmaskedContext;
    inst.props = nextProps;
    inst.state = nextState;
    inst.context = nextContext;
    //渲染组件
    this._updateRenderedComponent(transaction, unmaskedContext);
    //当组件完成更新后,如果存在ComponentDidUpdate,则调用
    if (hasComponentDidUpdate) {
      transaction.getReactMountReady().enqueue(inst.componentDidUpdate.bind(inst,prevProps, prevState,prevContext,),inst,);
    }
  },

  /**
   * Call the component's `render` method and update the DOM accordingly.
   *
   * @param {ReactReconcileTransaction} transaction
   * @internal
   */
  /**
   * 调用render渲染组件
   */
  _updateRenderedComponent: function(transaction, context) {
    var prevComponentInstance = this._renderedComponent;
    var prevRenderedElement = prevComponentInstance._currentElement;
    var nextRenderedElement = this._renderValidatedComponent();

    var debugID = 0;
    //如果需要更新,则调用ReactReconciler.receiveComponent()继续更新组件
    if (shouldUpdateReactComponent(prevRenderedElement, nextRenderedElement)) {
      ReactReconciler.receiveComponent(prevComponentInstance,nextRenderedElement,transaction,this._processChildContext(context),);
    } else {
      //如果不需要更新,则渲染组件
      var oldHostNode = ReactReconciler.getHostNode(prevComponentInstance);
      ReactReconciler.unmountComponent(prevComponentInstance, false);

      var nodeType = ReactNodeTypes.getType(nextRenderedElement);
      this._renderedNodeType = nodeType;
      //得到 nextRenderedElement 对应的 component 类实例
      var child = this._instantiateReactComponent( nextRenderedElement,nodeType !== ReactNodeTypes.EMPTY );
      this._renderedComponent = child;
      //使用render递归渲染
      var nextMarkup = ReactReconciler.mountComponent(child,transaction,this._hostParent,this._hostContainerInfo,this._processChildContext(context),debugID,);

      this._replaceNodeWithMarkup(oldHostNode, nextMarkup,prevComponentInstance,);
    }
  },

  /**
   * Overridden in shallow rendering.
   *
   * @protected
   */
  _replaceNodeWithMarkup: function(oldHostNode, nextMarkup, prevInstance) {
    ReactComponentEnvironment.replaceNodeWithMarkup(
      oldHostNode,
      nextMarkup,
      prevInstance,
    );
  },

  /**
   * @protected
   */
  _renderValidatedComponentWithoutOwnerOrContext: function() {
    var inst = this._instance;
    var renderedElement;
    renderedElement = inst.render();
    return renderedElement;
  },

  /**
   * @private
   */
  _renderValidatedComponent: function() {
    var renderedElement;
    renderedElement = this._renderValidatedComponentWithoutOwnerOrContext();
    return renderedElement;
  },

  /**
   * Lazily allocates the refs object and stores `component` as `ref`.
   *
   * @param {string} ref Reference name.
   * @param {component} component Component to store as `ref`.
   * @final
   * @private
   */
  attachRef: function(ref, component) {
    var inst = this.getPublicInstance();
    invariant(inst != null, 'Stateless function components cannot have refs.');
    var publicComponentInstance = component.getPublicInstance();
    if (__DEV__) {
      var componentName = component && component.getName
        ? component.getName()
        : 'a component';
      warning(
        publicComponentInstance != null ||
          component._compositeType !== CompositeTypes.StatelessFunctional,
        'Stateless function components cannot be given refs ' +
          '(See ref "%s" in %s created by %s). ' +
          'Attempts to access this ref will fail.',
        ref,
        componentName,
        this.getName(),
      );
    }
    var refs = inst.refs === emptyObject ? (inst.refs = {}) : inst.refs;
    refs[ref] = publicComponentInstance;
  },

  /**
   * Detaches a reference name.
   *
   * @param {string} ref Name to dereference.
   * @final
   * @private
   */
  detachRef: function(ref) {
    var refs = this.getPublicInstance().refs;
    delete refs[ref];
  },

  /**
   * Get a text description of the component that can be used to identify it
   * in error messages.
   * @return {string} The name or null.
   * @internal
   */
  getName: function() {
    var type = this._currentElement.type;
    var constructor = this._instance && this._instance.constructor;
    return (
      type.displayName ||
      (constructor && constructor.displayName) ||
      type.name ||
      (constructor && constructor.name) ||
      null
    );
  },

  /**
   * Get the publicly accessible representation of this component - i.e. what
   * is exposed by refs and returned by render. Can be null for stateless
   * components.
   *
   * @return {ReactComponent} the public component instance.
   * @internal
   */
  getPublicInstance: function() {
    var inst = this._instance;
    if (this._compositeType === CompositeTypes.StatelessFunctional) {
      return null;
    }
    return inst;
  },

  // Stub
  _instantiateReactComponent: null,
};

module.exports = ReactCompositeComponent;
