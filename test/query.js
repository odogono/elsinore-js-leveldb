'use strict';
let _ = require('underscore');
let test = require('tape');

let PromiseQ = require('promise-queue');

let Sinon = require('sinon');

import { Common, Elsinore, 
    LevelEntitySet, LU, 
    createEntitySet, printKeys, destroyEntitySet } from './common'

let EntityFilter = Elsinore.EntityFilter;
let EntitySet = Elsinore.EntitySet;
let Entity = Elsinore.Entity;
let Query = Elsinore.Query;
let Registry = Elsinore.Registry;
let Utils = Elsinore.Utils;

let createOptions = {loadComponents:true, loadEntities:'query.entities', debug:false};

test('entityset filter ALL', t => {
    // t.plan(2);
    return createEntitySet( null, createOptions)
        .then( entitySet => {
            let query = Query.all('/component/mode/invite_only');
            // LevelEntitySet.Query.poop();
            // let entities = Common.loadEntities(registry, 'query.entities');
            // printE( entities.query( query ) );

            // log.debug('->ldb query');
            return entitySet.query( query, {debug:false} )
                .then( result => {
                    t.ok( EntitySet.isEntitySet(result), 'the result should be an entityset' );
                    t.equals( result.size(), 1, 'there should be a single entity' );
                })
                .then( finalise(t, entitySet) )
        })
});


test('entityset filter by attribute', t => {
    // t.plan( 1 );
    return createEntitySet( null, createOptions)
        .then( entitySet => {
            
            let query = Query.all( '/component/channel_member', 
                Query.attr('username').equals('aveenendaal') );

            return entitySet.query( query, {debug:false} )
                .then( result => {
                    t.equals( result.size(), 2 );
                })
                .then( finalise(t, entitySet) )
        });
});




test('entityset filter by attribute being within a value array', t => {
    return createEntitySet( null, createOptions)
        .then( entitySet => {
    // select entities which have the component /channel_member and 
    //  have the client attribute
            return entitySet.query( 
                Query.all('/component/channel_member', Query.attr('cname').equals(['chat','politics'])), {debug:false})
                .then( result => {
                    t.equals( result.size(), 4 );
                })
                .then( finalise(t, entitySet) )
        })
});

test('multiple component filters', t => {
    return createEntitySet( null, createOptions)
        .then( entitySet => {
            return entitySet.query([
                Query.all('/component/channel_member'),
                Query.none('/component/mode/invisible')] )
                .then( result => {
                    t.equals( result.size(), 5 );
                })
                .then( finalise(t, entitySet) )
        })
});



test.only('query limit will constrain the number of entities that are returned', t => {
    return createEntitySet( null, createOptions)
        .then( entitySet => {
            return entitySet.query( Query.limit(3), {debug:true} )
                .then( result => {
                    t.equals( result.size(), 3 );
                })
                .then( finalise(t, entitySet) )
        })
        .catch( err => { log.debug('t.error: ' + err ); log.debug( err.stack );} )
});

// test('query offset will return entities from the given offset');



function finalise( t, entitySet ){
    return destroyEntitySet(entitySet, true)
        .then( () => { t.end() })
        .catch( err => { log.debug('t.error: ' + err ); log.debug( err.stack );} )     
}



// test('entityset filter ALL', t => {
//     initialiseEntitySet().then( ([registry,entitySet]) => {

//         let result = entitySet.query(
//             Query.all('/component/mode/invite_only') );
//         // let result = entitySet.query( 
//         //     [ [ Query.ALL, '/component/mode/invite_only' ] ],
//         //     {debug:false, result:false} );

//         t.ok( EntitySet.isEntitySet(result) );
//         t.ok( result.size(), 1 );

//         t.end();
//     });
// });