1.ReactDOM.render 开始要渲染组件
2.如果执行更新组件
3.创建组件,根据参数,看创建什么类型的组件并返回
4.根据当前的批处理策略进行更新处理
5.通过setInnerHTML方式将html加入到dom中


生命周期只存在于自定义组件中

# 渲染流程
## 1.jsx创建的虚拟元素会被编译成React的createElement方法
```javascript
var ReactElement = function(type, key, ref, self, source, owner, props) {
  var element = {
    // 这个标签允许我们将其作为一个反应元素进行唯一的识别
    $$typeof: REACT_ELEMENT_TYPE,

    // 属于元素的内置属性
    type: type,
    key: key,
    ref: ref,
    props: props,

    // 记录负责创建该元素的组件
    _owner: owner,
  };
  return element;
};

ReactElement.createElement = function(type, config, children) {
  //初始化参数
  var propName;
  var props = {};
  var key = null;
  var ref = null;
  var self = null;
  var source = null;
  //如果存在cinfig就提取里面的内容
  if (config != null) {
    //如果存在ref,key就赋值属性
    if (hasValidRef(config)) {
      ref = config.ref;
    }
    if (hasValidKey(config)) {
      key = '' + config.key;
    }
    self = config.__self === undefined ? null : config.__self;
    source = config.__source === undefined ? null : config.__source;
    //复制config里的内容到props中,除了上面赋值的这些属性
    for (propName in config) {
      if (hasOwnProperty.call(config, propName) &&!RESERVED_PROPS.hasOwnProperty(propName)) {
        props[propName] = config[propName];
      }
    }
  }
  //处理children,全部挂载到props的children属性上,如果只有一个参数,直接赋值给children,否则合并处理
  var childrenLength = arguments.length - 2;
  if (childrenLength === 1) {
    props.children = children;
  } else if (childrenLength > 1) {
    var childArray = Array(childrenLength);
    for (var i = 0; i < childrenLength; i++) {
      childArray[i] = arguments[i + 2];
    }
    props.children = childArray;//合并成名为childArray的数组
  }
  //如果某个prop为空且存在默认的prop,则将默认prop赋给当前的prop
  if (type && type.defaultProps) {
    var defaultProps = type.defaultProps;
    for (propName in defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = defaultProps[propName];
      }
    }
  }
  //返回一个ReactElement实例对象
  return ReactElement( type,  key, ref, self, source, ReactCurrentOwner.current, props, );
};
```
##  2.创建组件

### 使用React创建组件,会先调用instantiateReactComponent, 这是初始化组件的入口,通过判断参数node的类型来区分创建什么类型的组件
  1. 当node为空时,说明node不存在,则初始化一个空的组件. ReactEmptyComponent.create(instantiateReactComponent)。
  2. 当node类型为对象时,那么就是DOM标签组件或者说是自定义组件,
      如果element类型(element = node,element.type='string')为字符串,就会初始化一个dom标签组件:ReactNativeComponent.createInternalComponent(element)，
  	否则就会初始化一个自定义组件 ReactCompositeComponentWrapper()
  3. 当node类型为字符串或者数字时,则初始化文本组件,ReactNativeComponent.createInstanceForText(node)。
  4. 其余情况不做处理
```javascript
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
```

### 2.1文本组件
1. 根据transaction.useCreateElement判断文本是不是通过createElement创建的节点
2. 是,则为这个节点创建标签和标识domID就可以参与虚拟dom的diff
3. 如果不是就直接返回文本


```javascript
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
});
```
### 2.2 DOM标签组件
1. 虚拟dom涵盖了原生的DOM标签,使用div不是原div,他是一个虚拟dom对象,标签名相同
2. 属性更新:更新样式,更新属性,处理事件
3. 子节点更新:更新内容,更新子节点,

