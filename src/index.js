/**
 * 解析:
 *    如果isBatchingUpdates为true,则对所有队列中的更新执行batchedUpdates方法
 *    否则只把当前组件放入dirtyComponents中
 */

/**
 * RESET_BATCHED_UPDATES,FLUSH_BATCHED_UPDATES 定义了两个wrapper
 * RESET_BATCHED_UPDATES 负责在close阶段重置 ReactDefaultBatchingStrategy.isBatchingUpdates = false;
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

//将 wrapper绑定到ReactDefaultBatchingStrategyTransaction的原型上
Object.assign(ReactDefaultBatchingStrategyTransaction.prototype, Transaction, {
    getTransactionWrappers: function() {
        return TRANSACTION_WRAPPERS;
    },
});


var transaction = new ReactDefaultBatchingStrategyTransaction();
var updateBatchNumber = 0;
var dirtyComponents = [];
var batchingStrategy = null;


/**
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
     */
    batchedUpdates: function(callback, a, b, c, d, e) {
        var alreadyBatchingUpdates = ReactDefaultBatchingStrategy.isBatchingUpdates;

        ReactDefaultBatchingStrategy.isBatchingUpdates = true;

        if (alreadyBatchingUpdates) {
            return callback(a, b, c, d, e);
        } else {
            return transaction.perform(callback, null, a, b, c, d, e);
        }
    },
};



