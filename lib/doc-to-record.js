//const Buffer = require('buffer').Buffer;
var _ = require('@sailshq/lodash');
//const Firestore = require('@google-cloud/firestore');

module.exports = function docToRecord(dsEntry, query, doc) {
  const tableName = query.using;
  var data = query.criteria && query.criteria.select ? _.reduce(query.criteria.select, (map, key) => {
    if (key === dsEntry.primaryKeyCols[tableName]) {
      map[dsEntry.primaryKeyCols[tableName]] = doc.id;
    } else if (_.includes(dsEntry.timestampCols[tableName], key) && doc.get(key)) {
      map[key] = doc.get(key).toMillis();
    } else if (_.includes(dsEntry.dateCols[tableName], key) && doc.get(key)) {
      map[key] = doc.get(key).toDate();
    } else if (_.includes(dsEntry.blobCols[tableName], key) && doc.get(key)) {
      map[key] = doc.get(key).toUint8Array();
    } else {
      map[key] = doc.get(key);
    }
    return map;
  }, {}) : doc.data();

  if (!data[dsEntry.primaryKeyCols[tableName]]) {
    data[dsEntry.primaryKeyCols[tableName]] = doc.id;
  }

  return data;
};
