'use strict';

let _ = require('underscore');
let test = require('tape');

let PromiseQ = require('promise-queue');

let Sinon = require('sinon');

import { Elsinore, 
    LevelEntitySet, LU, 
    printKeys, pathVarFile, createEntitySet, destroyEntitySet } from './common'

import * as Common from './common';

let EntityFilter = Elsinore.EntityFilter;
let EntitySet = Elsinore.EntitySet;
let Entity = Elsinore.Entity;
let Query = Elsinore.Query;
let Registry = Elsinore.Registry;
let Utils = Elsinore.Utils;



test('get all the component defs', t => {
    createEntitySet( null, {loadComponents:true, logEvents:false, debug:false})
        .then( ([registry,entitySet]) => {
            return entitySet.getComponentDefs()
                .then( (defs) => {
                    defs = _.reduce( defs, (result,def) => {
                        result[def.uri] = def.hash;
                        return result;
                    },{});
                    t.equals( defs['/component/status'], '417b8cb5' );
                })
                .then( () => finalise(t,entitySet) )

        })
        .catch( err => { log.debug('error: ' + err ); log.debug( err.stack );} )
})

test('returns the newest version of the schema', t => {
    let registry = Common.initialiseRegistry( {loadComponents:false, logEvents:false} );
    let schemaA = { id:'/component/channel', properties:{ name:{type:'string'} }};
    let schemaB = { id:'/schema/alpha', properties:{ channel:{type:'string'} }};

    return createEntitySet( registry, {clear:true})
        .then( ([registry,entitySet]) => {
            return entitySet.registerComponentDef(schemaA)
                .then( () => entitySet.registerComponentDef(schemaB) )
                .then( () => entitySet.getComponentDef('/schema/alpha') )
                .then( schema => {
                    t.ok( schema.obj.properties.channel, 'the 2nd version is the one returned' );
                    return true;
                })
                .then( () => finalise(t,entitySet) )
        })

        .catch( err => { log.debug('error: ' + err ); log.debug( err.stack );} )
});

test('registering the same schema again throws an error', t => {
    let schemaA = { id:'/component/channel', properties:{ name:{type:'string'} }};

    return createEntitySet( null, {loadComponents:false, logEvents:false, debug:false} )
        .then( ([registry,entitySet]) => {
            // register once...
            return entitySet.registerComponentDef(schemaA)
                // register again
                .then( () => entitySet.registerComponentDef(schemaA) )
                // error
                .catch( err => {
                    t.equal(err.message,'schema /component/channel (ec3bd75b) already exists'); 
                    return;
                })
                .then( () => finalise(t,entitySet) )
        })
        .catch( err => { log.debug('error: ' + err ); log.debug( err.stack );} )
});


test('registering a schema and then retrieving it', t => {
    let schemaA = { id:'/component/channel', properties:{ name:{type:'string'} }};
    let schemaB = { id:'/component/topic', properties:{ topic:{type:'string'} }};
    let schemaC = { id:'/component/status', properties:{ status:{type:'string'} }};

    return createEntitySet( null, {componentDefId:104, loadComponents:false, logEvents:false, debug:false} )
        .then( ([registry,entitySet]) => {
            return entitySet.registerComponentDef(schemaA)
                .then( entitySet => entitySet.registerComponentDef(schemaB) )
                .then( entitySet => entitySet.registerComponentDef(schemaC) )
                .then( entitySet => {
                    let registryId = entitySet.getRegistry().getIId( schemaA.id );
                    // log.debug('registry id is ' + registryId );
                    // t.equal(err.message,'schema /component/channel (ec3bd75b) already exists'); 
                    // printIns( entitySet, 1 );
                    return entitySet;
                })
                .then( () => finalise(t,entitySet) )
            });
});



