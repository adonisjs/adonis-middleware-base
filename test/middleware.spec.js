'use strict'

/*
 * adonis-middleware-base
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
*/

const path = require('path')
const test = require('japa')
const { setupResolver } = require('@adonisjs/sink')
const { ioc } = require('@adonisjs/fold')
const MiddlewareBase = require('..')

test.group('Middleware', (group) => {
  group.before(() => {
    setupResolver()
    ioc.autoload(path.join(__dirname, 'app'), 'App')
  })

  group.beforeEach(() => {
    this.middleware = new MiddlewareBase('handle')
  })

  test('throw exception when middleware handle is not defined', (assert) => {
    const middleware = () => new MiddlewareBase()
    assert.throw(middleware, 'make sure to define the middleware fn. Report issue to package author')
  })

  test('throw exception when middleware handle is define but not a string', (assert) => {
    const middleware = () => new MiddlewareBase({})
    assert.throw(middleware, 'make sure to define the middleware fn. Report issue to package author')
  })

  test('register global middleware', (assert) => {
    this.middleware.registerGlobal(['foo', 'bar'])
    assert.deepEqual(this.middleware._middleware.global, [
      {
        namespace: 'foo.handle',
        params: []
      },
      {
        namespace: 'bar.handle',
        params: []
      }
    ])
  })

  test('append middleware when registerGlobal called multiple times', (assert) => {
    this.middleware.registerGlobal(['foo', 'bar'])
    this.middleware.registerGlobal(['baz'])

    assert.deepEqual(this.middleware._middleware.global, [
      {
        namespace: 'foo.handle',
        params: []
      },
      {
        namespace: 'bar.handle',
        params: []
      },
      {
        namespace: 'baz.handle',
        params: []
      }
    ])
  })

  test('throw exception when middleware is not an array', (assert) => {
    const fn = () => this.middleware.registerGlobal('foo')
    assert.throw(fn, 'registerGlobal method accepts an array of middleware instead received string')
  })

  test('log warning when duplicate middleware are registered', (assert) => {
    assert.plan(2)

    const middleware = new MiddlewareBase('handle', function (message) {
      assert.equal(message, 'Detected existing global middleware {foo}, the current one will be ignored')
    })

    middleware.registerGlobal(['foo'])
    middleware.registerGlobal(['foo'])

    assert.deepEqual(middleware._middleware.global, [
      {
        namespace: 'foo.handle',
        params: []
      }
    ])
  })

  test('register named middleware', (assert) => {
    const named = {
      auth: 'App/Middleware/Auth'
    }

    this.middleware.registerNamed(named)

    assert.deepEqual(this.middleware._middleware.named, {
      auth: {
        namespace: 'App/Middleware/Auth.handle',
        params: []
      }
    })
  })

  test('register multiple named middleware', (assert) => {
    this.middleware.registerNamed({ auth: 'App/Middleware/Auth' })
    this.middleware.registerNamed({ addonValidator: 'App/Middleware/Validator' })

    assert.deepEqual(this.middleware._middleware.named, {
      auth: {
        namespace: 'App/Middleware/Auth.handle',
        params: []
      },
      addonValidator: {
        namespace: 'App/Middleware/Validator.handle',
        params: []
      }
    })
  })

  test('throw exception when named middleware payload is not an object', (assert) => {
    const fn = () => this.middleware.registerNamed(['foo'])
    assert.throw(fn, `registerNamed accepts a key/value pair of middleware instead received array`)
  })

  test('register server level middleware', (assert) => {
    this.middleware.use(['foo'])
    assert.deepEqual(this.middleware._middleware.server, [{
      namespace: 'foo.handle',
      params: []
    }])
  })

  test('concat server level middleware when called use for multiple times', (assert) => {
    this.middleware.use(['foo'])
    this.middleware.use(['bar'])

    assert.deepEqual(this.middleware._middleware.server, [
      {
        namespace: 'foo.handle',
        params: []
      },
      {
        namespace: 'bar.handle',
        params: []
      }
    ])
  })

  test('log warning when duplicate server middleware are registered', (assert) => {
    assert.plan(2)

    const middleware = new MiddlewareBase('handle', (message) => {
      assert.equal(message, 'Detected existing server middleware {foo}, the current one will be ignored')
    })

    middleware.use(['foo'])
    middleware.use(['foo'])

    assert.deepEqual(middleware._middleware.server, [{
      namespace: 'foo.handle',
      params: []
    }])
  })

  test('compile named middleware', (assert) => {
    const namedMiddleware = ['auth']
    this.middleware.registerNamed({ auth: function () {} })

    const middleware = this.middleware._compileNamedMiddleware(namedMiddleware)
    assert.deepEqual(middleware, [this.middleware._middleware.named.auth])
  })

  test('define raw function as named middleware', (assert) => {
    const namedMiddleware = [function () {}]

    const middleware = this.middleware._compileNamedMiddleware(namedMiddleware)
    assert.deepEqual(middleware, [
      { namespace: namedMiddleware[0], params: [] }
    ])
  })

  test('parse params defined on named middleware', (assert) => {
    const namedMiddleware = ['auth:jwt']

    this.middleware.registerNamed({ auth: function () {} })

    const middleware = this.middleware._compileNamedMiddleware(namedMiddleware, {})
    assert.deepEqual(middleware, [
      { namespace: this.middleware._middleware.named.auth.namespace, params: ['jwt'] }
    ])
  })

  test('throw exception when named middleware is not registered', (assert) => {
    const namedMiddleware = ['auth:jwt']
    const middleware = () => this.middleware._compileNamedMiddleware(namedMiddleware)

    assert.throw(middleware, 'E_MISSING_NAMED_MIDDLEWARE: Cannot find any named middleware for {auth}. Make sure you have registered it inside start/kernel.js file.')
  })

  test('throw exception when middleware is not a string or function', (assert) => {
    const namedMiddleware = [{}]
    const middleware = () => this.middleware._compileNamedMiddleware(namedMiddleware, {})
    assert.throw(middleware, 'E_INVALID_MIDDLEWARE_TYPE: Middleware must be a function or reference to an IoC container string.')
  })

  test('compose server middleware and execute them', async (assert) => {
    assert.plan(1)

    this.middleware.use([function () {
      assert.isTrue(true)
    }])

    await this
      .middleware
      .composeServer()
      .params([])
      .run()
  })

  test('pass ctx to middleware', async (assert) => {
    assert.plan(1)

    const ctx = {
      req: {}
    }

    this.middleware.use([function (__ctx__) {
      assert.deepEqual(__ctx__, ctx)
    }])

    await this
      .middleware
      .composeServer()
      .params([ctx])
      .run()
  })

  test('execute middleware in sequence', async (assert) => {
    const stack = []
    const ctx = {
      req: {}
    }

    const fn1 = function (__ctx__, next) {
      __ctx__.first = true
      stack.push('first')
      return next()
    }

    const fn2 = function (__ctx__, next) {
      __ctx__.second = true
      stack.push('second')
      return next()
    }

    this.middleware.use([fn1, fn2])
    await this
      .middleware
      .composeServer()
      .params([ctx])
      .run()

    assert.deepEqual(stack, ['first', 'second'])
    assert.isTrue(ctx.first)
    assert.isTrue(ctx.second)
  })

  test('compose global middleware and execute them', async (assert) => {
    assert.plan(1)

    this.middleware.registerGlobal([function () {
      assert.isTrue(true)
    }])

    await this
      .middleware
      .composeGlobalAndNamed([])
      .params([])
      .run()
  })

  test('compose global middleware with route middleware and execute them', async (assert) => {
    const stack = []

    this.middleware.registerGlobal([function (ctx, next) {
      stack.push('global')
      return next()
    }])

    this.middleware.registerNamed({
      auth: function (ctx, next) {
        stack.push('named')
        return next()
      }
    })

    await this
      .middleware
      .composeGlobalAndNamed(['auth'])
      .params([{}])
      .run()

    assert.deepEqual(stack, ['global', 'named'])
  })

  test('pass params to route middleware', async (assert) => {
    const stack = []

    this.middleware.registerGlobal([function (ctx, next) {
      stack.push('global')
      return next()
    }])

    this.middleware.registerNamed({
      auth: function (ctx, next, params) {
        stack.push(params)
        return next()
      }
    })

    await this
      .middleware
      .composeGlobalAndNamed(['auth:jwt'])
      .params([{}])
      .run()

    assert.deepEqual(stack, ['global', ['jwt']])
  })
})