#### 属性更新
```javascript
 /**
   * 在mountComponent中通过这个方法处理DOM节点的属性和时间
   * 1  如果存在事件,则针对当前的节点添加事件代理,既调用enqueuePutListener(this, propKey, propValue, transaction);
   * 2  如果存在样式,首先会对样式进行合并,Object.assign({},props.style,);然后通过CSSPropertyOperations.createMarkupForStyles( propValue,this,)创建样式
   * 3  通过DOMPropertyOperations.createMarkupForProperty(propKey,propValue,);创建属性
   * 4  通过DOMPropertyOperations.createMarkupForID(this._domID)创建唯一标识
   */
  _createOpenTagMarkupAndPutListeners: function(transaction, props) {
    var ret = '<' + this._currentElement.type;
    //for in + hasOwnProperty组合,for in会迭代原型链,hasOwnProperty只是该对象
    //迭代属性,如果属性不在该props上执行下次循环
    for (var propKey in props) {
      if (!props.hasOwnProperty(propKey)) {
        continue;
      }
      var propValue = props[propKey];
      if (propValue == null) {
        continue;//取出来的属性为null,执行下次循环
      }
      if (registrationNameModules.hasOwnProperty(propKey)) {//????应该是事件
        if (propValue) {
          //添加事件代理
          enqueuePutListener(this, propKey, propValue, transaction);
        }
      } else {
        if (propKey === STYLE) {
          if (propValue) {
            //如果有样式,合并样式
            propValue = this._previousStyleCopy = Object.assign({},props.style,);
          }
          //创建样式
          propValue = CSSPropertyOperations.createMarkupForStyles( propValue,this,);
        }
        //创建属性标识
        var markup = null;
        if (this._tag != null && isCustomComponent(this._tag, props)) {
          if (!RESERVED_PROPS.hasOwnProperty(propKey)) {
            markup = DOMPropertyOperations.createMarkupForCustomAttribute(propKey,propValue,);
          }
        } else {
          markup = DOMPropertyOperations.createMarkupForProperty(propKey,propValue,);
        }
        if (markup) {
          ret += ' ' + markup;
        }
      }
    }
    //静态页面,不设置react-id
    if (transaction.renderToStaticMarkup) {
      return ret;
    }
    //设置react-id
    if (!this._hostParent) {
      ret += ' ' + DOMPropertyOperations.createMarkupForRoot();
    }
    ret += ' ' + DOMPropertyOperations.createMarkupForID(this._domID);
    return ret;
  },

```

##### 当执行receiveComponent方法时,通过this.updateComponent()更新DOM节点属性
```javascript
  receiveComponent: function(nextElement, transaction, context) {
    var prevElement = this._currentElement;
    this._currentElement = nextElement;
    //更新DOM节点属性
    this.updateComponent(transaction, prevElement, nextElement, context);
  }
```

##### 在updateComponent中通过this._updateDOMProperties(lastProps, nextProps, transaction)更新DOM节点属性

