为个人学习记录而写，持续更新，如果有幸帮助了你，甚感欣喜；也请各位指正不足，虚心求教，互相进步！

首先呢，我们要知道**什么是变化侦测**？

```
简单来说，变化侦测就是侦测数据的变化。当数据发生变化时，要能侦测到并发出通知。
```

由于Object和Array的变化侦测采用不同的处理方式，本文先来详细介绍Object的变化侦测，后面会更新Array变化侦测的。

## Object的变化侦测

### 如何追踪变化

关于变化侦测，首先要知道，在JavaScript中该如何侦测一个对象的变化？

其实这个问题呢，对JavaScript有一定了解的人都能想到，有两种方法可以侦测到变化：

+ 使用Object.defineProperty（基本使用和原理可以先了解之后阅读本文更加顺畅）
+ ES6的Proxy

在vue2中使用的是Object.defineProperty，在vue3中用到了Proxy

本文先以Object.defineproperty来进行讲解实现原理，后续会专门写一篇Proxy去实现。其实原理都一样，会一种即可通罗马！

知道了Object.defineProperty可以侦测到对象的变化，那么先来我们看看简易版的实现。

```js
function defineReactive(obj, key, val) {
        Object.defineProperty(obj, key, {
            get() {
                return val
            },
            set(newVal) {
                if (newVal !== val) {
                    val = newVal
                    return
                }
            }
        })
 	}
```

这里的函数defineReactive用来对Object.defineProperty进行封装。其作用是定义一个响应式数据，也就是在这个函数中进行变化侦测，封装后只需要传入obj、key、val就好了。

每当从obj的key中读取数据时，get函数被触发；设置数据时，set函数被触发。

### 如何收集依赖

如果只是把Object.defineProperty 进行封装，那其实并没有实际用处，真正有用的是手机依赖。

那么如何收集依赖？

思考一下，我们观察数据，其目的是当数据的属性发生变化时，可以通知那些曾经使用了该数据的地方。

举个栗子：

```vue
<template>
    <h1>{{ foo }}</h1>
</template>>
```

该模板中使用了数据foo，所以当它发生变化时，要向使用了它的地方发送通知。

**注意：在vue2中，模板使用数据等同于组件使用数据，所以当数据发生变化时，会将通知发送到组件，然后组件内部再通过虚拟DOM重新渲染。**

```
对于上面的问题来说下思路：
我们先去收集依赖，把用到数据foo的地方收集起来，然后等属性发生变化时，把之前收集好的依赖再循环触发一遍就好了。
其实就是：在getter中收集依赖，在setter中触发依赖
```



### 依赖收集在哪

现在我们知道在getter中收集依赖，那么要把依赖收集到哪去呢？

思考一下，首先想到的是每个key都有一个数组，用来存储当前key的依赖。假设依赖是一个函数，保存在window.target上，来稍微改造一下defineReactive

```js 
function defineReactive(obj, key, val) {
    let dep = [] // 新增
    Object.defineProperty(obj, key, {
        get() {
            dep.push(window.target) // 新增
            return val
        },
        set(newVal) {
            if (newVal !== val) {
                // 新增
                for (let i = 0; i < dep.length; i++) {
                    dep[i](newVal, val)
                }
                val = newVal
                return
            }
        }
    })
}
```

我们新增了数组dep，用来存储被收集的依赖。

然后再set被触发时，循环dep以触发收集到的依赖。

这样写有点耦合，我们把依赖收集的代码封装成一个Dep类，专门去管理我们的依赖。使用这个类，我们可以收集依赖，向依赖发送通知等。

```js
class Dep {
    constructor() {
        this.deps = []
    }
    
    addDep(dep) {
        this.deps.push(dep)
    }
    depend() {
        if (window.target) {
            this.addDep(window.target)
        }
    }
    notify() {
        const deps = this.deps
        for (let i = 0; i < deps.length; i++) {
            deps[i].update()
        }
    }
}
```

现在我们再来改造一下defineReactive

```js
function defineReactive(obj, key, val) {
    let dep = new Dep() // 修改
    Object.defineProperty(obj, key, {
        get() {
            dep.depend() // 新增
            return val
        },
        set(newVal) {
            if (newVal !== val) {  
                val = newVal
                dep.notify() // 新增
            }
        }
    })
}
```

我们再来看看现在的代码，是不是清晰很多，也解决了上面的问题，依赖收集到哪了？收集到Dep中。



### 依赖是谁

在上面我们收集的依赖是window.target，那么它到底是什么？我们究竟要收集谁呢？

收集谁，换句话说，就是当属性发生变化后，通知谁。

我们要通知用到的数据的地方，而使用这个数据的地方可能有很多，类型也不一样，既有可能是模板，也有可能是用户写的一个watch，这时需要抽象出一个能集中处理这些情况的类。

然后我们在依赖收集阶段只收集这个封装好的类的实例进来，通知也只通知它一个。接着，它再负责通知其他地方。我们将这个抽象的东西封装成一个Watcher类

**收集谁？Watcher!**



### 什么是Watcher

> Watcher是一个中介的角色，数据发生变化时通知它，然后它再通知其他地方。

```js
class Watcher {
    constructor(vm, key, cb) {
        this.vm = vm
        this.key = key 
        this.cb = cb
        Dep.target = this
        this.vm[this.key] // 添加Watcher到dep
        Dep.target = null
    }
    update() {
        // console.log('属性更新了')
        this.cb.call(this.vm, this.vm[this.key])
    }
}
```



### 递归侦测所有key

现在，其实已经可以实现变化侦测的功能了，但是只是实现了侦测数据的某一个属性，我们希望把数据中的所有属性都侦测到，所有要封装一个Observer类。这个类的作用时将一个数据内的所有属性都转换成getter/setter的形式，然后去追踪它们的变化：

```js 
// Object类会附加到每一个被侦测的Object上
// 一旦被附加上，Observe会将object的所有属性转换为getter/setter的形式
// 来收集属性的依赖，并且当属性发生变化时会通知这些依赖
class Obserse {
    constructor(value) {
        this.value = value
        if (!array.isArray(value)) {
            thius.walk()
        }
    }
    // walk会将每一个属性都转换成getter/setter的形式来侦测变化，只在数据类型为Object时被调用
    walk(obj) {
        const keys = Object.keys(obj)
        for (let i = 0; i < keys.length; i++) {
            defineReactive(obj, keys[i], obj[keys[i]])
        }
    }
    
}

function defineReactive(obj, key, val) {
    // 新增，递归子属性
    if（typeof val === 'object'）{
        new Observer(val)
    }
    let dep = new Dep()
    Object.defineProperty(obj, key, {
        get() {
            dep.depend()
            return val
        },
        set(newVal) {
            if (newVal !== val) {  
                val = newVal
                dep.notify() // 新增
            }
        }
    })
}
```

在上面的代码中，我们定义的Observe类，用来将一个正常的object转换成被侦测的object。

然后判断数据的类型，只有Object类型的数据才会调用walk将每一个属性转换成getter/setter的形式来侦测变化。

最后，在defineReactive中新增new Observer(val) 来递归子属性，这样我们就可以把data中的所有属性（包括）子属性都转换成getter/setter的形式来侦测变化。

当data中的属性发生变化时，与这个属性对应的依赖就会接收到通知。

也就是说，只要我们将一个object传到Observe中，那么这个object就会变成响应式的object。