test('registers existing component defs with the registry when opened', t => {
    let registry;
    
    let schema = {
        channel: { id:'/component/channel', properties:{ name:{type:'string'} }},
        topic: { id:'/component/topic', properties:{ topic:{type:'string'} }},
        status: { id:'/component/status', properties:{ status:{type:'string'} }}        
    }

    // create a new ES, register the component defs, then remove the ES
    return createEntitySet( null, {loadComponents:false, clear:true, debug:false})
        .then( ([registry,entitySet]) => {
            return entitySet.registerComponentDef(schema)
                .then( () => registry.removeEntitySet(entitySet) );
        })
        // .then( entitySet => printKeys(entitySet) )
        // create a new registry and ES which reads from the previous instantiation
        .then( () => createEntitySet( null, {loadComponents:false, clear:false, open:true, debug:false}) )
        // confirm we still have the components registered by attempting to instantiate one
        .then( ([registry,entitySet]) => {
            let c = registry.createComponent( '/component/channel', {name:'tali'});
            t.equal( c.get('name'), 'tali' );
            // printIns( registry.schemaRegistry, 1 );
            // printIns( entitySet._db, 1 );
            return entitySet;
        })
        .then( entitySet => finalise(t,entitySet) )
});


test('adding an entity with a component returns the added entity', t => {
    return createEntitySet( null, {loadComponents:true, clear:true, debug:false, esId:10})
        .then( ([registry,entitySet]) => {
            let entity = registry.createEntity( { id:'/component/position', x:2, y:-2 } );

            return entitySet.addEntity( entity )
                .then( entity => {
                    t.ok( entity.getEntityId() > 0, 'the entity should have an id' );
                    t.ok( entitySet.hasEntity(entity.id), 'the entity ' + entity.id + ' should exist');
                })
                .then( finalise(t,entitySet) )
        })
        .catch( err => { log.debug('error: ' + err ); log.debug( err.stack );} )
});



test('adding a component without an id or an entity id creates a new component and a new entity', t => {
    return createEntitySet( null, {loadComponents:true, clear:true, debug:false, esId:10})
        .then( ([registry,entitySet]) => {
            let component = registry.createComponent( {id:'/component/position', x:15,y:2} );
            return entitySet.addComponent( component )
                .then( component => entitySet.getEntity(component.getEntityId()) )
                .then( entity => {
                    t.ok( entity.Position, 'entity should have position' );
                    t.equals( entity.Position.get('x'), 15, 'component attr saved' );
                })
                .then( finalise(t,entitySet) )
        })
});


test('adding several components without an entity adds them to the same new entity', function(t){
    let eventSpy = Sinon.spy();
    let registry;

    return createEntitySet( null, {loadComponents:true, clear:true, debug:false})
        .then( ([registry,entitySet]) => {
            entitySet.on('all', eventSpy);
            return entitySet.addComponent([
                registry.createComponent( '/component/flower', {colour:'yellow'}),
                registry.createComponent( '/component/radius', {radius:2.0, author:'alex'} )
                ])
            .then( components => entitySet.getEntity(components[0].getEntityId()) )
            .then( function(entity){
                t.ok( eventSpy.calledWith('entity:add'), 'entity:add should have been called');
                t.assert( entity.Flower, 'the entity should have a Flower component' );
                t.assert( entity.Radius, 'the entity should have a Radius component' );
            })
            .then( finalise(t,entitySet) )
        })
});


test('removing a component from an entity with only one component', t => {
    let eventSpy = Sinon.spy();
    
    return createEntitySet( null, {loadComponents:true, clear:true, debug:false})
        .then( ([registry,entitySet]) => {
            entitySet.on('all', eventSpy);
            // Common.logEvents( entitySet );
            return entitySet.addComponent(
                registry.createComponent( '/component/position', {x:15,y:2}))
            .then( component => {
                // log.debug('removed! ' + component.getEntityId() );
                return component;
            })
            .then( component => entitySet.removeComponent(component) )
            // .then( () => printKeys(entitySet, '_ent_bf', {values:false} ) )
            // .then( component => entitySet.getEntity(component.getEntityId()) )
            .then( (entity) => {
                t.ok( eventSpy.calledWith('component:remove'), 'component:remove should have been called');
                t.ok( eventSpy.calledWith('entity:remove'), 'entity:remove should have been called');
                // printE( entity );
            })
            .then( finalise(t,entitySet) )
        })
        .catch( err => { log.debug('error: ' + err ); log.debug( err.stack );} )
});

