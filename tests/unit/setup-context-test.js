import { module, test } from 'qunit';
import Service, { inject as injectService } from '@ember/service';
import {
  setupContext,
  teardownContext,
  getContext,
  pauseTest,
  resumeTest,
} from 'ember-test-helpers';
import hasEmberVersion from 'ember-test-helpers/has-ember-version';
import { setResolverRegistry, createCustomResolver } from '../helpers/resolver';
import Ember from 'ember';

module('setupContext', function(hooks) {
  if (!hasEmberVersion(2, 4)) {
    return;
  }

  let context;
  hooks.before(function() {
    setResolverRegistry({
      'service:foo': Service.extend({ isFoo: true }),
    });
  });

  hooks.afterEach(async function() {
    if (context) {
      await teardownContext(context);
      context = undefined;
    }
  });

  module('without options', function(hooks) {
    hooks.beforeEach(function() {
      context = {};
      return setupContext(context);
    });

    test('it sets up this.owner', function(assert) {
      let { owner } = context;
      assert.ok(owner, 'owner was setup');
      assert.equal(typeof owner.lookup, 'function', 'has expected lookup interface');

      if (hasEmberVersion(2, 12)) {
        assert.equal(typeof owner.factoryFor, 'function', 'has expected factory interface');
      }
    });

    test('it uses the default resolver if no override specified', function(assert) {
      let { owner } = context;
      let instance = owner.lookup('service:foo');
      assert.equal(instance.isFoo, true, 'uses the default resolver');
    });

    test('it sets up this.set', function(assert) {
      context.set('foo', 'bar');
      assert.equal(context.foo, 'bar', 'this.set sets the property');
    });

    test('it sets up this.setProperties', function(assert) {
      context.setProperties({
        foo: 'bar',
        baz: 'qux',
      });

      assert.equal(context.foo, 'bar', 'this.setProperties sets the first property');
      assert.equal(context.baz, 'qux', 'this.setProperties sets the second property');
    });

    test('it sets up this.get', function(assert) {
      context.set('foo', 'bar');

      assert.equal(context.get('foo'), 'bar', 'this.get can read previously set property');
    });

    test('it sets up this.getProperties', function(assert) {
      context.setProperties({
        foo: 'bar',
        baz: 'qux',
      });

      let result = context.getProperties('foo', 'baz');
      assert.deepEqual(
        result,
        {
          foo: 'bar',
          baz: 'qux',
        },
        'getProperties reads content from context'
      );
    });

    test('it calls setContext with the provided context', function(assert) {
      assert.equal(getContext(), context);
    });

    test('can be used for unit style testing', function(assert) {
      context.owner.register(
        'service:foo',
        Service.extend({
          someMethod() {
            return 'hello thar!';
          },
        })
      );

      let subject = context.owner.lookup('service:foo');

      assert.equal(subject.someMethod(), 'hello thar!');
    });

    test('can access a service instance (instead of this.inject.service("thing") in 0.6)', function(
      assert
    ) {
      context.owner.register('service:bar', Service.extend());
      context.owner.register(
        'service:foo',
        Service.extend({
          bar: injectService(),
          someMethod() {
            this.set('bar.someProp', 'derp');
          },
        })
      );

      let subject = context.owner.lookup('service:foo');
      let bar = context.owner.lookup('service:bar');

      assert.notOk(bar.get('someProp'), 'precond - initially undefined');

      subject.someMethod();

      assert.equal(bar.get('someProp'), 'derp', 'property updated');
    });

    test('can pauseTest to be resumed "later"', async function(assert) {
      assert.expect(5);

      let promise = context.pauseTest();

      // do some random things while "paused"
      setTimeout(function() {
        assert.step('5 ms');
      }, 5);

      setTimeout(function() {
        assert.step('20 ms');
      }, 20);

      setTimeout(function() {
        assert.step('30 ms');
      }, 30);

      setTimeout(function() {
        assert.step('50 ms');
        context.resumeTest();
      }, 50);

      await promise;

      assert.verifySteps(['5 ms', '20 ms', '30 ms', '50 ms']);
    });

    test('imported pauseTest and resumeTest allow customizations by test frameworks', async function(
      assert
    ) {
      assert.expect(2);

      let originalPauseTest = context.pauseTest;
      context.pauseTest = () => {
        assert.ok(true, 'contexts pauseTest was called');
        return originalPauseTest();
      };

      let originalResumeTest = context.resumeTest;
      context.resumeTest = () => {
        assert.ok(true, 'customized resumeTest was called');
        return originalResumeTest();
      };

      let promise = pauseTest();

      resumeTest();

      await promise;
    });

    test('pauseTest sets up a window.resumeTest to easily resume', async function(assert) {
      assert.equal(window.resumeTest, undefined, 'precond - starts out as undefined');

      let promise = context.pauseTest();

      assert.equal(
        resumeTest,
        window.resumeTest,
        'window.resumeTest is the same as this.resumeTest'
      );

      context.resumeTest();

      assert.equal(window.resumeTest, undefined, 'window.resumeTest is cleared after invocation');

      await promise;
    });
  });

  module('with custom options', function() {
    test('it can specify a custom resolver', async function(assert) {
      context = {};
      let resolver = createCustomResolver({
        'service:foo': Service.extend({ isFoo: 'maybe?' }),
      });
      await setupContext(context, { resolver });
      let { owner } = context;
      let instance = owner.lookup('service:foo');
      assert.equal(instance.isFoo, 'maybe?', 'uses the custom resolver');
    });
  });

  test('Ember.testing', async function(assert) {
    assert.notOk(Ember.testing, 'precond - Ember.testing is falsey before setup');

    context = {};
    let promise = setupContext(context);

    assert.ok(Ember.testing, 'Ember.testing is truthy sync after setup');

    await promise;

    assert.ok(Ember.testing, 'Ember.testing is truthy async after setup');
  });
});