```javascript
  /**
   * 先是删除不需要的旧属性
   *    如果不需要旧样式,则遍历旧样式集合,并对每个样式进行置空操作
   *    如果不需要事件,则将其的事件监听去掉,针对当前节点取消事件代理deleteListener(this, propKey)
   *    如果旧属性不在新属性集合中,则需要删除旧属性DOMPropertyOperations.deleteValueForProperty(getNode(this), propKey);
   * 然后更新新属性
   *    如果存在新样式,则将新样式进行合并Object.assign({}, nextProp)
   *    如果在旧样式中但不在新样式中,则清除该样式
   *    如果既在旧样式中也在新样式中,且不相同,则更新该样式styleUpdates[styleName] = nextProp[styleName];
   *    如果在新样式中,但不在旧样式中,则直接更新为新样式styleUpdates = nextProp;
   *    如果存在事件更新,则添加事件监听的属性enqueuePutListener(this, propKey, nextProp, transaction);
   *    如果存在新属性,则添加新属性,或者更新旧的同名属性DOMPropertyOperations.setValueForAttribute( getNode(this), propKey, nextProp, );
   * 
   */
  _updateDOMProperties: function(lastProps, nextProps, transaction) {
    var propKey;
    var styleName;
    var styleUpdates;
    for (propKey in lastProps) {
      //旧属性不在新属性集合中
      //新属性集合中包括旧属性or旧属性在旧属性原型链上or旧属性为null,执行下次循环,相当于删除了这个属性
      if ( nextProps.hasOwnProperty(propKey) || !lastProps.hasOwnProperty(propKey) || lastProps[propKey] == null ) {
        continue;
      }
      //从dom上删除不需要的样式??? TODO 这不是删除了所有样式吗
      if (propKey === STYLE) {
        var lastStyle = this._previousStyleCopy;
        for (styleName in lastStyle) {
          if (lastStyle.hasOwnProperty(styleName)) {
            styleUpdates = styleUpdates || {};
            styleUpdates[styleName] = '';
          }
        }
        this._previousStyleCopy = null;
      } else if (registrationNameModules.hasOwnProperty(propKey)) {
        if (lastProps[propKey]) {
          //去掉事件监听,取消事件代理
          deleteListener(this, propKey);
        }
      } else if (isCustomComponent(this._tag, lastProps)) {
        if (!RESERVED_PROPS.hasOwnProperty(propKey)) {
          DOMPropertyOperations.deleteValueForAttribute(getNode(this), propKey);
        }
      } else if (DOMProperty.properties[propKey] ||DOMProperty.isCustomAttribute(propKey)) {
        //删除不需要的属性
        DOMPropertyOperations.deleteValueForProperty(getNode(this), propKey);
      }
    }
    for (propKey in nextProps) {
      var nextProp = nextProps[propKey];
      var lastProp = propKey === STYLE ? this._previousStyleCopy : lastProps != null ? lastProps[propKey] : undefined;
      //不在新属性中,或者和旧属性相同跳过
      if ( !nextProps.hasOwnProperty(propKey) || nextProp === lastProp || (nextProp == null && lastProp == null) ) {
        continue;
      }
      if (propKey === STYLE) {
        if (nextProp) {
          //合并样式
          nextProp = this._previousStyleCopy = Object.assign({}, nextProp);
        } else {
          this._previousStyleCopy = null;
        }
        if (lastProp) {
          //在旧样式中不在新样式中,清除该样式
          for (styleName in lastProp) {
            if (lastProp.hasOwnProperty(styleName) &&(!nextProp || !nextProp.hasOwnProperty(styleName))) {
              styleUpdates = styleUpdates || {};
              styleUpdates[styleName] = '';
            }
          }
          // 既在旧样式中,也在新样式中,且不相同,则更新该样式
          for (styleName in nextProp) {
            if (nextProp.hasOwnProperty(styleName) &&lastProp[styleName] !== nextProp[styleName]) {
              styleUpdates = styleUpdates || {};
              styleUpdates[styleName] = nextProp[styleName];
            }
          }
        } else {
          // 不存在旧样式,直接写入新样式
          styleUpdates = nextProp;
        }
      } else if (registrationNameModules.hasOwnProperty(propKey)) {
        if (nextProp) {
          //添加事件监听的属性
          enqueuePutListener(this, propKey, nextProp, transaction);
        } else if (lastProp) {
          deleteListener(this, propKey);
        }
        //添加新的属性,或者是更新旧的同名属性
      } else if (isCustomComponent(this._tag, nextProps)) {
        if (!RESERVED_PROPS.hasOwnProperty(propKey)) {
          //更新属性
          DOMPropertyOperations.setValueForAttribute( getNode(this), propKey, nextProp, );
        }
      } else if ( DOMProperty.properties[propKey] || DOMProperty.isCustomAttribute(propKey) ) {
        var node = getNode(this);
        if (nextProp != null) {
          DOMPropertyOperations.setValueForProperty(node, propKey, nextProp);
        } else {
          //如果更新为null或者undefined 则执行删除属性操作
          DOMPropertyOperations.deleteValueForProperty(node, propKey);
        }
      }
    }
    //如果styleUpdates不为空,则设置新样式
    if (styleUpdates) {
      CSSPropertyOperations.setValueForStyles(getNode(this),styleUpdates,this,);
    }
  },

```

