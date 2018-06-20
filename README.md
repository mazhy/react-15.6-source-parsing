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






























