/**
 * Module dependencies
 */

const _ = require('@sailshq/lodash');

module.exports = function execQuery(dsEntry, query) {

  const whereClause = _.cloneDeep(query.criteria.where);
  const sortClause = _.cloneDeep(query.criteria.sort);
  const tableName = query.using;
  const db = dsEntry.driver.collection(tableName);
  const primaryKeyCol = dsEntry.primaryKeyCols[tableName];

  /*
   * @params {Object}		dbRef		Firebase query
   * @params {Dictionary}	branch		The stage-3 query to perform.
   *
   */
  const mapQuery = (dbRef, branch) => {

    dbRef = _.isEmpty(dbRef) ? db : dbRef;

    if (branch.and) {
      let and = branch.and;
      delete branch.and;
      _.each(and, andBranch => _.merge(branch, andBranch));
    }

    let deferredInBranch = {};
    let deferredLikeBranch = {};
    let deferredOrBranch = branch.or || {};
    delete branch.or;

    let queries = _.reduce(_.keys(branch), (querySet, loneKey) => {
      const val = branch[loneKey];

      let loneSet = querySet.pop() || {'+':dbRef};
      let q = _.first(_.values(loneSet));

      if (loneKey === primaryKeyCol) {
        return [{'+':db.doc(`${val}`)}];
      }

      if (!_.isObject(val)) {
        return [{'+': q.where(loneKey, '==', val)}];
      }

      let loneQuery = _.reduce(_.keys(val), (p, opKey) => {
        let opVal = val[opKey];

        switch (opKey) {
          case '<':
          case '<=':
          case '>':
          case '>=':
            const order = _.pluck(sortClause, loneKey);
            if (order) {
              return p.where(loneKey, opKey, opVal).orderBy(loneKey, order[loneKey]);
            }
            return p.where(loneKey, opKey, opVal).orderBy(loneKey);
          case 'in':
            // do nothing here, handle at the end
            _.merge(deferredInBranch, _.zipObject([loneKey], [{'in':opVal}]));
            return p;
          case '!':
          case '!=':
          case 'nin':
            opVal = _.isArray(opVal) ? opVal : [opVal];
            //console.log(`not opVal = ${JSON.stringify(opVal)}`);
            _.each(opVal, subVal => {
              querySet.splice(0, 0, {'-':p.where(loneKey, '==', subVal)});
            });
            return p;
          case 'like':
            const isStartsWith = `${opVal}`.match(/^([^\\%]+)%$/g);
            if (isStartsWith) {
              const startsWith = opVal.replace(/^([^\\%]+)%$/g, '$1');
              delete val.like;
              return p.where(loneKey, '>=', startsWith).where(loneKey, '<', String.fromCodePoint(startsWith.codePointAt(0)+1));
            }

            _.merge(deferredLikeBranch, _.zipObject([loneKey], [{'like':opVal}]));
            return p;
          default:
            throw new Error('Consistency violation: where-clause modifier `' + opKey + '` is not valid!');
        }
      }, q);

      if (!_.isEmpty(loneQuery)) {
        querySet.push({'+':loneQuery});
      }

      return querySet;
    }, []);

    function performLikeQuery(loneQuery, likeBranch) {
      return loneQuery.get().then(snaps => {
        try {
          const docs = snaps.docs.filter(doc => {
            let matched = 0;

            _.each(_.keys(likeBranch), loneKey => {
              let opVal = likeBranch[loneKey].like;
              const regex = new RegExp('^'+_.escapeRegExp(opVal).replace(/^%/, '.*').replace(/([^\\])%/g, '$1.*').replace(/\\%/g, '%')+'$');
              const value = doc.get(loneKey);
              if (value && value.toString().match(regex) !== null) {
                matched++;
              }
            });

            return matched === _.size(_.keys(likeBranch));
          });

          return Promise.resolve(_.isEmpty(docs) ? {} : {docs:docs});
        } catch(e) {
          return Promise.reject(e);
        }
      });
    }

    function mapInQuery(loneQuery, inBranch) {
      return _.reduce(_.keys(inBranch), (arr, loneKey) => {
        if (_.isEmpty(arr)) {
          return _.map(inBranch[loneKey].in, inVal => loneQuery.where(loneKey, '==', inVal));
        }

        return _.reduce(arr, (newQs, q) => {
          return newQs.concat(_.map(inBranch[loneKey].in, inVal => q.where(loneKey, '==', inVal)));
        }, []);
      }, []);
    }

    function mapOrBranch(q, orBranch) {
      return _.reduce(orBranch, (prevQueries, item) => {
        if (_.isEmpty(item)) {
          return prevQueries;
        }
        return prevQueries.concat(mapQuery(q, item));
      }, []);
    }

    const deferredQueries = (() => {
      const loneQuerySet = queries.pop() || {'+':dbRef};
      let loneQuery = _.first(_.values(loneQuerySet));
      if (!_.isFunction(loneQuery.where)) {
        loneQuery = db;
      }

      let interQueries = [];
      if (!_.isEmpty(deferredInBranch)) {
        interQueries = _.map(mapInQuery(loneQuery, deferredInBranch), q => {
          return {'+':q};
        });
      }

      if (!_.isEmpty(deferredOrBranch)) {
        if (_.isEmpty(interQueries)) {
          interQueries = mapOrBranch(loneQuery, deferredOrBranch);
        } else {
          interQueries = _.filter(interQueries, '-').concat(_.reduce(_.pluck(interQueries, '+'), (qs, q) => {
            _.each(deferredOrBranch, orBranch => {
              qs = qs.concat(mapQuery(q, orBranch));
            });
            return qs;
          }, []));
        }
      }

      if (!_.isEmpty(deferredLikeBranch)) {
        if (_.isEmpty(interQueries)) {
          interQueries.push({'+':performLikeQuery(loneQuery, deferredLikeBranch)});
        } else {
          interQueries = _.filter(interQueries, '-').concat(_.map(_.pluck(interQueries, '+'), q => {
            if (typeof q.get !== 'function') {
              return {'+':q};
            }
            return {'+':performLikeQuery(q, deferredLikeBranch)};
          }));
        }
      }

      return _.isEmpty(interQueries) ? [loneQuerySet] : interQueries;
    })();

    return queries.concat(deferredQueries);
  };

  function mapDoc(map, op, snap) {
    const docs = snap.docs || [snap];
    const ids = _.pluck(docs, 'id');
    return op === '+' ? _.merge(map, _.zipObject(ids, docs)) : _.omit(map, ids);
  }

  return (function reduceQuery(gq) {

    return new Promise((resolve, reject) => {
      try {
        return resolve(_.reduce(gq, async (prev, item) => {
          let map = await prev;
          const op = _.first(_.keys(item));
          const q = _.first(_.values(item));
          let p;

          if (typeof q.get === 'function') {
            p = q.get();
          } else if (q instanceof Promise) {
            p = q;
          } else {
            return Promise.resolve(map);
          }

          let snap = await p;
          if (snap.id || snap.docs) {
            return Promise.resolve(mapDoc(map, op, snap));
          }
          return Promise.resolve(map);
        }, Promise.resolve({})));
      } catch(e) {
        return reject(e);
      }
    });

  })(_.isEmpty(whereClause) ? [{'+':db}] : _.sortBy(mapQuery(db, whereClause), _.keys)).then(map => {
    try {
      let docs = _.values(map);
      if (!_.isEmpty(sortClause)) {
        const docsData = _.sortByOrder(docs.map(doc => doc.data()), _.flatten(_.map(sortClause, _.keys)), _.flatten(_.map(sortClause, _.values)).map(str => str.toString().toLowerCase()));
        docs = _.map(_.pluck(docsData, primaryKeyCol), id => map[id]);
      }

      if (query.criteria.skip === 0 && _.size(docs) <= query.criteria.limit) {
        return Promise.resolve(docs);
      }

      return Promise.resolve(_.slice(docs, query.criteria.skip, query.criteria.limit));
    } catch(e) {
      return Promise.reject(e);
    }
  });
};