test('should add an entity only once', t => {
    let eventSpy = Sinon.spy();
    let registry;
    let entities;

    return Common.initialiseRegistry( {loadComponents: true} )
        .then( _r => {registry = _r; entities = Common.loadEntities(_r);} )
        // NOTE: we have to set the entity seed explicitly to match the loaded entities
        .then( () => createEntitySet( registry, {esId:10, entityIdSeed:1, clear:true, debug:false}) )
        .then( ([registry,entitySet]) => {
            let entity = entities.at(0);
            // Common.logEvents(entitySet);
            entity.set({id:0});

            return entitySet.addEntity( entity )
                .then( () => entitySet.size() )
                .then( size => t.equals(size, 1) )
                .then( finalise(t,entitySet) )
        })
        .catch( err => { log.debug('error: ' + err ); log.debug( err.stack );} )
});


test('should remove an entity', t => {
    let eventSpy = Sinon.spy();
    let registry;
    let entities;

    return Common.initialiseRegistry( {loadComponents: true} )
        .then( _r => {registry = _r; entities = Common.loadEntities(_r);} )
        // NOTE: we have to set the entity seed explicitly to match the loaded entities
        .then( () => createEntitySet( registry, {esId:10, entityIdSeed:1, clear:true, debug:false}) )
        .then( ([registry,entitySet]) => {
            let entity = entities.at(0);
            // Common.logEvents(entitySet);

            return entitySet.addEntity( entity )
                .then( (e) => { entity = e; return entitySet.size()})
                .then( size => t.equals(size, 1, 'the es should have one entity') )

                .then( () => entitySet.removeEntity(entity) )
                .then( () => entitySet.size(true) )
                .then( size => t.equals(size, 0, 'the es should be empty') )

                .then( finalise(t,entitySet) )
        });
});

test('should emit an event when an entity is added and removed', t => {
    // let addSpy = Sinon.spy(), removeSpy = Sinon.spy();
    let registry;
    let entities;

    return Common.initialiseRegistry( {loadComponents: true} )
        .then( _r => {registry = _r; entities = Common.loadEntities(_r);} )
        .then( () => createEntitySet( registry, {esId:10, entityIdSeed:1, clear:true, debug:false}) )
        .then( ([registry,entitySet]) => {
            let addCalled = false, removeCalled = false;
            // Common.logEvents( entitySet );
            // entitySet.on('entity:add', addSpy );
            entitySet.on('entity:add', () => addCalled = true )
            entitySet.on('entity:remove', () => removeCalled = true );
            return entitySet.addEntity( entities.at(0) )
                .then( () => t.ok( addCalled, 'entity:add should have been called' ) )
                .then( () => entitySet.removeEntity( entities.at(0)) )
                .then( () => t.ok( removeCalled, 'entity:remove should have been called' ) )
                .then( finalise(t,entitySet) )
        })
});


test('should emit an event when a component is changed', t => {
    let registry;
    let entities;

    return Common.initialiseRegistry( {loadComponents: true} )
        .then( _r => {registry = _r; entities = Common.loadEntities(_r);} )
        .then( () => createEntitySet( registry, {esId:11, entityIdSeed:1, clear:true, debug:false}) )
        .then( ([registry,entitySet]) => {
            let entity = entities.at(0);
            let cloned, component = entity.Position;
            let spy = Sinon.spy();
            Common.logEvents( entitySet );

            entitySet.on('component:change', spy);

            return entitySet.addEntity(entities.at(0))
                .then( () => {
                    cloned = registry.cloneComponent(component);
                    cloned.set({x:0,y:-2});
                    return entitySet.addComponent(cloned);
                })
                .then( () => {
                    t.ok( spy.called, 'component:change should have been called' );            
                })
                .then( finalise(t,entitySet) )
        })
        .catch( err => { log.debug('error: ' + err ); log.debug( err.stack );} )
});



