/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');

module.exports = function generateQueryByWhere(dsEntry, query) {

  const whereClause = _.cloneDeep(query.criteria.where);
  const tableName = query.using;
  const dbRef = dsEntry.driver.collection(query.using);

  if (_.isEmpty(whereClause))
  {return dbRef;}

  const reduceAndWhere = function(ref, branch) {
    const loneKey = _.first(_.keys(branch));
    const val = branch[loneKey];

    switch(loneKey) {
      case 'or':
        throw new Error('Consistency violation: where-clause modifier or is not valid!');
      case 'and':
        return _.reduce(val, reduceAndWhere, ref);
      case dsEntry.primaryKeyCols[tableName]:
        return ref.doc(''+val);
    }

    if (!_.isObject(val)) {
      return ref.where(loneKey, '==', val);
    }

    const ops = ['<', '<=', '>', '>=', '!=', 'nin', 'in', 'like'];
    if (_.isEmpty(_.intersection([ops, _.keys(val)]))) {
      return _.reduce(val, reduceAndWhere, ref);
    }

    const opKey = _.first(_.keys(val));
    const opVal = val[opKey];

    switch (opKey) {
      case '<':
      case '<=':
      case '>':
      case '>=':
        return ref.where(loneKey, opKey, opVal);
      case 'in':
        return ref.where(loneKey, 'array_contains', opVal);
      case '!=':
      case 'nin':
      case 'like':
        throw new Error('Consistency violation: where-clause modifier `' + opKey + '` is currently not supported!');
      default:
        throw new Error('Consistency violation: where-clause modifier `' + opKey + '` is not valid!');
    }
  };

  var newRef = reduceAndWhere(dbRef, whereClause);
  _.each(query.criteria.sort, sort => {
    const sortKey = _.first(_.keys(sort));
    const sortOrder = sort[sortKey];

    newRef = newRef.orderBy(sortKey, sortOrder);
  });

  if (!query.criteria.skip && _.isNumber(query.criteria.limit) && query.criteria.limit < Number.MAX_SAFE_INTEGER && typeof newRef.limit === 'function')
  {return newRef.limit(query.criteria.limit);}

  return newRef;
};
