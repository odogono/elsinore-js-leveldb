'use strict';

let _ = require('underscore');
let LevelUp = require('levelup');
let PromiseQ = require('promise-queue');
let Sh = require('shelljs');

let Constants = require('./constants');

function ReusableId() {}

_.extend(ReusableId.prototype, {

    /**
    *   Clears this reuseable id from the db
    */
    clear: function clear() {
        let self = this;
        let db = this.db;
        let pq = this.promiseQ;
        let key = ['_ruid', this.key, 'free'].join(Constants.KEY_DELIMITER);

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
        return Promise.all(_.times(count, c => this.get()));
    },

    /**
    *   Returns a new id
    */
    get: function get(c) {
        let db = this.db;
        let pq = this.promiseQ;
        // first check whether there are available keys

        return pq.add(() => {
            return this._nextFree(c).then( val => {
                if (val) {
                    // a free id was found, so just return that
                    return parseInt(val, 10);
                }
                // no free, so go ahead and inc a new one
                return new Promise( resolve => {
                    db.get(this.key, (err, id) => {
                        let result = !err ? parseInt(id, 10) : this.defaultValue;
                        // log.debug('existing ' + result);
                        // increment the result and write back to the db
                        id = result + 1;
                        db.put(this.key, id, err => {
                            if (err) { throw err; }
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
        let self = this;
        let db = self.db;
        let pq = this.promiseQ;
        // first check whether there are available keys
        let key = ['_ruid', this.key, 'free'].join(Constants.KEY_DELIMITER);

        // return pq.add( function(){
        // log.debug('requesting next free ' + c);
        return readStream(db, {
            limit: 1,
            // keys: false,
            gte: key + Constants.KEY_START,
            lte: key + Constants.KEY_LAST
        })
        // })
        .then( val => {
            if (!val) { return val; }
            // log.debug('next free is ' + JSON.stringify(val));
            // return pq.add( function(){
            return new Promise( resolve => {
                // log.debug('deleting ' + JSON.stringify(val.key) );
                db.del(val.key, err => {
                    if (err) { throw err; }
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
        let db = this.db;
        let pq = this.promiseQ;
        let key = ['_ruid', this.key, 'free', id].join(Constants.KEY_DELIMITER);

        // return pq.add( function(){
        return new Promise( resolve => {
            db.put(key, id, err => {
                if (err) { throw err; }
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
    let result = new ReusableId();

    promiseQ = promiseQ || new PromiseQ(1);

    result.db = db;
    result.promiseQ = promiseQ;
    result.key = ['_ruid', idKey, 'count'].join(Constants.KEY_DELIMITER);
    result.defaultValue = _.isUndefined(defaultValue) ? 0 : defaultValue;
    // log.debug('creating ruid ' + result.key + ' ' + result.defaultValue );

    return getSet(db, promiseQ, result.key, result.defaultValue).then(val=>{
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
function openDb(options={}) {
    let location;

    options.location = options.location || options.path || '/tmp/temp.ldb';
    if (options.clear && options.location) {
        // log.debug('openDb : delete ' + location);
        Sh.rm('-rf', options.location);
    }
    // log.debug('openDb ' + location + ' ' + JSON.stringify(options));

    return new Promise( resolve => {
        // log.debug('opening with ' + JSON.stringify(options) );
        LevelUp(options.location, options, (err, db) => {
            if (err) { throw err; }
            if (options.debug) {
                log.debug('opened db adapter ' + db.db.constructor.name);
            };
            return resolve(db);
        });
    });
}

function clearDb(db, options) {}

function closeDb(db, options={}) {
    let location = options.location || '/tmp/temp.ldb';
    if (options.clear) {
        Sh.rm('-rf', location);
    }

    return new Promise(resolve=> {
        if (!db || !db.isOpen()) {
            return resolve(false);
        }
        return db.close( err => {
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
        return db.get(key, (err, val) => {
            val = !err ? val : defaultValue;
            // if( err ){ log.debug(' getSet> not existing ' + key + ' ' + err); }
            db.put(key, val, err => resolve(val) );
        });
    });
}

function printKeys(db, promiseQ, options) {
    let count = 0;
    options = _.extend({}, {
        gte: Constants.KEY_START,
        lte: Constants.KEY_LAST,
        debug: true
    }, options);

    let fn = function fn(resolve) {
        db.createReadStream(options).on('data', data => {
            log.debug(count + ' ' + JSON.stringify(data));
        })
        .on('error', err => { throw new Error('error reading ' + err); })
        .on('close', () => {
            log.debug('end');
            return resolve(true);
        });
    };

    if (promiseQ) {
        return promiseQ.add(() => new Promise(fn));
    }
    return new Promise(fn);
}

/**
* Wrapper for createReadStream which returns a promise for the 
* result or results
*/
function readStream(db, options={}) {
    let result, debug;
    let isResultArray = false;
    let limit;
    let dataFn;
    let offset;

    options.limit = _.isUndefined(options.limit) ? -1 : options.limit;
    offset = _.isUndefined(options.offset) ? 0 : options.offset;
    debug = options.debug;

    options.limit = options.limit + offset;

    if( options.debug ){ log.debug('readStream ' + offset + ' ' + options.limit ); }

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

    let cid = _.uniqueId('rs');

    return new Promise( resolve => {
        let stream = db.createReadStream(options);
        let count = 0;
        stream.cid = cid;
        stream._resolvePromise = resolve;
        stream._pauseable = options.pauseable;
        stream.on('data', data => {
            // if( stream.cid == 'rs388' ){ log.debug('data on rs388'); }
            if( (++count) > offset ){
                result = dataFn(result, data, stream);
            }
        }).on('error', err => {
            // if( stream.cid == 'rs388' ){ log.debug('error on rs388'); }
            throw new Error('error reading ' + err);
        }).on('close', () => {
            // if( stream.cid == 'rs388' ){ log.debug('closed rs388'); }
            // log.debug('closed ' + stream.cid + ' ' + stream._isPaused );
            if (!stream._isPaused) {
                stream._isClosed = false;
                // log.debug('closing and resolving stream ' + stream.cid );
                return resolve(result);
            }
            stream._isClosed = true;
        }).on('end', () => {
            // if( stream.cid == 'rs388' ){ log.debug('ended rs388'); }
            // log.debug('ended ' + stream.cid );
        });
    });
}

/**
*
*/
function batch(db, promiseQ, ops, options) {
    let fnOp = function fnOp(resolve) {
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
    let fn = function fn(resolve) {
        return db.get(key, function (err, val) {
            if (err) {
                return resolve(null);
            }
            return resolve(val);
        });
    };

    if (promiseQ) {
        return promiseQ.add(() => new Promise(fn));
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