test('adding an existing entity changes its id if it didnt originate from the entityset', t => {
    let registry;
    return createEntitySet( null, {esId:205, loadComponents:true, clear:true, debug:false})
        .then( ([registry,entitySet]) => {
            let entity = registry.createEntity( { id:'/component/flower', colour:'white'}, {id:12} );
            // Common.logEvents( entitySet );
            return entitySet.addEntity( entity )
            .then( (entity) => {
                // printE( entity );
                t.notEqual( entity.getEntityId(), 12, 'the entity id will have been changed' );
                t.equal( entity.getEntitySetId(), 205, 'the entityset id will have been set' );
            })
            .then( finalise(t,entitySet) )
        })
});

test('adding an existing entity doesnt changes its id if it originated from the entityset', t => {
    let registry;
    return createEntitySet( null, {esId:205, loadComponents:true, clear:true, debug:false})
        .then( ([registry,entitySet]) => {
            let entity = registry.createEntity( { id:'/component/flower', colour:'white'}, { id:12, esid:205} );
            // Common.logEvents( entitySet );
            // printE( entity );
            return entitySet.addEntity( entity )
                .then( (entity) => {
                    // printIns( entity,1 );
                    // printE( entity );
                    t.equal( entity.getEntitySetId(), 205, 'the entityset id will have been set' );
                    t.equal( entity.getEntityId(), 12, 'the entity id will have been changed' );
                })
                .then( finalise(t,entitySet) )
        })
});



// when entities are added, their previous ids are recorded
// when a component is committed, any fields containing entity-refs are reconciled
test('updating entity references when adding', t => {
    let registry;
    let eventSpy = Sinon.spy();

    let data = [
        {"_e":1, "id": "/component/channel", "name":"ecs" },
        {"_e":1, "id": "/component/topic", "topic": "Entity Component Systems" },
        {"_e":5, "id": "/component/username", "username":"aveenendaal"},
        {"_e":5, "id": "/component/nickname", "nickname":"alex"},
        {"_e":12, "id": "/component/channel_member", "channel": 1, "client": 5 },
    ];

    
    return createEntitySet( null, {esId:205, loadComponents:true, clear:true, debug:false})
        .then( ([registry,entitySet]) => {
            let entities = Common.loadEntities( registry, data );
            // Common.logEvents( entitySet );
            entitySet.on('all', eventSpy);
            // printE( entities );
            return entitySet.addEntity( entities, {batch:true, execute: false} )
                .then( added => {
                    // printIns( entitySet._cmdBuffer.cmds, 3 );
                    return entitySet.flush();
                })
                .then( () => {
                    t.ok( eventSpy.calledWith('component:add'), 'component:add should have been called');
                    t.ok( eventSpy.calledWith('entity:add'), 'entity:add should have been called');
                    let componentEvt = eventSpy.args[0][1];
                    let entityEvt = eventSpy.args[1][1];
                    
                    t.equal( componentEvt[4].get('channel'), entityEvt[0].id, 
                        'the channel attr should have been updated to the new entity id' );
                })
                .then( finalise(t,entitySet) )
        })
})



function finalise( t, entitySet ){
    return destroyEntitySet(entitySet, true)
        .then( () => { t.end() })
        .catch( err => { log.error('t.error: ' + err ); log.error( err.stack );} )     
}


// test('registering and removing component defs reuses ids', t => {
//     let schemaA = { id:'/component/channel', properties:{ name:{type:'string'} }};
//     let schemaB = { id:'/component/topic', properties:{ topic:{type:'string'} }};
//     let schemaC = { id:'/component/status', properties:{ status:{type:'string'} }};

//     return createEntitySet( null, {loadComponents:false, logEvents:false} )
//         // .then( entitySet => {
//         //     log.debug('returned');
//         //     printIns( arguments, 1 );
//         //     return entitySet;
//         // })
//         .then( entitySet => entitySet.registerComponentDef(schemaA) )
//         .then( entitySet => entitySet.registerComponentDef(schemaB) )
//         .then( entitySet => entitySet._loadComponentDefs() )
//         .then( defs => {
//             printIns( defs );
//             return true;
//         })
//         .then( () => t.end() )
//         .catch( err => { log.debug('error: ' + err ); log.debug( err.stack );} )
// });