#### 更新子节点
##### 在执行mountComponent方法时,通过this._createContentMarkup(transaction, props, context);处理DOM节点的内容

```javascript
  _createContentMarkup: function(transaction, props, context) {
    var ret = '';
    //获取子节点渲染出的内容
    var innerHTML = props.dangerouslySetInnerHTML;
    if (innerHTML != null) {
      if (innerHTML.__html != null) {
        ret = innerHTML.__html;
      }
    } else {
      var contentToUse = CONTENT_TYPES[typeof props.children] ? props.children : null;
      var childrenToUse = contentToUse != null ? null : props.children;
      if (contentToUse != null) {
        // TODO: Validate that text is allowed as a child of this node
        ret = escapeTextContentForBrowser(contentToUse);
      } else if (childrenToUse != null) {
        //对子节点进行初始化渲染
        var mountImages = this.mountChildren( childrenToUse, transaction, context, );
        ret = mountImages.join('');
      }
    }
    // 是否需要换行
    if (newlineEatingTags[this._tag] && ret.charAt(0) === '\n') {
      return '\n' + ret;
    } else {
      return ret;
    }
  },

```

##### 当执行receiveComponent方法时,通过this._updateDOMChildren(lastProps, nextProps, transaction, context);更新DOM内容和子节点

```javascript
  /**
   *  先是删除不需要的子节点和内容
   *      如果存在旧节点,而新节点不存在,说明当前节点在更新之后删除,执行this.updateChildren(null, transaction, context);
   *      如果旧的内容存在,而新的内容不存在,说明当前内容在更新后被删除,此时执行 this.updateTextContent('');
   *  更新子节点和内容
   *      如果新子节点存在,则更新其子节点,此时执行this.updateChildren(nextChildren, transaction, context);
   *      如果新的内容存在,则更新内容,此时执行方法this.updateTextContent('' + nextContent);
   * 
   */
  _updateDOMChildren: function(lastProps, nextProps, transaction, context) {
    //初始化
    var lastContent = CONTENT_TYPES[typeof lastProps.children]  ? lastProps.children : null;
    var nextContent = CONTENT_TYPES[typeof nextProps.children] ? nextProps.children : null;
    var lastHtml = lastProps.dangerouslySetInnerHTML && lastProps.dangerouslySetInnerHTML.__html;
    var nextHtml = nextProps.dangerouslySetInnerHTML && nextProps.dangerouslySetInnerHTML.__html;

    var lastChildren = lastContent != null ? null : lastProps.children;
    var nextChildren = nextContent != null ? null : nextProps.children;

    var lastHasContentOrHtml = lastContent != null || lastHtml != null;
    var nextHasContentOrHtml = nextContent != null || nextHtml != null;
    if (lastChildren != null && nextChildren == null) {
      //旧节点存在,而新节点不存爱,说明当前节点在更新后被删除了
      this.updateChildren(null, transaction, context);
    } else if (lastHasContentOrHtml && !nextHasContentOrHtml) {
      //说明当前内容在更新后被删除了
      this.updateTextContent('');
    }
    //新节点存在
    if (nextContent != null) {
      if (lastContent !== nextContent) {
        //更新内容
        this.updateTextContent('' + nextContent);
      }
    } else if (nextHtml != null) {
      //更新属性标识
      if (lastHtml !== nextHtml) {
        this.updateMarkup('' + nextHtml);
      }
    } else if (nextChildren != null) {
      //更新子节点
      this.updateChildren(nextChildren, transaction, context);
    }
  },
```

