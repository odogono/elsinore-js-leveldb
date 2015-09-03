'use strict';

var _ = require('underscore');
var LevelUp = require('levelup');
var PromiseQ = require('promise-queue');
var Sh = require('shelljs');

var Constants = require('./constants');

function ReusableId() {}

_.extend(ReusableId.prototype, {

    /**
    *   Clears this reuseable id from the db
    */
    clear: function clear() {
        var self = this;
        var db = this.db;
        var pq = this.promiseQ;
        var key = ['_ruid', this.key, 'free'].join(Constants.KEY_DELIMITER);

        return readStream(db, {
            // keys: false,
            // limit: 100,
            gte: key + Constants.KEY_START,
            lte: key + Constants.KEY_LAST,
            debug: true
        }).then(function (freeIds) {
            // printIns( freeIds );
            return Promise.all(_.map(freeIds, function (id) {
                return pq.add(function () {
                    return new Promise(function (resolve) {
                        // log.debug('deleting ' + JSON.stringify(id) );
                        db.del(id.key, function (err) {
                            if (err) {
                                throw err;
                            }
                            return resolve(parseInt(id.value, 10));
                        });
                        return id;
                    });
                });
            }));
        });
    },

    /**
    *   Returns <count> new ids
    */
    getMultiple: function getMultiple(count) {
        var self = this;
        return Promise.all(_.times(count, function (c) {
            return self.get();
        }));
    },

    /**
    *   Returns a new id
    */
    get: function get(c) {
        var self = this;
        var db = self.db;
        var pq = this.promiseQ;
        // first check whether there are available keys

        return pq.add(function () {
            return self._nextFree(c).then(function (val) {
                if (val) {
                    // a free id was found, so just return that
                    return parseInt(val, 10);
                }
                // no free, so go ahead and inc a new one
                return new Promise(function (resolve) {
                    db.get(self.key, function (err, id) {
                        var result = !err ? parseInt(id, 10) : self.defaultValue;
                        // log.debug('existing ' + result);
                        // increment the result and write back to the db
                        id = result + 1;
                        db.put(self.key, id, function (err) {
                            if (err) {
                                throw err;
                            }
                            // log.debug('created new id ' + c + ' ' + result);
                            return resolve(result);
                        });
                    });
                });
            });
        });
    },

    /**
    *   Returns the next free id from the previously used list of ids
    */
    _nextFree: function _nextFree(c) {
        var self = this;
        var db = self.db;
        var pq = this.promiseQ;
        // first check whether there are available keys
        var key = ['_ruid', this.key, 'free'].join(Constants.KEY_DELIMITER);

        // return pq.add( function(){
        // log.debug('requesting next free ' + c);
        return readStream(db, {
            limit: 1,
            // keys: false,
            gte: key + Constants.KEY_START,
            lte: key + Constants.KEY_LAST
        })
        // })
        .then(function (val) {
            if (!val) {
                return val;
            }
            // log.debug('next free is ' + JSON.stringify(val));
            // return pq.add( function(){
            return new Promise(function (resolve) {
                // log.debug('deleting ' + JSON.stringify(val.key) );
                db.del(val.key, function (err) {
                    if (err) {
                        throw err;
                    }
                    return resolve(parseInt(val.value, 10));
                });
                return val;
            });
            // });
        });
    },

    /**
    *   Releases an id so it can be used again
    */
    release: function release(id) {
        var self = this;
        var db = this.db;
        var pq = this.promiseQ;
        var key = ['_ruid', this.key, 'free', id].join(Constants.KEY_DELIMITER);

        // return pq.add( function(){
        return new Promise(function (resolve) {
            db.put(key, id, function (err) {
                if (err) {
                    throw err;
                }
                // log.debug('released id ' + id );
                return resolve(id);
            });
        });
        // });
    }
});

/**
*   Creates a new reuseable id
*/
function createReuseableId(db, promiseQ, idKey, defaultValue) {
    var result = new ReusableId();

    promiseQ = promiseQ || new PromiseQ(1);

    result.db = db;
    result.promiseQ = promiseQ;
    result.key = ['_ruid', idKey, 'count'].join(Constants.KEY_DELIMITER);
    result.defaultValue = _.isUndefined(defaultValue) ? 0 : defaultValue;
    // log.debug('creating ruid ' + result.key + ' ' + result.defaultValue );

    return getSet(db, promiseQ, result.key, result.defaultValue).then(function (val) {
        if (val !== undefined) {
            result.defaultValue = val;
        }
        // log.debug('created ruid ' + result.key + ' ' + result.defaultValue + ' ' + val );
        return result;
    });
}

