```javascript
/**
 *  在组件的原型上设置setState方法
 */
ReactComponent.prototype.isReactComponent = {};
/**
 * 发现这里需要接受两个参数
 * 第一个参数是需要修改的state对象或者是一个函数 (preState:更新前的sate,props:当前的属性) 这个后面会讲到
 * 第二个参数是修改完state的执行的回调函数
 */
ReactComponent.prototype.setState = function(partialState, callback) {
	//这里的this.updater就是ReactUpdateQueue,--- this是组件的实例
  this.updater.enqueueSetState(this, partialState);
  if (callback) {
    this.updater.enqueueCallback(this, callback, 'setState');
  }
};

/**
 * 调用this.updater.enqueueSetState(this, partialState);
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

/**
 * 调用enqueueUpdate(internalInstance);
 */
function enqueueUpdate(internalInstance) {
  ReactUpdates.enqueueUpdate(internalInstance);
}
/**
 * 继续, 这里就是关键了
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
 * 调用batchingStrategy.batchedUpdates(enqueueUpdate, component);
 * ReactDefaultBatchingStrategy实际上是一个批量更新策略
 */
var ReactDefaultBatchingStrategy = {
    isBatchingUpdates: false,
    /**
     *  1.  alreadyBatchingUpdates 保存 ReactDefaultBatchingStrategy.isBatchingUpdates的值
     *  2.  将ReactDefaultBatchingStrategy.isBatchingUpdates的值改为true,意为开启批量更新
     *  3.  如果旧的状态(alreadyBatchingUpdates == true) 执行回调函数
     *  4.  如果旧的状态(alreadyBatchingUpdates == false) 没有开启批量更新,则调用事物的perform()执行回调函数
     *
     *  参数
     *      enqueueUpdate: 更新队列函数,就是调用batchedUpdates的函数
     *      a, b, c, d, e: component
     *
     *
     *  捋一下
     *      1.  当 batchingStrategy.isBatchingUpdates 为false时,会执行batchingStrategy.batchedUpdates()方法
     *          然后调用事物的preform()执行回调函数
     *      2.  当batchingStrategy.isBatchingUpdates 为true时,就会开启批量更新模式
     *
     *  问题
     *      1. transaction.perform()做了些什么
     *
     * 	这里有一个非常有意思的事情
     * 		如果ReactDefaultBatchingStrategy.isBatchingUpdates == true 的时候根本就不会进入到这个batchedUpdates()方法中,
     * 		看上一个方法的判断,所以进来的时候一定是false
     */
    batchedUpdates: function(callback, a, b, c, d, e) {
		//第一次的时候为false
        var alreadyBatchingUpdates = ReactDefaultBatchingStrategy.isBatchingUpdates;
		//然后改成true,体会下什么时候在改成true
        ReactDefaultBatchingStrategy.isBatchingUpdates = true;

        if (alreadyBatchingUpdates) {
            return callback(a, b, c, d, e);
        } else {
            return transaction.perform(callback, null, a, b, c, d, e);
        }
    },
};

/**
 * 涉及到了事物
 * 		Transaction会给每一个需要执行的方法包装一个wrapper,而这个wrapper内有两个方法 initialize 与 close
 * 		当要执行目标方法前要先执行 initialize() 然后才是目标方法 之后再执行close
 * 		而这里 initialize() 是空函数
 * 简而言之就是wrapper(initialize,perform,close)顺序执行,而initialize还是个空函数,所以执行完perform,再执行close
 * 
 * RESET_BATCHED_UPDATES,FLUSH_BATCHED_UPDATES 定义了两个wrapper
 * RESET_BATCHED_UPDATES 负责在close阶段重置 ReactDefaultBatchingStrategy.isBatchingUpdates = false;
 * 然后把这两个放到一个数组中,在ReactDefaultBatchingStrategyTransaction的原型上绑定getTransactionWrappers用于返回wrapper的数组
 */
var RESET_BATCHED_UPDATES = {
  initialize: emptyFunction,
  close: function() {
    ReactDefaultBatchingStrategy.isBatchingUpdates = false;
  },
};
/**
 * 负责在close阶段 执行ReactUpdates.flushBatchedUpdates.bind(ReactUpdates),
 */
var FLUSH_BATCHED_UPDATES = {
  initialize: emptyFunction,
  close: ReactUpdates.flushBatchedUpdates.bind(ReactUpdates),
};

var TRANSACTION_WRAPPERS = [FLUSH_BATCHED_UPDATES, RESET_BATCHED_UPDATES];

function ReactDefaultBatchingStrategyTransaction() {
  this.reinitializeTransaction();
}
/**
 *  把wrapper绑定到ReactDefaultBatchingStrategyTransaction的原型上
 */
Object.assign(ReactDefaultBatchingStrategyTransaction.prototype, Transaction, {
  getTransactionWrappers: function() {
    return TRANSACTION_WRAPPERS;
  },
});

/**
 * 	FLUSH_BATCHED_UPDATES.close=>ReactUpdates.flushBatchedUpdates.bind(ReactUpdates),
 *  该方法用于迭代 dirtyComponents=>回答了上面的问题
 *  
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
 * 执行runBatchedUpdates()
 * 根据名称就知道这个方法是执行批量更新
 */
function runBatchedUpdates(transaction) {
  var len = transaction.dirtyComponentsLength;
  dirtyComponents.sort(mountOrderComparator);//排序,保证更新的顺序
  updateBatchNumber++;
  for (var i = 0; i < len; i++) {
    var component = dirtyComponents[i];
    //在组件中获取回调函数
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
 * 然后关键 ReactReconciler.performUpdateIfNecessary( component, transaction.reconcileTransaction, updateBatchNumber, );
 */
  performUpdateIfNecessary: function(internalInstance,transaction,updateBatchNumber,) {
    if (internalInstance._updateBatchNumber !== updateBatchNumber) {
      return;
    }
    internalInstance.performUpdateIfNecessary(transaction);
  },
  /**
   * internalInstance.performUpdateIfNecessary(transaction);调用了实例的performUpdateIfNecessary方法,这个实例就是自定义组件的实例
   */
    // 如果存在 _pendingElement、_pendingStateQueue和_pendingForceUpdate，则更新组件
  performUpdateIfNecessary: function(transaction) {
    if (this._pendingElement != null) {
      ReactReconciler.receiveComponent(this, this._pendingElement,transaction,this._context,);
    } else if (this._pendingStateQueue !== null || this._pendingForceUpdate) {
      this.updateComponent(transaction,this._currentElement,this._currentElement,this._context,this._context,);
    } else {
      this._updateBatchNumber = null;
    }
  },
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
  /**
   * 调用了this._processPendingState(nextProps, nextContext)
   */
_processPendingState: function(props, context) {
    var inst = this._instance;
    var queue = this._pendingStateQueue;
    var replace = this._pendingReplaceState;
    this._pendingReplaceState = false;
    this._pendingStateQueue = null;
    //如果队列为null,返回原state
    if (!queue) {
      return inst.state;
    }
    //如果队列中有一个更新就返回这个更新值
    if (replace && queue.length === 1) {
      return queue[0];
    }
    //如果队列中有多个更新,就将他们合并
    var nextState = Object.assign({}, replace ? queue[0] : inst.state);
    for (var i = replace ? 1 : 0; i < queue.length; i++) {
      var partial = queue[i];
      //这里就是setState的第一个参数的另外一种情况,可以传入函数
      //这里用函数的形式,合并到了nextState上,就获取了最新的state值
      Object.assign(
        nextState,
        typeof partial === 'function'
          ? partial.call(inst, nextState, props, context)
          : partial,
      );
    }
    //返回了最新的state的值
    return nextState;
  },

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
	//这个时候才开始给实例的props和state,context赋值
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
  *	这里runBatchedUpdates的事物才执行完毕,也就是说在componentDidUpdate()之后调用事物的close,
  */
 


 /**
  * 再说说setState的第二个参数问题
  */
 
 ReactComponent.prototype.setState = function(partialState, callback) {
	//这里的this.updater就是ReactUpdateQueue,--- this是组件的实例
  this.updater.enqueueSetState(this, partialState);
  if (callback) {
    this.updater.enqueueCallback(this, callback, 'setState');
  }
};
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
/**
 * 最后又掉到了这里,就不重要了
 */
function enqueueUpdate(internalInstance) {
  ReactUpdates.enqueueUpdate(internalInstance);
}
/**
 * 回调函数是在setState执行完之后再执行的
 */

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
 * 以下是ReactUpdatesFlushTransaction定义
 * 在close的时候发现调用了this.callbackQueue.notifyAll();
 * 而notifyAll方法是取出回调函数开始执行
 */
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
  this.reconcileTransaction = ReactUpdates.ReactReconcileTransaction.getPooled(true,);
}

  /**
   * 执行回调函数
   */
  notifyAll() {
    var callbacks = this._callbacks;
    var contexts = this._contexts;
    var arg = this._arg;
    if (callbacks && contexts) {
      this._callbacks = null;
      this._contexts = null;
      for (var i = 0; i < callbacks.length; i++) {
        callbacks[i].call(contexts[i], arg);
      }
      callbacks.length = 0;
      contexts.length = 0;
    }
  }
```