/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactUpdates
 */

'use strict';

var CallbackQueue = require('CallbackQueue');
var PooledClass = require('PooledClass');
var ReactFeatureFlags = require('ReactFeatureFlags');
var ReactReconciler = require('ReactReconciler');
var Transaction = require('Transaction');

var invariant = require('invariant');

var dirtyComponents = [];
var updateBatchNumber = 0;
var asapCallbackQueue = CallbackQueue.getPooled();
var asapEnqueued = false;

var batchingStrategy = null;

function ensureInjected() {
  invariant(
    ReactUpdates.ReactReconcileTransaction && batchingStrategy,
    'ReactUpdates: must inject a reconcile transaction class and batching ' +
      'strategy',
  );
}

var NESTED_UPDATES = {
  initialize: function() {
    this.dirtyComponentsLength = dirtyComponents.length;
  },
  close: function() {
    if (this.dirtyComponentsLength !== dirtyComponents.length) {
      dirtyComponents.splice(0, this.dirtyComponentsLength);
      flushBatchedUpdates();
    } else {
      dirtyComponents.length = 0;
    }
  },
};

var UPDATE_QUEUEING = {
  initialize: function() {
    this.callbackQueue.reset();
  },
  close: function() {
    this.callbackQueue.notifyAll();
  },
};

var TRANSACTION_WRAPPERS = [NESTED_UPDATES, UPDATE_QUEUEING];

function ReactUpdatesFlushTransaction() {
  this.reinitializeTransaction();
  this.dirtyComponentsLength = null;
  this.callbackQueue = CallbackQueue.getPooled();
  this.reconcileTransaction = ReactUpdates.ReactReconcileTransaction.getPooled(
    /* useCreateElement */ true,
  );
}

Object.assign(ReactUpdatesFlushTransaction.prototype, Transaction, {
  getTransactionWrappers: function() {
    return TRANSACTION_WRAPPERS;
  },

  destructor: function() {
    this.dirtyComponentsLength = null;
    CallbackQueue.release(this.callbackQueue);
    this.callbackQueue = null;
    ReactUpdates.ReactReconcileTransaction.release(this.reconcileTransaction);
    this.reconcileTransaction = null;
  },

  perform: function(method, scope, a) {
    // Essentially calls `this.reconcileTransaction.perform(method, scope, a)`
    // with this transaction's wrappers around it.
    return Transaction.perform.call(
      this,
      this.reconcileTransaction.perform,
      this.reconcileTransaction,
      method,
      scope,
      a,
    );
  },
});

PooledClass.addPoolingTo(ReactUpdatesFlushTransaction);

function batchedUpdates(callback, a, b, c, d, e) {
  ensureInjected();
  return batchingStrategy.batchedUpdates(callback, a, b, c, d, e);
}

function mountOrderComparator(c1, c2) {
  return c1._mountOrder - c2._mountOrder;
}

/**
 * 根据名称就知道这个方法是执行批量更新
 */
function runBatchedUpdates(transaction) {
  var len = transaction.dirtyComponentsLength;
  dirtyComponents.sort(mountOrderComparator);//排序
  updateBatchNumber++;
  for (var i = 0; i < len; i++) {
    var component = dirtyComponents[i];
    var callbacks = component._pendingCallbacks;
    component._pendingCallbacks = null;

    var markerName;
    if (ReactFeatureFlags.logTopLevelRenders) {
      var namedComponent = component;
      if (component._currentElement.type.isReactTopLevelWrapper) {
        namedComponent = component._renderedComponent;
      }
      markerName = 'React update: ' + namedComponent.getName();
      console.time(markerName);
    }
    //经过一些列处理 其实就是调用了component.performUpdateIfNecessary,也就是自定义组件ReactCompositeComponent.performUpdateIfNecessary()
    ReactReconciler.performUpdateIfNecessary( component, transaction.reconcileTransaction, updateBatchNumber, );

    if (markerName) {
      console.timeEnd(markerName);
    }

    if (callbacks) {
      for (var j = 0; j < callbacks.length; j++) {
        transaction.callbackQueue.enqueue( callbacks[j], component.getPublicInstance());
      }
    }
  }
}

/**
 *  该方法用于迭代dirtyComponents
 */
var flushBatchedUpdates = function() {
    while (dirtyComponents.length || asapEnqueued) {
        if (dirtyComponents.length) {
            var transaction = ReactUpdatesFlushTransaction.getPooled();
            //又以事物的形式调用了 runBatchedUpdates()
            transaction.perform(runBatchedUpdates, null, transaction);
            //释放实例
            ReactUpdatesFlushTransaction.release(transaction);
        }

        if (asapEnqueued) {
            asapEnqueued = false;
            var queue = asapCallbackQueue;
            asapCallbackQueue = CallbackQueue.getPooled();
            queue.notifyAll();
            CallbackQueue.release(queue);
        }
    }
};

/**
 * 解析:
 *    如果isBatchingUpdates为true,则对所有队列中的更新执行batchedUpdates方法
 *    否则只把当前组件放入dirtyComponents中
 * 调用enqueueUpdate()
 *     1. batchingStrategy.isBatchingUpdates == true  就是开启批量更新模式,所以会加到数组中  dirtyComponents.push(component);
 *     2. batchingStrategy.isBatchingUpdates == false 就是关闭批量更新模式,所以会执行batchingStrategy.batchedUpdates(enqueueUpdate, component);
 *
 *  问题
 *      1. batchingStrategy.batchedUpdates(enqueueUpdate, component); 做了些什么???
 *      2. dirtyComponents 最后经历了什么???
 *
 *  问题一
 *      调用batchingStrategy.batchedUpdates()
 *      参数解析enqueueUpdate, component
 *      实际调用了ReactDefaultBatchingStrategy对象的batchedUpdates()方法
 *
 */
function enqueueUpdate(component) {
    //如果不处于批量更新模式
    if (!batchingStrategy.isBatchingUpdates) {
        batchingStrategy.batchedUpdates(enqueueUpdate, component);
        return;
    }
    //如果处于批量更新模式,则将该组件保存在dirtyComponents数组中
    dirtyComponents.push(component);
    if (component._updateBatchNumber == null) {
        component._updateBatchNumber = updateBatchNumber + 1;
    }
}

/**
 * Enqueue a callback to be run at the end of the current batching cycle. Throws
 * if no updates are currently being performed.
 */
function asap(callback, context) {
  invariant(
    batchingStrategy.isBatchingUpdates,
    "ReactUpdates.asap: Can't enqueue an asap callback in a context where" +
      'updates are not being batched.',
  );
  asapCallbackQueue.enqueue(callback, context);
  asapEnqueued = true;
}

var ReactUpdatesInjection = {
  injectReconcileTransaction: function(ReconcileTransaction) {
    invariant(
      ReconcileTransaction,
      'ReactUpdates: must provide a reconcile transaction class',
    );
    ReactUpdates.ReactReconcileTransaction = ReconcileTransaction;
  },

  injectBatchingStrategy: function(_batchingStrategy) {
    batchingStrategy = _batchingStrategy;
  },
};

var ReactUpdates = {
  /**
   * React references `ReactReconcileTransaction` using this property in order
   * to allow dependency injection.
   *
   * @internal
   */
  ReactReconcileTransaction: null,

  batchedUpdates: batchedUpdates,
  enqueueUpdate: enqueueUpdate,
  flushBatchedUpdates: flushBatchedUpdates,
  injection: ReactUpdatesInjection,
  asap: asap,
};

module.exports = ReactUpdates;