/**
*   Opens a leveldb instance
*/
function openDb(options) {
    var location;
    options = options || {};

    options.location = options.location || options.path || '/tmp/temp.ldb';
    if (options.clear && options.location) {
        // log.debug('openDb : delete ' + location);
        Sh.rm('-rf', options.location);
    }
    // log.debug('openDb ' + location + ' ' + JSON.stringify(options));

    return new Promise(function (resolve) {
        // log.debug('opening with ' + JSON.stringify(options) );
        LevelUp(options.location, options, function (err, db) {
            if (err) {
                throw err;
            }
            if (options.debug) {
                log.debug('opened db adapter ' + db.db.constructor.name);
            };
            return resolve(db);
        });
    });
}

function clearDb(db, options) {}

function closeDb(db, options) {
    options = options || {};
    var location = options.location || '/tmp/temp.ldb';
    if (options.clear) {
        Sh.rm('-rf', location);
    }

    return new Promise(function (resolve) {
        if (!db || !db.isOpen()) {
            return resolve(false);
        }
        return db.close(function (err) {
            if (err) {
                return resolve(false);
            }
            return resolve(db);
        });
    });
}

function getSet(db, promiseQ, key, defaultValue, options) {
    // log.debug(' getSet ' + key + ' ' + defaultValue);
    return new Promise(function (resolve) {
        return db.get(key, function (err, val) {
            val = !err ? val : defaultValue;
            // if( err ){ log.debug(' getSet> not existing ' + key + ' ' + err); }
            db.put(key, val, function (err) {
                return resolve(val);
            });
        });
    });
}

function printKeys(db, promiseQ, options) {
    var count = 0;
    options = _.extend({}, {
        gte: Constants.KEY_START,
        lte: Constants.KEY_LAST,
        debug: true
    }, options);

    var fn = function fn(resolve) {
        db.createReadStream(options).on('data', function (data) {
            log.debug(count + ' ' + JSON.stringify(data));
        }).on('error', function (err) {
            throw new Error('error reading ' + err);
        }).on('close', function () {
            log.debug('end');
            return resolve(true);
        });
    };

    if (promiseQ) {
        return promiseQ.add(function () {
            return new Promise(fn);
        });
    }
    return new Promise(fn);
}

/**
* Wrapper for createReadStream which returns a promise for the 
* result or results
*/
function readStream(db, options) {
    var result, debug;
    var isResultArray = false;
    var limit;
    var dataFn;

    options = options || {};
    options.limit = options.limit === undefined ? -1 : options.limit;
    debug = options.debug;

    if (options.limit !== 1) {
        result = [];
        isResultArray = true;
    }
    debug = true;

    dataFn = options.dataFn || function (_result, data) {
        if (isResultArray) {
            _result.push(data);
        } else {
            return data;
        }
        return _result;
    };

    var cid = _.uniqueId('rs');

    return new Promise(function (resolve) {
        var stream = db.createReadStream(options);
        stream.cid = cid;
        stream._resolvePromise = resolve;
        stream._pauseable = options.pauseable;
        stream.on('data', function (data) {
            // if( stream.cid == 'rs388' ){ log.debug('data on rs388'); }
            result = dataFn(result, data, stream);
        }).on('error', function (err) {
            // if( stream.cid == 'rs388' ){ log.debug('error on rs388'); }
            throw new Error('error reading ' + err);
        }).on('close', function () {
            // if( stream.cid == 'rs388' ){ log.debug('closed rs388'); }
            // log.debug('closed ' + stream.cid + ' ' + stream._isPaused );
            if (!stream._isPaused) {
                stream._isClosed = false;
                // log.debug('closing and resolving stream ' + stream.cid );
                return resolve(result);
            }
            stream._isClosed = true;
        }).on('end', function () {
            // if( stream.cid == 'rs388' ){ log.debug('ended rs388'); }
            // log.debug('ended ' + stream.cid );
        });
    });
}

/**
*
*/
function batch(db, promiseQ, ops, options) {
    var fnOp = function fnOp(resolve) {
        db.batch(ops, options, function (err) {
            if (err) {
                throw err;
            }
            return resolve(true);
        });
    };
    if (promiseQ) {
        return promiseQ.add(function () {
            return new Promise(fnOp);
        });
    } else {
        return new Promise(fnOp);
    }
}

/**
*   
*/
function get(db, promiseQ, key, options) {
    var fn = function fn(resolve) {
        return db.get(key, function (err, val) {
            if (err) {
                return resolve(null);
            }
            return resolve(val);
        });
    };

    if (promiseQ) {
        return promiseQ.add(function () {
            return new Promise(fn);
        });
    }
    return new Promise(fn);
}

function createKey(args) {
    return _.toArray(arguments).join(Constants.KEY_DELIMITER);
}

module.exports = {
    openDb: openDb,
    closeDb: closeDb,
    printKeys: printKeys,
    readStream: readStream,
    getSet: getSet,
    get: get,
    batch: batch,
    createReuseableId: createReuseableId,
    createKey: createKey,
    key: createKey
};