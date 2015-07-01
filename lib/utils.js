'use strict';

var _ = require('underscore');
var LevelUp = require('levelup');
var PromiseQ = require('promise-queue');
var Sh = require('shelljs');

var KEY_DELIMITER = '\x00';
var KEY_START = '\x00';
var KEY_LAST = '\xFF';




function ReusableId(){
}


_.extend( ReusableId.prototype, {

    /**
    *   Clears this reuseable id from the db
    */
    clear: function(){
        var self = this;
        var db = this.db;
        var pq = this.promiseQ;
        var key = [ '_ruid', this.key, 'free' ].join( KEY_DELIMITER );
        
        return readStream( db, {
            // keys: false,
            limit: 100,
            gte: key + KEY_START,
            lte: key + KEY_LAST,
            debug: true
        })
        .then( function(freeIds){
            // printIns( freeIds );
            return Promise.all(_.map( freeIds, function(id){
                return pq.add( function(){
                    return new Promise( function(resolve){
                        // log.debug('deleting ' + JSON.stringify(id) );
                        db.del( id.key, function(err){
                            if( err ){ throw err; }
                            return resolve( parseInt(id.value,10) );
                        });
                        return id;    
                    })
                });
            }))
        });
    },

    /**
    *   Returns a new id
    */
    get: function( c ){
        var self = this;
        var db = self.db;
        var pq = this.promiseQ;
        // first check whether there are available keys

        return pq.add( function(){
            return self._nextFree( c )
            .then( function(val){
                if( val ){
                    // a free id was found, so just return that
                    return parseInt( val,10 );
                }
                // no free, so go ahead and inc a new one
                return new Promise( function(resolve){
                    db.get(self.key, function(err,id){
                        var result = !err ? parseInt(id,10) : self.defaultValue;
                        // increment the result and write back to the db
                        id = result + 1;
                        db.put( self.key, id, function(err){
                            if( err ){ throw err; }
                            // log.debug('created new id ' + c + ' ' + result);
                            return resolve(result);
                        });
                    });
                });
            })
        })
    },

    /**
    *   Returns the next free id from the previously used list of ids
    */
    _nextFree: function(c){
        var self = this;
        var db = self.db;
        var pq = this.promiseQ;
        // first check whether there are available keys
        var key = [ '_ruid', this.key, 'free' ].join( KEY_DELIMITER );

        // return pq.add( function(){
            // log.debug('requesting next free ' + c);
            return readStream( db, {
                limit: 1,
                // keys: false,
                gte: key + KEY_START,
                lte: key + KEY_LAST
            })
        // })
        .then( function(val){
            if( !val ){ return val; }
            // log.debug('next free is ' + JSON.stringify(val));
            // return pq.add( function(){
                return new Promise( function(resolve){
                    // log.debug('deleting ' + JSON.stringify(val.key) );
                    db.del( val.key, function(err){
                        if( err ){ throw err; }
                        return resolve( parseInt(val.value,10) );
                    });
                    return val;    
                })
            // });
        })
    },

    /**
    *   Releases an id so it can be used again
    */
    release: function(id){
        var self = this;
        var db = this.db;
        var pq = this.promiseQ;
        var key = [ '_ruid', this.key, 'free', id ].join( KEY_DELIMITER );

        // return pq.add( function(){
            return new Promise( function(resolve){
                db.put( key, id, function(err){
                    if( err ){ throw err; }
                    // log.debug('released id ' + id );
                    return resolve(id);
                });
            });
        // });
        
    },
});


/**
*   Creates a new reuseable id
*/
function createReuseableId( db, promiseQ, idKey, defaultValue ){
    var result = new ReusableId();

    promiseQ = (promiseQ || new PromiseQ(1));

    result.db = db;
    result.promiseQ = promiseQ;
    result.key = [ '_ruid', idKey, 'count' ].join( KEY_DELIMITER );
    result.defaultValue = defaultValue;

    // set the default initial value for the id
    return new Promise( function(resolve){
        db.put( idKey, defaultValue, function(err){
            if( err ){ throw err; }
            return resolve(result);
        });
    }).then( function(){
        return result;
    });
}





/**
*   Opens a leveldb instance
*/
function openDb( options ){
    var location;
    options = options || {};

    location = options.location || '/tmp/temp.ldb';
    if( options.clear ){
        Sh.rm('-rf', location ); 
    }

    return new Promise( function(resolve){
        LevelUp( location , options, function(err,db){
            if( err ){ throw err; }
            return resolve(db);
        });
    });   
}


function closeDb( db, options ){
    options = options || {};
    var location = options.location || '/tmp/temp.ldb';
    if( options.clear ){
        Sh.rm('-rf', location ); 
    }

    return new Promise( function(resolve){
        if( !db || !db.isOpen() ){
            return resolve(false);
        }
        return db.close( function(err){
            if( err ){ return resolve(false); }
            return resolve(db);
        });
    });
}

/**
* Wrapper for createReadStream which returns a promise for the 
* result or results
*/
function readStream( db, options ){
    var result, debug;
    var isResultArray = false;
    var limit;

    options = options || {};
    options.limit = (options.limit === undefined) ? 1 : options.limit;
    debug = options.debug;

    if( options.limit !== 1 ){
        result = [];
        isResultArray = true;
    }

    return new Promise( function(resolve){
        db.createReadStream( options )
        .on('data', function(data){
            if( isResultArray ){
                result.push( data );
            } else {
                result = data;
            }
        })
        .on('error', function(err){
            throw new Error('error reading ' + err );
        })
        .on('close', function(){
            if( debug ){ log.debug('end'); }
            return resolve( result );
        })
    });
}


module.exports = {
    openDb: openDb,
    closeDb: closeDb,
    readStream: readStream,
    createReuseableId: createReuseableId
}