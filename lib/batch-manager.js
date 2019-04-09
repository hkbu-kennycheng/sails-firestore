
var _ = require('@sailshq/lodash');
var async = require('async');

const BATCH_SIZE = 500;

function BatchManager(dbRef, size) {
  this.db = dbRef;
  this.size = parseInt(size);
  this.batches = _.map(new Array(Math.ceil(this.size / BATCH_SIZE)), () => this.db.batch());
}

BatchManager.prototype.getBatches = function() {
  return this.batches;
};

BatchManager.prototype.getBatchByJobIndex = function(index) {
  return this.batches[Math.floor(parseInt(index) / this.size)];
};

BatchManager.prototype.commitBatches = function() {
  return new Promise((resolve, reject) => {
    async.each(this.batches, async (prev, next) => {
      try {
        await prev.commit();
        if (next) {
          return next();
        }
      } catch(e) { reject(e); }
    }, () => {
      resolve();
    });
  });
};

module.exports = BatchManager;


