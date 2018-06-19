1.ReactDOM.render 开始要渲染组件
2.如果执行更新组件
3.创建组件,根据参数,看创建什么类型的组件并返回
4.根据当前的批处理策略进行更新处理
5.通过setInnerHTML方式将html加入到dom中


生命周期只存在于自定义组件中


1.jsx创建的虚拟元素会被编译成React的createElement方法
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
  使用React创建组件,会先调用instantiateReactComponent, 这是初始化组件的入口,通过判断参数node的类型来区分创建什么类型的组件
  1.当node为空时,说明node不存在,则初始化一个空的组件. ReactEmptyComponent.create(instantiateReactComponent)。
  2.当node类型为对象时,那么就是DOM标签组件或者说是自定义组件,
  	如果element类型(element = node,element.type='string')为字符串,就会初始化一个dom标签组件:ReactNativeComponent.createInternalComponent(element)，
  	否则就会初始化一个自定义组件 ReactCompositeComponentWrapper()
  3.当node类型为字符串或者数字时,则初始化文本组件,ReactNativeComponent.createInstanceForText(node)。
  4.其余情况不做处理
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

2.1文本组件
1根据transaction.useCreateElement判断文本是不是通过createElement创建的节点
2.是,则为这个节点创建标签和标识domID就可以参与虚拟dom的diff
3.如果不是就直接返回文本


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
3 DOM标签组件
1.虚拟dom涵盖了原生的DOM标签,使用的<div>不是原<div>,他是一个虚拟dom对象,标签名相同
2.属性更新:更新样式,更新属性,处理事件

3.子节点更新:更新内容,更新子节点,