### 2.3 自定义组件(生命周期)
---
createClass 是创建自定义组件的入口方法，负责管理生命周期中的 getDefaultProps。该方
法在整个生命周期中只执行一次，这样所有实例初始化的 props 将会被共享。
通过 createClass 创建自定义组件，利用原型继承 ReactClassComponent 父类，按顺序合并
mixin，设置初始化 defaultProps，返回构造函数。
当使用 ES6 classes 编写 React 组件时，class MyComponent extends React.Component 其实就
是调用内部方法 createClass 创建组件
---
```javascript
  /**
   * 创建自定义组件
   */
  function createClass(spec) {
    //创建自定义组件
    var Constructor = identity(function (props, context, updater) {

      // 自动绑定
      if (this.__reactAutoBindPairs.length) {
        bindAutoBindMethods(this);
      }

      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;

      this.state = null;
      //ReactClass没有构造器,通过getInitialState和componentWillMount来代替
      var initialState = this.getInitialState ? this.getInitialState() : null;
      this.state = initialState;
    });
    //原型链继承父类
    Constructor.prototype = new ReactClassComponent();
    Constructor.prototype.constructor = Constructor;
    Constructor.prototype.__reactAutoBindPairs = [];
    //合并mixin
    injectedMixins.forEach(mixSpecIntoComponent.bind(null, Constructor));

    mixSpecIntoComponent(Constructor, IsMountedMixin);
    mixSpecIntoComponent(Constructor, spec);

    // 所有的mixin合并后初始化defaultProps(在整个生命周期中,getDefaultProps只执行一次)
    if (Constructor.getDefaultProps) {
      Constructor.defaultProps = Constructor.getDefaultProps();
    }

    // 减少查找并设置原型的时间
    for (var methodName in ReactClassInterface) {
      if (!Constructor.prototype[methodName]) {
        Constructor.prototype[methodName] = null;
      }
    }

    return Constructor;
  }
```

#### 生命周期-挂载阶段(MOUNTING)
---
1.  mountComponent 负责管理生命周期中的 getInitialState、componentWillMount、render 和 componentDidMount。
2.  由于 getDefaultProps 是通过构造函数进行管理的，所以也是整个生命周期中最先开始执行的。而 mountComponent 只能望洋兴叹，无法调用到 getDefaultProps。这就解释了为何 getDefaultProps只执行一次。
3.  由于通过 ReactCompositeComponentBase 返回的是一个虚拟节点，所以需要利用 instantiateReactComponent去得到实例，再使用 mountComponent 拿到结果作为当前自定义元素的结果。
4.  通过 mountComponent 挂载组件，初始化序号、标记等参数，判断是否为无状态组件，并进行对应的组件初始化工作，比如初始化 props、context 等参数。利用 getInitialState 获取初始化state、初始化更新队列和更新状态。
5.  若存在 componentWillMount，则执行。如果此时在 componentWillMount 中调用 setState 方法，
    是不会触发 re-render的，而是会进行 state 合并，且 inst.state = this._processPendingState(inst.props, inst.context) 是在 componentWillMount 之后执行的，
    因此 componentWillMount 中的 this.state 并不是最新的，在 render 中才可以获取更新后的 this.state。因此，React 是利用更新队列 this._pendingStateQueue 
    以及更新状态 this._pendingReplaceState 和 this._pendingForceUpdate 来实现 setState 的异步更新机制。
6.  当渲染完成后，若存在 componentDidMount，则调用。这就解释了 componentWillMount 、render 、componentDidMount 这三者之间的执行顺序。
7.  mountComponent 本质上是通过递归渲染内容的，由于递归的特性，父组件的componentWillMount 在其子组件的 componentWillMount 之前调用，而父组件的 componentDidMount在其子组件的 componentDidMount 之后调用。
---

```javascript
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

```

#### 生命周期-修改阶段(RECEIVE_PROPS)
---
1.  updateComponent 负责管理生命周期中的 componentWillReceiveProps、shouldComponentUpdate、componentWillUpdate、render和 componentDidUpdate。
2.  首先通过 updateComponent 更新组件，如果前后元素不一致，说明需要进行组件更新。
3.  若存在 componentWillReceiveProps，则执行。如果此时在 componentWillReceiveProps 中调用 setState，是不会触发 re-render 的，而是会进行 state 合并。
    且在 componentWillReceiveProps、shouldComponentUpdate 和 componentWillUpdate 中也还是无法获取到更新后的 this.state，
    即此时访问的 this.state 仍然是未更新的数据，需要设置 inst.state = nextState 后才可以，因此只有在 render 和 componentDidUpdate 中才能获取到更新后的 this.state。
