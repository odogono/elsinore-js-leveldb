'use strict';

var _ = require('underscore');
var BitField = require('elsinore-js/lib/bit_field');
var LevelEntitySet = require('./index');
var PromiseQ = require('promise-queue');
var Query = require('elsinore-js/lib/query/full');
var Utils = require('elsinore-js/lib/utils');
var CC = require('./constants');
var LU = require('./utils');

function LevelDbQuery() {}
function LevelDbQueryContext() {}

LevelDbQueryContext.prototype.componentsToBitfield = function (context, components) {
    var componentIds, result;
    componentIds = context.registry.getIId(components, true);
    result = BitField.create();
    result.setValues(componentIds, true);
    // log.debug('lookup ' + Utils.stringify(components) + ' ' + result );
    return result;
};

/**
*   Takes an entityset and applies the filter to it resulting
*   in a new entityset which is returned as a value.
*/
LevelDbQueryContext.prototype.commandFilter = function (context, entityFilter, filterFunction, options) {
    var result;
    var entities, entityContext, value;
    var entity, entitySet;
    var debug = context.debug;

    // log.debug('LevelDbQuery.commandFilter ' + entityFilter.constructor.name + ' ' + Utils.stringify(entityFilter));
    if (debug) {
        log.debug('LevelDbQuery.commandFilter >');printIns(_.rest(arguments), 2);log.debug('<');
    }

    result = context.registry.createEntitySet(null, { register: false });

    // resolve the entitySet argument into an entitySet or an entity
    // the argument will either be ROOT - in which case the context entityset or entity is returned,
    // otherwise it will be some kind of entity filter
    // entitySet = Query.resolveEntitySet( context, entitySet );
    entitySet = Query.valueOf(context, context.last || context.entitySet, true);

    entityContext = Query.createContext(context);
    entityContext.componentIds = entityFilter.getValues(0);

    /**
        while results < limit
            Read 3 compatible entity ids
                - read the components for the 3 ids
    */
    // return readEntityIds( entitySet._db, entityFilter, null, 3 )
    var count = 0;
    return LU.readStream(context._db, {
        gte: CC.ENTITY_ID_BITFIELD + CC.KEY_START,
        lte: CC.ENTITY_ID_BITFIELD + CC.KEY_LAST,
        pauseable: true, // set this flag
        dataFn: function dataFn(dataResult, data, stream) {
            // log.debug('incoming dataResult ' + Utils.stringify(dataResult) );
            var bf = entityIdBitfieldKeyToBitfield(data.key);
            stream._superDebug = true;
            // log.debug(data.key );
            if (!entityFilter.accept(bf, context)) {
                // log.debug('not accepted ' + JSON.stringify(entityFilter) );
                // log.debug( entityFilter.filters[0].toString() );
                // log.debug( bf.toString() );
                return dataResult;
            }
            // log.debug('accepted!');

            stream.pause();
            stream._isPaused = true;
            // log.debug('paused ' + count + ' ' + (stream.constructor.name) + ' ' + stream.cid );
            // retrieve the entity
            context._ldbEntitySet._readEntityById(data.value).then(function (entity) {

                // log.debug('maybe filterFunction ' + filterFunction );
                if (filterFunction) {
                    entityContext.entity = entity;
                    // the below *should* be a value array - but could it also be a promise?
                    var cmdResult = Query.executeCommand(entityContext, filterFunction);
                    if (Query.valueOf(context, cmdResult) !== true) {
                        entity = null;
                    }
                    // if( Query.valueOf( context, cmdResult ) === true ){
                    // log.debug('added entity ' + count + ' ' + JSON.stringify(entity) + ' to ' + result.cid );
                    //     // result.push( entity );
                    //     dataResult.push( entity );
                    //     result.add( entity );
                    // }
                }

                if (entity) {
                    // log.debug(stream.cid + ' added entity ' + count + ' ' + JSON.stringify(entity) + ' to ' + result.cid );
                    dataResult.push(entity);
                    result.add(entity);
                }

                stream._isPaused = false;
                stream.resume();
                // log.debug('resumed ' + count + ' ' + stream.cid );
                // count = count + 1;

                // log.debug('stream closed? ' + stream._isClosed );
                if (stream._isClosed) {
                    // log.debug('closing resumed stream ' + stream.cid );
                    return stream._resolvePromise(dataResult);
                }
            })['catch'](function (err) {
                log.debug('reids.error: ' + err);log.debug(err.stack);
                stream.destroy();
            });

            // log.debug('oh hai ' + JSON.stringify(data) + ' ' + bf );
            // result.push( data.value );
            // stream.resume();
            return dataResult;
        }
    })
    // .catch( err => { log.debug('reids.error: ' + err ); log.debug( err.stack );} )
    .then(function () {
        return result;
    });
};

