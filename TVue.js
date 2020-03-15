//* 手写一个vue
class Tvue {
    constructor(options) {
        this.$options = options
        //? 处理data选项
        this.$data = options.$data
        // 响应化
        this.observe(this.$data)
    }

    observe(value) {
        if (!value || typeof value !== 'object') {
            this.defineReactive(value, key, value[key])
        }
    }

    defineReactive(obj, key, val) {
        Object.defineProperty(obj, key, {
            enumerable: true,
            configurable: true,
            get() {
                return val
            },
            set(newVal) {
                if (newVal !== val) {
                    val = newVal
                    console.log(`${key}更新了：${newVal}`)
                }
            }
        })
        //! 递归
        this.observe(val)
    }
}

class Dep {
    constructor() {
        this.deps = []
    }

    addDep(dep) {
        this.deps.push(dep)
    }

    notify() {
        this.deps.forEach(dep => dep.update())
    }
}

class Watcher {
    constructor(vm, key, cb) {
        this.vm = vm 
        this.key = key
        this.cb = cb

        //!
        Dep.target = this
        this.vm[this.key] // 添加watcher到dep
        Dep.target = null
    }
    update() {
        // console.log('属性更新了')
        this.cb.call(this.vm, this.vm[this.key])
    }
}