4.  调用 shouldComponentUpdate 判断是否需要进行组件更新，如果存在 componentWillUpdate，则执行。updateComponent 本质上也是通过递归渲染内容的，由于递归的特性，父组件的 componentWillUpdate
    是在其子组件的 componentWillUpdate 之前调用的，而父组件的 componentDidUpdate也是在其子组件的 componentDidUpdate 之后调用的。
5.  当渲染完成之后，若存在 componentDidUpdate，则触发，这就解释了 componentWillReceiveProps、componentWillUpdate、render、componentDidUpdate 它们之间的执行顺序。
---

```javascript
  // receiveComponent 是通过调用 updateComponent 进行组件更新的
  receiveComponent: function(nextElement, transaction, nextContext) {
    var prevElement = this._currentElement;
    var prevContext = this._context;
    this._pendingElement = null;
    this.updateComponent(transaction,prevElement,nextElement,prevContext,nextContext,);
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
  //在componentShouldUpdate()方法执行前调用了:就是说在调用之前将所有state操作合并
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
```

#### 生命周期-卸载阶段(UNMOUNTING)
---
1.  unmountComponent 负责管理生命周期中的 componentWillUnmount。
2.  如果存在 componentWillUnmount，则执行并重置所有相关参数、更新队列以及更新状态，如果此时在 componentWillUnmount 中调用 setState，是不会触发 re-render 的，
    这是因为所有更新队列和更新状态都被重置为 null，并清除了公共类，完成了组件卸载操作
---
```javascript
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
```