// function readEntityIds( db, entityFilter, startKey, limit ){
//     var opts;
//     var currentKey;
//     if( startKey ){
//         opts = { gt: startKey, lte: CC.ENTITY_ID_BITFIELD + CC.KEY_LAST }
//     } else {
//         opts = { gte: CC.ENTITY_ID_BITFIELD + CC.KEY_LAST, lte: CC.ENTITY_ID_BITFIELD + CC.KEY_LAST };
//     }
//     opts.limit = limit;
//     opts.dataFn = function( acc, data ){
//         var bf = entityIdBitfieldKeyToBitfield( data.key );
//         if( entityFilter.accept(bf) ){
//             log.debug('oh hai ' + JSON.stringify(data) + ' ' + bf );
//             acc.push( data.value );
//         }
//         currentKey = data.key;
//         return acc;
//     }

//     log.debug('maybe ' + JSON.stringify(opts) );
//     return LU.readStream( db,  opts )
//         .then( function( values ){
//             log.debug('GO');
//             return [ values, currentKey ];
//         })
// }

function entityIdBitfieldKeyToBitfield(key) {
    var bf = key.split(/!/)[2];
    bf = BitField.create(bf);
    return bf;
}

// LevelDbQueryContext.prototype.filterEntitySet = function( context, entitySet, entityFilter, options ){
//     var result;
//     // strategy: build lists of entities using the provided filter
//     // log.debug('LevelDbQuery.filterEntitySet ' + entityFilter.constructor.name + ' ' + Utils.stringify(entityFilter));
//     // let ctx = Query.createContext( context );
//     // log.debug( 'created ' + ctx.constructor.name + ' from ' + context.constructor.name );
//     result = context.registry.createEntitySet( null, {register:false} );

//     // var key = /*CC.ENTITY_ID_BITFIELD*/ LU.key( CC.ENTITY_COMPONENT, 4294967348 );

//     // return LU.printKeys( entitySet._db, null, {
//     //     gte: key + CC.KEY_START,
//     //     lte: key + CC.KEY_LAST
//     // })
//     // .then( function(){
//     return LU.readStream( entitySet._db,{
//         gte: CC.ENTITY_ID_BITFIELD + CC.KEY_START,
//         lte: CC.ENTITY_ID_BITFIELD + CC.KEY_LAST,
//         dataFn: function( dataResult, data ){
//             // result = result || [];
//             var bf = entityIdBitfieldKeyToBitfield( data.key );
//             // data.key.split(/!/)[2];
//             // bf = BitField.create( bf );
//             // log.debug('check bf ' + bf );
//             if( entityFilter.accept(bf,context) ){
//                 log.debug('oh hai ' + JSON.stringify(data) + ' ' + bf );
//                 dataResult.push( data.value );
//             }
//             return dataResult;
//         }
//     })// })
//     .then( function(entityIds){
//         // log.debug('getting entities ' + JSON.stringify(entityIds) );
//         return _.reduce( entityIds, function(current, eid){
//             return current.then(function( accum ){
//                 // log.debug('reading entity ' + eid );
//                 return entitySet._readEntityById( eid )
//                     .then( function(entity){ result.addEntity(entity); });
//             });
//         }, Promise.resolve() )
//     })
//     // .then( function(entities){
//     //     // printIns( entities, 1);
//     //     return result.addEntity( entities )
//     // })
//     .then( function(){
//         log.debug('end result');
//         // printIns( result, 1 );
//         return result;
//     });
// }

// function compile( context, query, options ){
//     // apply basic compilation
//     query = Query.compile( context, query, options );

//     // printIns( query.commands );

//     // look for limit, and push it up the stack
// }

LevelDbQuery.execute = function (levelDbEntitySet, query, options) {
    var ii, len, command, context, result;
    // var queue = new PromiseQ(1);

    options = options || {};
    options.context = LevelDbQueryContext;

    // build the initial context object from the incoming arguments
    context = Query.buildContext(levelDbEntitySet, query, options);
    context._db = levelDbEntitySet._db;
    context._ldbEntitySet = levelDbEntitySet;

    query = Query.compile(context, query, options);

    // return Query.executeCommand( context, query.commands[0] )
    // .then( function(r){
    //     return r;
    // })

    return _.reduce(query.commands, function (current, command) {
        return current.then(function () {
            // log.debug('LDBQ: go ' + Utils.stringify(command) );
            var cmdResult = Query.executeCommand(context, command);
            // log.debug('LDBQ: done ' + Utils.stringify(command) );
            // printIns( cmdResult );
            return cmdResult;
            // return
            //     .then( function(res){
            //         log.debug('returned ' + res.cid );
            //         printE( res );
            //         return res;
            //     })
        });
    }, Promise.resolve(true));

    // if( context.debug ){log.debug('commands:'); printIns( query,1 ); }
    // _.each( query.commands, function(command){
    //     queue.add( function(){
    //         return Query.executeCommand( context, command );
    //     })
    // })

    // return new Promise( function(resolve, reject){
    //     return queue.add( function(){
    //         return resolve(true);
    //     })
    // })

    // for( ii=0,len=query.commands.length;ii<len;ii++ ){
    //     command = query.commands[ii];
    //     // log.debug('LDBQ: go ' + Utils.stringify(command) );

    //     // the actual result will usually be [VALUE,...]
    //     result = Query.executeCommand( context, command );
    //     log.debug('LDBQ result ' + (result instanceof Promise) );
    // }

    // return result;
};

LevelEntitySet.Query = LevelDbQuery;
module.exports = LevelDbQuery;