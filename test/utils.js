'use strict';

let _ = require('underscore');
let test = require('tape');

let Sinon = require('sinon');

import { Common, LU } from './common'
let defaultOptions = { location: '/tmp/test.ldb', clear:true };


test('creating reuseable ids sequentially', t => {
    let db;
    return LU.openDb( defaultOptions )
        .then( (_db) => { db = _db; return LU.createReuseableId(db, null, '_test_key')} )
        // create 5 ids. note how the id creation is sequential even though Promise.all is parallel
        .then( testKey => Promise.all( _.times(5, () => testKey.get()) ) )
        .then( ids => {
            t.deepEqual( ids, [0,1,2,3,4], 'should have 5 ids' );
        })
        .then( () => LU.closeDb(db) )
        .then( () => t.end() )
        .catch( err => { log.debug('error: ' + err ); log.debug( err.stack );} )
});

test('reuseable ids are persistent', t => {
    let db;
    return LU.openDb( defaultOptions )
        .then( (_db) => { db = _db; return LU.createReuseableId(db, null, '_test_key')} )
        // create 5 ids. note how the id creation is sequential even though Promise.all is parallel
        .then( testKey => Promise.all( _.times(5, () => testKey.get()) ) )
        .then( () => LU.closeDb(db) )
        // reopen
        .then( () => LU.openDb(_.extend({},defaultOptions,{clear:false})) )
        .then( (_db) => { db = _db; return LU.createReuseableId(db, null, '_test_key')} )
        // create 5 new ids - the sequence should be preserved
        .then( testKey => Promise.all( _.times(5, () => testKey.get()) ) )
        .then( ids => t.deepEqual( ids, [5,6,7,8,9], 'should have 5 ids') )
        // finish
        .then( () => LU.closeDb(db) )
        .then( () => t.end() )
        .catch( err => { log.debug('error: ' + err ); log.debug( err.stack );} ) 
})

test('reuseable ids', t => {
    let db, testKey;

    return LU.openDb( defaultOptions )
        .then( (_db) => { 
            db = _db; 
            return LU.createReuseableId(db, null, '_test_key', 123)
                .then( (ruid) => testKey = ruid)
        })
        
        // create 6 ids
        .then( () => Promise.all( _.times(6, (v) => testKey.get(v)) ) )
        // release the first 3
        .then( values => {
            t.deepEqual( values, [123,124,125,126,127,128] );
            return Promise.all(  values.slice(0,3).map( (id) => testKey.release(id))) 
        })
        .then( values => {
            return t.deepEqual( values, [123,124,125] );
        })
        // get 4 more
        // .then( () => testKey.clear() )
        .then( () => Promise.all( _.times(4, (v) => testKey.get(v)) ) )
        
        .then( (values) => {
            // the result is the 3 that were previously released, plus a new id
            return t.deepEqual( values, [123,124,125,129] );
        })
        .then( () => LU.closeDb(db) )
        .then( () => t.end() )
        .catch( err => { log.debug('error: ' + err ); log.debug( err.stack );} )
});

test('opening with memdown', t => {
    let db;
    let options = _.extend( {}, defaultOptions, {db: require('memdown')});

    return LU.openDb( options )
        .then( _db => db = _db )
        .then( () => LU.closeDb(db) )
        .then( () => t.end() )
        .catch( err => { log.debug('error: ' + err ); log.debug( err.stack );} )
});



