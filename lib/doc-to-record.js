//const Buffer = require('buffer').Buffer;
var _ = require('@sailshq/lodash');
//const Firestore = require('@google-cloud/firestore');

module.exports = function docToRecord(dsEntry, tableName, doc) {
  var data = doc.data();

  if (!data[dsEntry.primaryKeyCols[tableName]]) {
    data[dsEntry.primaryKeyCols[tableName]] = doc.id;
  }

  _.map(_.keys(data), key => {
    if (_.includes(dsEntry.timestampCols[tableName], key) && data[key]) {
      data[key] = data[key].toMillis();
    } else if (_.includes(dsEntry.dateCols[tableName], key) && data[key]) {
      data[key] = data[key].toDate();
    } else if (_.includes(dsEntry.blobCols[tableName], key) && data[key]) {
      data[key] = data[key].toUint8Array();
    }
  });

  return data;
};
