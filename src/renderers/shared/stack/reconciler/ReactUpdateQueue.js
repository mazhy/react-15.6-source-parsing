/**
 * Copyright 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactUpdateQueue
 */

'use strict';

var ReactCurrentOwner = require('ReactCurrentOwner');
var ReactInstanceMap = require('ReactInstanceMap');
var ReactInstrumentation = require('ReactInstrumentation');
var ReactUpdates = require('ReactUpdates');

var invariant = require('invariant');
var warning = require('warning');

function enqueueUpdate(internalInstance) {
  ReactUpdates.enqueueUpdate(internalInstance);
}

function formatUnexpectedArgument(arg) {
  var type = typeof arg;
  if (type !== 'object') {
    return type;
  }
  var displayName = (arg.constructor && arg.constructor.name) || type;
  var keys = Object.keys(arg);
  if (keys.length > 0 && keys.length < 20) {
    return `${displayName} (keys: ${keys.join(', ')})`;
  }
  return displayName;
}

function getInternalInstanceReadyForUpdate(publicInstance, callerName) {
  var internalInstance = ReactInstanceMap.get(publicInstance);
  if (!internalInstance) {
    return null;
  }
  return internalInstance;
}

/**
 * ReactUpdateQueue allows for state updates to be scheduled into a later
 * reconciliation step.
 */
var ReactUpdateQueue = {
  /**
   * Checks whether or not this composite component is mounted.
   * @param {ReactClass} publicInstance The instance we want to test.
   * @return {boolean} True if mounted, false otherwise.
   * @protected
   * @final
   */
  isMounted: function(publicInstance) {
    if (__DEV__) {
      var owner = ReactCurrentOwner.current;
      if (owner !== null) {
        warning(
          owner._warnedAboutRefsInRender,
          '%s is accessing isMounted inside its render() function. ' +
            'render() should be a pure function of props and state. It should ' +
            'never access something that requires stale data from the previous ' +
            'render, such as refs. Move this logic to componentDidMount and ' +
            'componentDidUpdate instead.',
          owner.getName() || 'A component',
        );
        owner._warnedAboutRefsInRender = true;
      }
    }
    var internalInstance = ReactInstanceMap.get(publicInstance);
    if (internalInstance) {
      // During componentWillMount and render this will still be null but after
      // that will always render to something. At least for now. So we can use
      // this hack.
      return !!internalInstance._renderedComponent;
    } else {
      return false;
    }
  },

  /**
   * 跟enqueueSetState 类似
   * 执行这个方法最主要的就是将回调函数绑定到了internalInstance._pendingCallbacks上
   */
  enqueueCallback: function(publicInstance, callback, callerName) {
    var internalInstance = getInternalInstanceReadyForUpdate(publicInstance);
    if (!internalInstance) {
      return null;
    }
    //就是初始化_pendingCallbacks
    if (internalInstance._pendingCallbacks) {
      internalInstance._pendingCallbacks.push(callback);
    } else {
      internalInstance._pendingCallbacks = [callback];
    }

    enqueueUpdate(internalInstance);
  },

  enqueueCallbackInternal: function(internalInstance, callback) {
    if (internalInstance._pendingCallbacks) {
      internalInstance._pendingCallbacks.push(callback);
    } else {
      internalInstance._pendingCallbacks = [callback];
    }
    enqueueUpdate(internalInstance);
  },

  /**
   * Forces an update. This should only be invoked when it is known with
   * certainty that we are **not** in a DOM transaction.
   *
   * You may want to call this when you know that some deeper aspect of the
   * component's state has changed but `setState` was not called.
   *
   * This will not invoke `shouldComponentUpdate`, but it will invoke
   * `componentWillUpdate` and `componentDidUpdate`.
   *
   * @param {ReactClass} publicInstance The instance that should rerender.
   * @internal
   */
  enqueueForceUpdate: function(publicInstance) {
    var internalInstance = getInternalInstanceReadyForUpdate(
      publicInstance,
      'forceUpdate',
    );

    if (!internalInstance) {
      return;
    }

    internalInstance._pendingForceUpdate = true;

    enqueueUpdate(internalInstance);
  },

  /**
   * Replaces all of the state. Always use this or `setState` to mutate state.
   * You should treat `this.state` as immutable.
   *
   * There is no guarantee that `this.state` will be immediately updated, so
   * accessing `this.state` after calling this method may return the old value.
   *
   * @param {ReactClass} publicInstance The instance that should rerender.
   * @param {object} completeState Next state.
   * @internal
   */
  enqueueReplaceState: function(publicInstance, completeState, callback) {
    var internalInstance = getInternalInstanceReadyForUpdate(
      publicInstance,
      'replaceState',
    );

    if (!internalInstance) {
      return;
    }

    internalInstance._pendingStateQueue = [completeState];
    internalInstance._pendingReplaceState = true;

    // Future-proof 15.5
    if (callback !== undefined && callback !== null) {
      ReactUpdateQueue.validateCallback(callback, 'replaceState');
      if (internalInstance._pendingCallbacks) {
        internalInstance._pendingCallbacks.push(callback);
      } else {
        internalInstance._pendingCallbacks = [callback];
      }
    }

    enqueueUpdate(internalInstance);
  },

  /**
   * Sets a subset of the state. This only exists because _pendingState is
   * internal. This provides a merging strategy that is not available to deep
   * properties which is confusing. TODO: Expose pendingState or don't use it
   * during the merge.
   *
   * @param {ReactClass} publicInstance The instance that should rerender.
   * @param {object} partialState Next partial state to be merged with state.
   * @internal
   */
  enqueueSetState: function(publicInstance, partialState) {
      //获取当前实例
      //实例中有两个非常重要的属性
      //_pendingStateQueue(待更新队列) 与 _pendingCallbacks(更新回调队列)
    var internalInstance = getInternalInstanceReadyForUpdate( publicInstance, 'setState',  );
    if (!internalInstance) {
      return;
    }
    //初始化待更新队列
    var queue = internalInstance._pendingStateQueue || (internalInstance._pendingStateQueue = []);
    queue.push(partialState);
    enqueueUpdate(internalInstance);
  },

  enqueueElementInternal: function(internalInstance, nextElement, nextContext) {
    internalInstance._pendingElement = nextElement;
    // TODO: introduce _pendingContext instead of setting it directly.
    internalInstance._context = nextContext;
    enqueueUpdate(internalInstance);
  },

  validateCallback: function(callback, callerName) {
    invariant(
      !callback || typeof callback === 'function',
      '%s(...): Expected the last optional `callback` argument to be a ' +
        'function. Instead received: %s.',
      callerName,
      formatUnexpectedArgument(callback),
    );
  },
};

module.exports = ReactUpdateQueue;
