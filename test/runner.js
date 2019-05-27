/**
 * Test runner dependencies
 */
//var mocha = require('mocha');
var TestRunner = require('waterline-adapter-tests');

var adapter = require('../index');
// fake it as sails-mongo for string type primary key
//adapter.identity = 'sails-mongo';
/**
 * Integration Test Runner
 *
 * Uses the `waterline-adapter-tests` module to
 * run mocha tests against the specified interfaces
 * of the currently-implemented Waterline adapter API.
 */
new TestRunner({

  // Load the adapter module.
  adapter: adapter,

  // Default adapter config to use.
  config: {
    schema: false,
    serviceAccount: require('../../../../service-firebase-adminsdk-key')
  },

  // The set of adapter interfaces to test against.
  interfaces: [/*'associations',*/ 'migratable', 'semantic', 'sql', 'queryable']
});
