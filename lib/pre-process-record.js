const Uint8Array= require('buffer').Uint8Array;
const _ = require('@sailshq/lodash');
const Firestore = require('@google-cloud/firestore');

module.exports = function preProcessRecord(dsEntry, tableName, _record) {

  var record = _.cloneDeep(_record);

  //delete record[dsEntry.primaryKeyCols[tableName]];

  _.map(_.keys(record), key => {
    if (_.includes(dsEntry.timestampCols[tableName], key) && record[key]) {
      record[key] = Firestore.Timestamp.fromMillis(record[key]);
    } else if (_.includes(dsEntry.dateCols[tableName], key) && record[key]) {
      record[key] = Firestore.Timestamp.fromDate(record[key]);
    } else if (_.includes(dsEntry.blobCols[tableName], key) && record[key]) {
      if (record[key] instanceof Buffer) {
        record[key] = Firestore.Blob.fromUint8Array(new Uint8Array(record[key].buffer, record[key].byteOffset, record[key].byteLength / Uint8Array.BYTES_PER_ELEMENT));
      } else {
        record[key] = Firestore.Blob.fromUint8Array(new TextEncoder().encode(record[key].toString()));
      }
    }
  });

  return record;
};
