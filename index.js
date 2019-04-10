/**
 * Module dependencies
 */

const _ = require('@sailshq/lodash');
const each = require('async').each;
const admin = require('firebase-admin');
const generateQueryByWhere = require('./lib/generate-query-by-where');
const preProcessRecord = require('./lib/pre-process-record');
const docToRecord = require('./lib/doc-to-record');
const BatchManager = require('./lib/batch-manager');

/**
 * Module state
 */

// Private var to track of all the datastores that use this adapter.  In order for your adapter
// to be able to connect to the database, you'll want to expose this var publicly as well.
// (See the `registerDatastore()` method for info on the format of each datastore entry herein.)
//
// > Note that this approach of process global state will be changing in an upcoming version of
// > the Waterline adapter spec (a breaking change).  But if you follow the conventions laid out
// > below in this adapter template, future upgrades should be a breeze.
var registeredDatastores = {};


/**
 * @kenny/sails-firestore
 *
 * Expose the adapater definition.
 *
 * > Most of the methods below are optional.
 * >
 * > If you don't need / can't get to every method, just implement
 * > what you have time for.  The other methods will only fail if
 * > you try to call them!
 * >
 * > For many adapters, this file is all you need.  For very complex adapters, you may need more flexiblity.
 * > In any case, it's probably a good idea to start with one file and refactor only if necessary.
 * > If you do go that route, it's conventional in Node to create a `./lib` directory for your private submodules
 * > and `require` them at the top of this file with other dependencies. e.g.:
 * > ```
 * > var updateMethod = require('./lib/update');
 * > ```
 *
 * @type {Dictionary}
 */
