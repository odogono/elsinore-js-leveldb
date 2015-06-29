'use strict';

var _ = require('underscore');
var test = require('tape');

var Common = require('../common');

var Es = require('event-stream');
var Sinon = require('sinon');

var Elsinore = require('../../lib');

var EntityFilter = Elsinore.EntityFilter;
var EntitySet = Elsinore.EntitySet;
var Entity = Elsinore.Entity;
let Query = Elsinore.Query;
var Registry = Elsinore.Registry;
var Utils = Elsinore.Utils;

var LevelEntitySet = require('../../lib/entity_set_level');



test('returns the newest version of the schema', t => {
    let registry = Common.initialiseRegistry( {loadComponents:false, logEvents:false} );
    var schemaA = { id:'/schema/alpha', properties:{ name:{type:'string'} }};
    var schemaB = { id:'/schema/alpha', properties:{ fullname:{type:'string'} }};

    return createEntitySet( registry, {clear:true, open:true})
        .then( entitySet => entitySet.registerComponentDef(schemaA) )
        .then( entitySet => entitySet.registerComponentDef(schemaB) )
        .then( entitySet => entitySet.getComponentDef('/schema/alpha') )
        .then( schema => {
            t.ok( schema.obj.properties.fullname, 'the 2nd version is the one returned' );
            t.end();
        })
        .catch( err => { log.debug('error: ' + err ); log.debug( err.stack );} )
});



function createEntitySet( registry, options ){
    var entitySet;
    var path;
    options = options || {};
    var clearExisting = options.clear === undefined ? true : options.clear;
    options.path = Common.pathVarFile( (options.path || 'test/lvl/entity.ldb'), clearExisting );

    registry = registry || initialiseRegistry( options );
    entitySet = registry.createEntitySet( LevelEntitySet, options );

    if( options.open ){
        return entitySet.open( options );
    }
    
    return Promise.resolve(entitySet);
}