#### 无状态组件
---
1.  无状态组件只有一个render方法,并没有组件类的实例化过程,也没有实例返回
2.  无状态组件没有状态,没有生命周期,就是接受props渲染生成dom结构是一个纯粹为渲染而生的组件,
```javascript
//无状态组件只有一个render方法
function StatelessComponent(Component) {}
StatelessComponent.prototype.render = function() {
  var Component = ReactInstanceMap.get(this)._currentElement.type;
  //没有state状态
  var element = Component(this.props, this.context, this.updater);
  return element;
};
```
![Image text](https://github.com/mazhy/react-15.6-source-parsing/blob/master/image/%E7%94%9F%E5%91%BD%E5%91%A8%E6%9C%9F.png)
---

### setState
---
1.  react通过this.state来访问state,通过this.setState()方法来更新state,
    当this.setState()被调用的时候,React会重新调用render方法来重新渲染UI
2.  setState是通过一个队列机制实现state更新,当执行setState时,会将需要更新的state合并后放入到状态队列中,
    而不会立刻更新this.state,队列机制可以高效地批量更新state
3.  如果不通过setState而直接修改this.state的值,那么该state就不会放入到状态队列中,
    当下次调用setState并对状态队列进行合并时,将会忽略之前直接被修改的state,而造成无法预知的错误
4.  React利用状态队列机制实现了setState的异步更新,避免频繁重复更新state
---
```javascript
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
```
---
![Image text](https://github.com/mazhy/react-15.6-source-parsing/blob/master/image/setState%E8%B0%83%E7%94%A8%E6%A0%88.png)
---
### setState循环调用风险
---
1.  当调用 setState 时，实际上会执行 enqueueSetState 方法，并对 partialState 以及_pendingStateQueue
    更新队列进行合并操作，最终通过 enqueueUpdate 执行 state 更新。
2.  而 performUpdateIfNecessary 方法会获取 _pendingElement、_pendingStateQueue、_pendingForceUpdate，并调用
    receiveComponent 和 updateComponent 方法进行组件更新。
3.  如果在 shouldComponentUpdate 或 componentWillUpdate 方法中调用 setState ，此时
    this._pendingStateQueue != null，则 performUpdateIfNecessary 方法就会调用 updateComponent
    方法进行组件更新，但 updateComponent 方法又会调用 shouldComponentUpdate 和 componentWillUpdate
    方法，因此造成循环调用，使得浏览器内存占满后崩溃
---
```javascript
//更新state
//该方法传入两个参数,前者是新的state值,后者是回调函数
ReactComponent.prototype.setState = function(partialState, callback) {
  this.updater.enqueueSetState(this, partialState);
  if (callback) {
    this.updater.enqueueCallback(this, callback, 'setState');
  }
};

//在组件构造函数中发现updater是参数传进来的
function ReactComponent(props, context, updater) {
  this.props = props;
  this.context = context;
  this.refs = emptyObject;
  this.updater = updater || ReactNoopUpdateQueue;
}

//在ReactCompositeComponent的_constructComponentWithoutOwner()方法中发现了new Component()
//在updater的位置上是updateQueue
_constructComponentWithoutOwner: function(doConstruct,publicProps, publicContext,updateQueue,) {
    var Component = this._currentElement.type;

    if (doConstruct) {
        return new Component(publicProps, publicContext, updateQueue);
    }
    return Component(publicProps, publicContext, updateQueue);
},

enqueueSetState: function(publicInstance, partialState) {
	//获取当前组件的实例对象,赋值给internalInstance
	var internalInstance = getInternalInstanceReadyForUpdate( publicInstance, 'setState',  );

	if (!internalInstance) {
		return;
	}
	//判断当前实例对象中是否存在state更新队列,没有就初始化,然后更新队列合并操作
	var queue = internalInstance._pendingStateQueue || (internalInstance._pendingStateQueue = []);
	queue.push(partialState);
	enqueueUpdate(internalInstance);
},

//获取当前组件的实例
function getInternalInstanceReadyForUpdate(publicInstance, callerName) {
  var internalInstance = ReactInstanceMap.get(publicInstance);
  if (!internalInstance) {
    return null;
  }
  return internalInstance;
}

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

/**
 * 解析:
 *    如果isBatchingUpdates为true,则对所有队列中的更新执行batchedUpdates方法
 *    否则只把当前组件放入dirtyComponents中
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
	//初始化为false
  isBatchingUpdates: false,
    //这里的callback就是enqueueUpdate,更新队列
  batchedUpdates: function(callback, a, b, c, d, e) {
    var alreadyBatchingUpdates = ReactDefaultBatchingStrategy.isBatchingUpdates;

    ReactDefaultBatchingStrategy.isBatchingUpdates = true;

    if (alreadyBatchingUpdates) {
      return callback(a, b, c, d, e);
    } else {
	  //事物调用
      return transaction.perform(callback, null, a, b, c, d, e);
    }
  },
};
```

## transaction事物
---
![Image text](https://github.com/mazhy/react-15.6-source-parsing/blob/master/image/%E4%BA%8B%E7%89%A9.png)
---
1.  从流程图上可以看出,每一个method都会被一个wrapper所包裹,通过perform(method)的方式调用,而方法前后分别有initialize,close,和aop类似
2.  在ReactDefaultBatchingStrategy.batchedUpdates()方法中实际调用的是transaction.perform(enqueueUpdate),
    但enqueueUpdate方法中仍然存在transaction.perform(enqueueUpdate),会不会造成死循环??
---
### 流程这样
当触发setState时,根据ReactDefaultBatchingStrategy.isBatchingUpdates的值判断
默认为false,就会执行 batchingStrategy.batchedUpdates(enqueueUpdate, component);
将ReactDefaultBatchingStrategy.isBatchingUpdates = true;
然后事物调用transaction.perform(callback, null, a, b, c, d, e);进入enqueueUpdate()
因为变为了true所以执行dirtyComponents.push(component);
事物结束isBatchingUpdates设置为false