module.exports = {


  // The identity of this adapter, to be referenced by datastore configurations in a Sails app.
  identity: 'sails-firestore',


  // Waterline Adapter API Version
  //
  // > Note that this is not necessarily tied to the major version release cycle of Sails/Waterline!
  // > For example, Sails v1.5.0 might generate apps which use sails-hook-orm@2.3.0, which might
  // > include Waterline v0.13.4.  And all those things might rely on version 1 of the adapter API.
  // > But Waterline v0.13.5 might support version 2 of the adapter API!!  And while you can generally
  // > trust semantic versioning to predict/understand userland API changes, be aware that the maximum
  // > and/or minimum _adapter API version_ supported by Waterline could be incremented between major
  // > version releases.  When possible, compatibility for past versions of the adapter spec will be
  // > maintained; just bear in mind that this is a _separate_ number, different from the NPM package
  // > version.  sails-hook-orm verifies this adapter API version when loading adapters to ensure
  // > compatibility, so you should be able to rely on it to provide a good error message to the Sails
  // > applications which use this adapter.
  adapterApiVersion: 1,


  // Default datastore configuration.
  defaults: {
    // foo: 'bar',
  },


  //  ╔═╗═╗ ╦╔═╗╔═╗╔═╗╔═╗  ┌─┐┬─┐┬┬  ┬┌─┐┌┬┐┌─┐
  //  ║╣ ╔╩╦╝╠═╝║ ║╚═╗║╣   ├─┘├┬┘│└┐┌┘├─┤ │ ├┤
  //  ╚═╝╩ ╚═╩  ╚═╝╚═╝╚═╝  ┴  ┴└─┴ └┘ ┴ ┴ ┴ └─┘
  //  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐┌─┐
  //   ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤ └─┐
  //  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘└─┘
  // This allows outside access to this adapter's internal registry of datastore entries,
  // for use in datastore methods like `.leaseConnection()`.
  datastores: registeredDatastores,



  //////////////////////////////////////////////////////////////////////////////////////////////////
  //  ██╗     ██╗███████╗███████╗ ██████╗██╗   ██╗ ██████╗██╗     ███████╗                        //
  //  ██║     ██║██╔════╝██╔════╝██╔════╝╚██╗ ██╔╝██╔════╝██║     ██╔════╝                        //
  //  ██║     ██║█████╗  █████╗  ██║      ╚████╔╝ ██║     ██║     █████╗                          //
  //  ██║     ██║██╔══╝  ██╔══╝  ██║       ╚██╔╝  ██║     ██║     ██╔══╝                          //
  //  ███████╗██║██║     ███████╗╚██████╗   ██║   ╚██████╗███████╗███████╗                        //
  //  ╚══════╝╚═╝╚═╝     ╚══════╝ ╚═════╝   ╚═╝    ╚═════╝╚══════╝╚══════╝                        //
  //                                                                                              //
  // Lifecycle adapter methods:                                                                   //
  // Methods related to setting up and tearing down; registering/un-registering datastores.       //
  //////////////////////////////////////////////////////////////////////////////////////////////////

  /**
   *  ╦═╗╔═╗╔═╗╦╔═╗╔╦╗╔═╗╦═╗  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐
   *  ╠╦╝║╣ ║ ╦║╚═╗ ║ ║╣ ╠╦╝   ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤
   *  ╩╚═╚═╝╚═╝╩╚═╝ ╩ ╚═╝╩╚═  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘
   * Register a new datastore with this adapter.  This usually involves creating a new
   * connection manager (e.g. MySQL pool or MongoDB client) for the underlying database layer.
   *
   * > Waterline calls this method once for every datastore that is configured to use this adapter.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Dictionary}   datastoreConfig            Dictionary (plain JavaScript object) of configuration options for this datastore (e.g. host, port, etc.)
   * @param  {Dictionary}   physicalModelsReport       Experimental: The physical models using this datastore (keyed by "tableName"-- NOT by `identity`!).  This may change in a future release of the adapter spec.
   *         @property {Dictionary} *  [Info about a physical model using this datastore.  WARNING: This is in a bit of an unusual format.]
   *                   @property {String} primaryKey        [the name of the primary key attribute (NOT the column name-- the attribute name!)]
   *                   @property {Dictionary} definition    [the physical-layer report from waterline-schema.  NOTE THAT THIS IS NOT A NORMAL MODEL DEF!]
   *                   @property {String} tableName         [the model's `tableName` (same as the key this is under, just here for convenience)]
   *                   @property {String} identity          [the model's `identity`]
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done                       A callback to trigger after successfully registering this datastore, or if an error is encountered.
   *               @param {Error?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  registerDatastore: function (datastoreConfig, physicalModelsReport, done) {

    const models = physicalModelsReport;
    // Grab the unique name for this datastore for easy access below.
    var datastoreName = datastoreConfig.identity;

    // Some sanity checks:
    if (!datastoreName) {
      return done(new Error('Consistency violation: A datastore should contain an "identity" property: a special identifier that uniquely identifies it across this app.  This should have been provided by Waterline core!  If you are seeing this message, there could be a bug in Waterline, or the datastore could have become corrupted by userland code, or other code in this adapter.  If you determine that this is a Waterline bug, please report this at https://sailsjs.com/bugs.'));
    }
    if (registeredDatastores[datastoreName]) {
      return done(new Error('Consistency violation: Cannot register datastore: `' + datastoreName + '`, because it is already registered with this adapter!  This could be due to an unexpected race condition in userland code (e.g. attempting to initialize Waterline more than once), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'));
    }

    // Ensure a `serviceAccount` was configured.
    if (!datastoreConfig.serviceAccount) {
      return done(new Error('Invalid configuration for datastore `' + datastoreName + '`:  Missing `serviceAccount` (See https://sailsjs.com/config/datastores#?the-connection-url for more info.)'));
    }

    var app = admin.initializeApp({
      credential: admin.credential.cert(datastoreConfig.serviceAccount)
    }, 'sails-firestore-'+datastoreName);

    registeredDatastores[datastoreName] = {
      config: datastoreConfig,
      driver: app.firestore(),
      sequences: {},
      primaryKeyCols: {},
      timestampCols: {},
      dateCols: {},
      blobCols: {}
    };

    each(_.keys(models), (modelIdentity, next) => {

      // Get the model definition.
      var modelDef = models[modelIdentity];

      var primaryKeyAttr = modelDef.definition[modelDef.primaryKey];

      // Ensure that the model's primary key has either `autoIncrement`, `unique` or `required`
      if (!(primaryKeyAttr.required === true || (primaryKeyAttr.autoMigrations && primaryKeyAttr.autoMigrations.autoIncrement === true) || (primaryKeyAttr.autoMigrations && primaryKeyAttr.autoMigrations.unique === true))) {
        return next(new Error('In model `' + modelIdentity + '`, primary key `' + modelDef.primaryKey + '` must have either `required`, `unique` or `autoIncrement` set.'));
      }

      // Get the model's primary key column.
      var primaryKeyCol = modelDef.definition[modelDef.primaryKey].columnName;

      // Store the primary key column in the datastore's primary key columns hash.
      registeredDatastores[datastoreName].primaryKeyCols[modelDef.tableName] = primaryKeyCol;

      // Declare a var to hold the table's sequence name (if any).
      var sequenceName = null;

      _.each(modelDef.definition, (val, attributeName) => {

        // keep track of timestamp cols
        registeredDatastores[datastoreName].timestampCols[modelDef.tableName] = registeredDatastores[datastoreName].timestampCols[modelDef.tableName] || [];
        if (val.autoMigrations && val.autoMigrations.columnType === '_numbertimestamp') {
          registeredDatastores[datastoreName].timestampCols[modelDef.tableName].push(val.columnName);
        }

        // If the attribute has `autoIncrement` on it, and it's the primary key,
        // initialize a sequence for it.
        if (val.autoMigrations && val.autoMigrations.autoIncrement && (attributeName === modelDef.primaryKey)) {
          sequenceName = modelDef.tableName + '_' + val.columnName + '_seq';
          registeredDatastores[datastoreName].sequences[sequenceName] = 0;
        }

        registeredDatastores[datastoreName].dateCols[modelDef.tableName] = registeredDatastores[datastoreName].dateCols[modelDef.tableName] || [];
        registeredDatastores[datastoreName].blobCols[modelDef.tableName] = registeredDatastores[datastoreName].blobCols[modelDef.tableName] || [];
        if (val.type === 'ref' && val.autoMigrations && val.autoMigrations.columnType === 'datetime') {
          registeredDatastores[datastoreName].dateCols[modelDef.tableName].push(val.columnName);
        } else if (val.type === 'ref') {
          registeredDatastores[datastoreName].blobCols[modelDef.tableName].push(val.columnName);
        }

      });

      if (sequenceName) {
        registeredDatastores[datastoreName].driver.collection(modelDef.tableName).orderBy(primaryKeyCol, 'DESC').limit(1).get().then(snap => {
          if (snap.size > 0) {
            registeredDatastores[datastoreName].sequences[sequenceName] = parseInt(snap.docs[0].id);
          } else {
            registeredDatastores[datastoreName].sequences[sequenceName] = 0;
          }
          return next();
        }).catch(next);
      } else {
        return next();
      }
    }, done);
  },


  /**
   *  ╔╦╗╔═╗╔═╗╦═╗╔╦╗╔═╗╦ ╦╔╗╔
   *   ║ ║╣ ╠═╣╠╦╝ ║║║ ║║║║║║║
   *   ╩ ╚═╝╩ ╩╩╚══╩╝╚═╝╚╩╝╝╚╝
   * Tear down (un-register) a datastore.
   *
   * Fired when a datastore is unregistered.  Typically called once for
   * each relevant datastore when the server is killed, or when Waterline
   * is shut down after a series of tests.  Useful for destroying the manager
   * (i.e. terminating any remaining open connections, etc.).
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String} datastoreName   The unique name (identity) of the datastore to un-register.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function} done          Callback
   *               @param {Error?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  teardown: function (datastoreName, done) {

    // Look up the datastore entry (manager/driver/config).
    var dsEntry = registeredDatastores[datastoreName];

    // Sanity check:
    if (_.isUndefined(dsEntry)) {
      return done(new Error('Consistency violation: Attempting to tear down a datastore (`'+datastoreName+'`) which is not currently registered with this adapter.  This is usually due to a race condition in userland code (e.g. attempting to tear down the same ORM instance more than once), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'));
    }

    delete registeredDatastores[datastoreName];
    return done();

  },


  //////////////////////////////////////////////////////////////////////////////////////////////////
  //  ██████╗ ███╗   ███╗██╗                                                                      //
  //  ██╔══██╗████╗ ████║██║                                                                      //
  //  ██║  ██║██╔████╔██║██║                                                                      //
  //  ██║  ██║██║╚██╔╝██║██║                                                                      //
  //  ██████╔╝██║ ╚═╝ ██║███████╗                                                                 //
  //  ╚═════╝ ╚═╝     ╚═╝╚══════╝                                                                 //
  // (D)ata (M)anipulation (L)anguage                                                             //
  //                                                                                              //
  // DML adapter methods:                                                                         //
  // Methods related to manipulating records stored in the database.                              //
  //////////////////////////////////////////////////////////////////////////////////////////////////


  /**
   *  ╔═╗╦═╗╔═╗╔═╗╔╦╗╔═╗
   *  ║  ╠╦╝║╣ ╠═╣ ║ ║╣
   *  ╚═╝╩╚═╚═╝╩ ╩ ╩ ╚═╝
   * Create a new record.
   *
   * (e.g. add a new row to a SQL table, or a new document to a MongoDB collection.)
   *
   * > Note that depending on the value of `query.meta.fetch`,
   * > you may be expected to return the physical record that was
   * > created (a dictionary) as the second argument to the callback.
   * > (Otherwise, exclude the 2nd argument or send back `undefined`.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName The name of the datastore to perform the query on.
   * @param  {Dictionary}   query         The stage-3 query to perform.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done          Callback
   *               @param {Error?}
   *               @param {Dictionary?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  create: function (datastoreName, query, done) {

    // Look up the datastore entry (manager/driver/config).
    var dsEntry = registeredDatastores[datastoreName];

    // Sanity check:
    if (_.isUndefined(dsEntry)) {
      return done(new Error('Consistency violation: Cannot do that with datastore (`'+datastoreName+'`) because no matching datastore entry is registered in this adapter!  This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'));
    }

    var db = dsEntry.driver.collection(query.using);

    var primaryKeyCol = dsEntry.primaryKeyCols[query.using];
    var sequenceName = query.using + '_' + primaryKeyCol + '_seq';
    if (!_.isUndefined(dsEntry.sequences[sequenceName]) && _.isNull(query.newRecord[primaryKeyCol]) || query.newRecord[primaryKeyCol] === 0) {
      query.newRecord[primaryKeyCol] = ++dsEntry.sequences[sequenceName];
    }

    query.newRecord[primaryKeyCol] = query.newRecord[primaryKeyCol] || db.doc().id;

    var data = preProcessRecord(dsEntry, query.using, query.newRecord);
    db.doc(query.newRecord[primaryKeyCol].toString()).set(data).then(() => {
      return done(null, query.newRecord);
    }).catch(err => { return done(err); });
  },


  /**
   *  ╔═╗╦═╗╔═╗╔═╗╔╦╗╔═╗  ╔═╗╔═╗╔═╗╦ ╦
   *  ║  ╠╦╝║╣ ╠═╣ ║ ║╣   ║╣ ╠═╣║  ╠═╣
   *  ╚═╝╩╚═╚═╝╩ ╩ ╩ ╚═╝  ╚═╝╩ ╩╚═╝╩ ╩
   * Create multiple new records.
   *
   * > Note that depending on the value of `query.meta.fetch`,
   * > you may be expected to return the array of physical records
   * > that were created as the second argument to the callback.
   * > (Otherwise, exclude the 2nd argument or send back `undefined`.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName The name of the datastore to perform the query on.
   * @param  {Dictionary}   query         The stage-3 query to perform.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done            Callback
   *               @param {Error?}
   *               @param {Array?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  createEach: function (datastoreName, query, done) {

    // Look up the datastore entry (manager/driver/config).
    var dsEntry = registeredDatastores[datastoreName];

    // Sanity check:
    if (_.isUndefined(dsEntry)) {
      return done(new Error('Consistency violation: Cannot do that with datastore (`'+datastoreName+'`) because no matching datastore entry is registered in this adapter!  This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'));
    }

    // Get the primary key column for thie table.
    var primaryKeyCol = dsEntry.primaryKeyCols[query.using];

    // Get the possible sequence name for this table.
    var sequenceName = query.using + '_' + primaryKeyCol + '_seq';

    const db = dsEntry.driver.collection(query.using);
    const batchManager = new BatchManager(dsEntry.driver, query.newRecords.length);

    _.each(query.newRecords, (newRecord, i) => {

      // If there is a sequence and `null` is being sent in for this record's primary key,
      // set it to the next value of the sequence.
      if (!_.isUndefined(dsEntry.sequences[sequenceName]) && _.isNull(newRecord[primaryKeyCol]) || newRecord[primaryKeyCol] === 0) {
        newRecord[primaryKeyCol] = ++dsEntry.sequences[sequenceName];
      }

      newRecord[primaryKeyCol] = newRecord[primaryKeyCol] || db.doc().id;

      query.newRecords[i] = newRecord;

      const data = preProcessRecord(dsEntry, query.using, newRecord);

      batchManager.getBatchByJobIndex(i).set(db.doc(newRecord[primaryKeyCol].toString()), data);
    });

    batchManager.commitBatches().then(() => {
      return done(null, query.newRecords);
    }).catch(err => { return done(err); });

  },



  /**
   *  ╦ ╦╔═╗╔╦╗╔═╗╔╦╗╔═╗
   *  ║ ║╠═╝ ║║╠═╣ ║ ║╣
   *  ╚═╝╩  ═╩╝╩ ╩ ╩ ╚═╝
   * Update matching records.
   *
   * > Note that depending on the value of `query.meta.fetch`,
   * > you may be expected to return the array of physical records
   * > that were updated as the second argument to the callback.
   * > (Otherwise, exclude the 2nd argument or send back `undefined`.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName The name of the datastore to perform the query on.
   * @param  {Dictionary}   query         The stage-3 query to perform.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done            Callback
   *               @param {Error?}
   *               @param {Array?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  update: function (datastoreName, query, done) {

    // Look up the datastore entry (manager/driver/config).
    var dsEntry = registeredDatastores[datastoreName];

    // Sanity check:
    if (_.isUndefined(dsEntry)) {
      return done(new Error('Consistency violation: Cannot do that with datastore (`'+datastoreName+'`) because no matching datastore entry is registered in this adapter!  This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'));
    }

    // Get the primary key column for thie table.
    var primaryKeyCol = dsEntry.primaryKeyCols[query.using];

    // Get the possible sequence name for this table.
    //var sequenceName = query.using + '_' + primaryKeyCol + '_seq';

    const db = dsEntry.driver.collection(query.using);

    var records = [];
    generateQueryByWhere(dsEntry, query).get().then(snapshot => {

      const data = preProcessRecord(dsEntry, query.using, query.valuesToSet);

      if (snapshot.exists || snapshot.size === 1) {
        var docSnap = snapshot.size === 1 ? snapshot.docs[0] : snapshot;
        var origData = docToRecord(dsEntry, query.using, docSnap);
        var newData = _.merge(origData, query.valuesToSet);
        records = [newData];

        if (query.valuesToSet[primaryKeyCol] && !_.isEqual(query.valuesToSet[primaryKeyCol].toString(), docSnap.id)) {

          const batchManager = new BatchManager(dsEntry.driver, 2);
          batchManager.getBatchByJobIndex(0).delete(docSnap.ref);
          batchManager.getBatchByJobIndex(1).set(db.doc(query.valuesToSet[primaryKeyCol].toString()), preProcessRecord(dsEntry, query.using, newData));

          return batchManager.commitBatches();
        }

        return docSnap.ref.update(preProcessRecord(dsEntry, query.using, query.valuesToSet));
      }

      if (snapshot.empty) { return Promise.resolve(); }

      const batchManager = new BatchManager(dsEntry.driver, snapshot.size);

      _.each(snapshot.docs, (docSnap, i) => {
        batchManager.getBatchByJobIndex(i).update(docSnap.ref, data);
      });

      if (query.meta && query.meta.fetch) {
        records = _.map(snapshot.docs, doc => _.merge(doc.data(), query.valuesToSet));
      }

      return batchManager.commitBatches();

    }).then(() => {
      return done(null, query.meta && query.meta.fetch ? records : null);
    }).catch(err => { return done(err);});
  },


  /**
   *  ╔╦╗╔═╗╔═╗╔╦╗╦═╗╔═╗╦ ╦
   *   ║║║╣ ╚═╗ ║ ╠╦╝║ ║╚╦╝
   *  ═╩╝╚═╝╚═╝ ╩ ╩╚═╚═╝ ╩
   * Destroy one or more records.
   *
   * > Note that depending on the value of `query.meta.fetch`,
   * > you may be expected to return the array of physical records
   * > that were destroyed as the second argument to the callback.
   * > (Otherwise, exclude the 2nd argument or send back `undefined`.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName The name of the datastore to perform the query on.
   * @param  {Dictionary}   query         The stage-3 query to perform.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done            Callback
   *               @param {Error?}
   *               @param {Array?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  destroy: function (datastoreName, query, done) {

    // Look up the datastore entry (manager/driver/config).
    var dsEntry = registeredDatastores[datastoreName];

    // Sanity check:
    if (_.isUndefined(dsEntry)) {
      return done(new Error('Consistency violation: Cannot do that with datastore (`'+datastoreName+'`) because no matching datastore entry is registered in this adapter!  This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'));
    }

    var records = [];

    generateQueryByWhere(dsEntry, query).get().then(snapshot => {

      if (snapshot.exists || snapshot.size === 1) {
        var docSnap = snapshot.size === 1 ? snapshot.docs[0] : snapshot;
        var origData = docToRecord(dsEntry, query.using, docSnap);
        records = [origData];

        return docSnap.ref.delete();
      }

      if (snapshot.empty) {return Promise.resolve();}

      const batchManager = new BatchManager(dsEntry.driver, snapshot.size);

      _.each(snapshot.docs, (docSnap, i) => {
        if (query.meta && query.meta.fetch) {
          records.push(docToRecord(dsEntry, query.using, docSnap));
        }
        batchManager.getBatchByJobIndex(i).delete(docSnap.ref);
      });

      return batchManager.commitBatches();

    }).then(() => {
      return done(null, query.meta && query.meta.fetch ? records : null);
    }).catch(err => { return done(err);});
  },



  //////////////////////////////////////////////////////////////////////////////////////////////////
  //  ██████╗  ██████╗ ██╗                                                                        //
  //  ██╔══██╗██╔═══██╗██║                                                                        //
  //  ██║  ██║██║   ██║██║                                                                        //
  //  ██║  ██║██║▄▄ ██║██║                                                                        //
  //  ██████╔╝╚██████╔╝███████╗                                                                   //
  //  ╚═════╝  ╚══▀▀═╝ ╚══════╝                                                                   //
  // (D)ata (Q)uery (L)anguage                                                                    //
  //                                                                                              //
  // DQL adapter methods:                                                                         //
  // Methods related to fetching information from the database (e.g. finding stored records).     //
  //////////////////////////////////////////////////////////////////////////////////////////////////


  /**
   *  ╔═╗╦╔╗╔╔╦╗
   *  ╠╣ ║║║║ ║║
   *  ╚  ╩╝╚╝═╩╝
   * Find matching records.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName The name of the datastore to perform the query on.
   * @param  {Dictionary}   query         The stage-3 query to perform.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done            Callback
   *               @param {Error?}
   *               @param {Array}  [matching physical records]
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  find: function (datastoreName, query, done) {

    // Look up the datastore entry (manager/driver/config).
    var dsEntry = registeredDatastores[datastoreName];

    // Sanity check:
    if (_.isUndefined(dsEntry)) {
      return done(new Error('Consistency violation: Cannot do that with datastore (`'+datastoreName+'`) because no matching datastore entry is registered in this adapter!  This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'));
    }

    // Perform the query and send back a result.
    //
    // > TODO: Replace this setTimeout with real logic that calls
    // > `done()` when finished. (Or remove this method from the
    // > adapter altogether
    //setTimeout(function(){
    //  return done(new Error('Adapter method (`find`) not implemented yet.'));
    //}, 16);

    generateQueryByWhere(dsEntry, query).get().then(snapshot => {
      if (snapshot.id)
      {return done(null, [docToRecord(dsEntry, query.using, snapshot)]);}

      if (snapshot.empty) {return done(null, []);}

      return done(null, snapshot.docs.map((value) => {
        return docToRecord(dsEntry, query.using, value);
      }));
    }).catch(err => { return done(err);});
  },

  /**
   *  ╔═╗╔═╗╦ ╦╔╗╔╔╦╗
   *  ║  ║ ║║ ║║║║ ║
   *  ╚═╝╚═╝╚═╝╝╚╝ ╩
   * Get the number of matching records.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName The name of the datastore to perform the query on.
   * @param  {Dictionary}   query         The stage-3 query to perform.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done          Callback
   *               @param {Error?}
   *               @param {Number}  [the number of matching records]
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  count: function (datastoreName, query, done) {

    // Look up the datastore entry (manager/driver/config).
    var dsEntry = registeredDatastores[datastoreName];

    // Sanity check:
    if (_.isUndefined(dsEntry)) {
      return done(new Error('Consistency violation: Cannot do that with datastore (`'+datastoreName+'`) because no matching datastore entry is registered in this adapter!  This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'));
    }

    // Perform the query and send back a result.
    //
    // > TODO: Replace this setTimeout with real logic that calls
    // > `done()` when finished. (Or remove this method from the
    // > adapter altogether
    //setTimeout(function(){
    //  return done(new Error('Adapter method (`count`) not implemented yet.'));
    //}, 16);

    generateQueryByWhere(dsEntry, query).get().then(snapshot => {

      if (snapshot.id) {return done(null, 1);}

      if (snapshot.empty) {return done(null, 0);}

      return done(null, snapshot.size);
    }).catch(err => { return done(err);});
  },


  /**
   *  ╔═╗╦ ╦╔╦╗
   *  ╚═╗║ ║║║║
   *  ╚═╝╚═╝╩ ╩
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName The name of the datastore to perform the query on.
   * @param  {Dictionary}   query         The stage-3 query to perform.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done          Callback
   *               @param {Error?}
   *               @param {Number}  [the sum]
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  sum: function (datastoreName, query, done) {

    // Look up the datastore entry (manager/driver/config).
    var dsEntry = registeredDatastores[datastoreName];

    // Sanity check:
    if (_.isUndefined(dsEntry)) {
      return done(new Error('Consistency violation: Cannot do that with datastore (`'+datastoreName+'`) because no matching datastore entry is registered in this adapter!  This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'));
    }

    // Perform the query and send back a result.
    //
    // > TODO: Replace this setTimeout with real logic that calls
    // > `done()` when finished. (Or remove this method from the
    // > adapter altogether
    setTimeout(() => {
      return done(new Error('Adapter method (`sum`) not implemented yet.'));
    }, 16);

  },


  /**
   *  ╔═╗╦  ╦╔═╗
   *  ╠═╣╚╗╔╝║ ╦
   *  ╩ ╩ ╚╝ ╚═╝
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName The name of the datastore to perform the query on.
   * @param  {Dictionary}   query         The stage-3 query to perform.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done          Callback
   *               @param {Error?}
   *               @param {Number}  [the average ("mean")]
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  avg: function (datastoreName, query, done) {

    // Look up the datastore entry (manager/driver/config).
    var dsEntry = registeredDatastores[datastoreName];

    // Sanity check:
    if (_.isUndefined(dsEntry)) {
      return done(new Error('Consistency violation: Cannot do that with datastore (`'+datastoreName+'`) because no matching datastore entry is registered in this adapter!  This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'));
    }

    // Perform the query and send back a result.
    //
    // > TODO: Replace this setTimeout with real logic that calls
    // > `done()` when finished. (Or remove this method from the
    // > adapter altogether
    setTimeout(() => {
      return done(new Error('Adapter method (`avg`) not implemented yet.'));
    }, 16);

  },



  //////////////////////////////////////////////////////////////////////////////////////////////////
  //  ██████╗ ██████╗ ██╗                                                                         //
  //  ██╔══██╗██╔══██╗██║                                                                         //
  //  ██║  ██║██║  ██║██║                                                                         //
  //  ██║  ██║██║  ██║██║                                                                         //
  //  ██████╔╝██████╔╝███████╗                                                                    //
  //  ╚═════╝ ╚═════╝ ╚══════╝                                                                    //
  // (D)ata (D)efinition (L)anguage                                                               //
  //                                                                                              //
  // DDL adapter methods:                                                                         //
  // Methods related to modifying the underlying structure of physical models in the database.    //
  //////////////////////////////////////////////////////////////////////////////////////////////////

  /**
   *  ╔╦╗╔═╗╔═╗╦╔╗╔╔═╗
   *   ║║║╣ ╠╣ ║║║║║╣
   *  ═╩╝╚═╝╚  ╩╝╚╝╚═╝
   * Build a new physical model (e.g. table/etc) to use for storing records in the database.
   *
   * (This is used for schema migrations.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName The name of the datastore containing the table to define.
   * @param  {String}       tableName     The name of the table to define.
   * @param  {Dictionary}   definition    The physical model definition (not a normal Sails/Waterline model-- log this for details.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done           Callback
   *               @param {Error?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  define: function (datastoreName, tableName, definition, done) {

    // Look up the datastore entry (manager/driver/config).
    var dsEntry = registeredDatastores[datastoreName];

    // Sanity check:
    if (_.isUndefined(dsEntry)) {
      return done(new Error('Consistency violation: Cannot do that with datastore (`'+datastoreName+'`) because no matching datastore entry is registered in this adapter!  This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'));
    }

    return done();
  },


  /**
   *  ╔╦╗╦═╗╔═╗╔═╗
   *   ║║╠╦╝║ ║╠═╝
   *  ═╩╝╩╚═╚═╝╩
   * Drop a physical model (table/etc.) from the database, including all of its records.
   *
   * (This is used for schema migrations.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName The name of the datastore containing the table to drop.
   * @param  {String}       tableName     The name of the table to drop.
   * @param  {Ref}          unused        Currently unused (do not use this argument.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done          Callback
   *               @param {Error?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  drop: function (datastoreName, tableName, unused, done) {

    // Look up the datastore entry (manager/driver/config).
    var dsEntry = registeredDatastores[datastoreName];

    // Sanity check:
    if (_.isUndefined(dsEntry)) {
      return done(new Error('Consistency violation: Cannot do that with datastore (`'+datastoreName+'`) because no matching datastore entry is registered in this adapter!  This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'));
    }

    dsEntry.driver.collection(tableName).get().then(snapshot => {

      if (snapshot.empty) {return Promise.resolve();}

      const batchManager = new BatchManager(dsEntry.driver, snapshot.size);

      _.each(snapshot.docs, (docSnap, i) => {
        batchManager.getBatchByJobIndex(i).delete(docSnap.ref);
      });

      return batchManager.commitBatches();

    }).then(done).catch(done);

  },


  /**
   *  ╔═╗╔═╗╔╦╗  ┌─┐┌─┐┌─┐ ┬ ┬┌─┐┌┐┌┌─┐┌─┐
   *  ╚═╗║╣  ║   └─┐├┤ │─┼┐│ │├┤ ││││  ├┤
   *  ╚═╝╚═╝ ╩   └─┘└─┘└─┘└└─┘└─┘┘└┘└─┘└─┘
   * Set a sequence in a physical model (specifically, the auto-incrementing
   * counter for the primary key) to the specified value.
   *
   * (This is used for schema migrations.)
   *
   * > NOTE - If your adapter doesn't support sequence entities (like PostgreSQL),
   * > you should remove this method.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName   The name of the datastore containing the table/etc.
   * @param  {String}       sequenceName    The name of the sequence to update.
   * @param  {Number}       sequenceValue   The new value for the sequence (e.g. 1)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done
   *               @param {Error?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  setSequence: function (datastoreName, sequenceName, sequenceValue, done) {

    // Look up the datastore entry (manager/driver/config).
    var dsEntry = registeredDatastores[datastoreName];

    // Sanity check:
    if (_.isUndefined(dsEntry)) {
      return done(new Error('Consistency violation: Cannot do that with datastore (`'+datastoreName+'`) because no matching datastore entry is registered in this adapter!  This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'));
    }

    dsEntry.sequences[sequenceName] = sequenceValue;

    return done();

  },


};
