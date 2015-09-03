'use strict';

let _ = require('underscore');
let test = require('tape');

let Fs = require('fs');
let Path = require('path');
let PromiseQ = require('promise-queue');

// let Es = require('event-stream');
let Sh = require('shelljs');
let Sinon = require('sinon');
let Util = require('util');

export const Elsinore = require('elsinore-js');

let EntityFilter = Elsinore.EntityFilter;
let EntitySet = Elsinore.EntitySet;
let Entity = Elsinore.Entity;
let Query = Elsinore.Query;
let Registry = Elsinore.Registry;
let Utils = Elsinore.Utils;


let rootDir = Path.join( Path.dirname(__filename), '../' );
let srcDir = Path.join(rootDir, 'src');
let varDir = Path.join( rootDir, 'var' );
var fixtureDir = Path.join( rootDir, 'test', 'fixtures' );

export const LevelEntitySet = require( srcDir);
export const LU = require( Path.join(srcDir,'utils') );




export function createEntitySet( registry, options ){
    let entitySet;
    let path;
    // let registry;
    options = options || {};
    // let open = (options.open === undefined) ? true : options.open;
    let clearExisting = options.clear === undefined ? true : options.clear;
    let doLoadEntities = options.loadEntities === undefined ? false : options.loadEntities;
    let logEvents = options.logEvents === undefined ? false : options.logEvents;
    options.leveldb = { path: pathVarFile( (options.path || 'test/lvl/entity.ldb'), clearExisting ) };
    
    options.leveldb.db = require('memdown');
    // printIns( options.leveldb.db, 1);
    // options.leveldb = {db: require('memdown'), active:true};

    // 
    
    return (registry ? Promise.resolve(registry) : initialiseRegistry( options ))
        .then( reg => { registry = reg; return registry.createEntitySet(LevelEntitySet, options) })
        .then( es => {
            if( logEvents ){
                Common.logEvents( es );
            }

            if( doLoadEntities ){
                let entitySet = loadEntities( registry, (doLoadEntities||'query.entities') );
                return es.addEntity( entitySet )
                    .then( () => es )
            }
            return es;
        });

        // .then( entitySet => {
        //     // if( open ){ return entitySet.open(options); }
        //     return entitySet;
        // })
        // .then( entitySet => {
        //     // NOTE: MemDOWN does not appear to clear itself between uses
        //     if( open && clearExisting ){
        //         return entitySet.clear();
        //     }
        //     return entitySet;
        // })
}

function loadFixture( fixturePath ){
    var path = Path.join( fixtureDir, fixturePath );
    var data = Fs.readFileSync( path, 'utf8');
    return data;
}


function loadFixtureJSON( fixturePath, data ){
    try {
        var data = loadFixture( fixturePath );
        data = JSON.parse( data );
        return data;
    } catch( e ){
        log.debug('error loading fixture JSON: ' + e );
        return null;
    }
}

// compile a map of schema id(uri) to schema
function loadComponents(){
    var data = loadFixtureJSON( 'components.json' );
    var componentData = _.reduce( data, 
                        function(memo, entry){
                            memo[ entry.id ] = entry;
                            return memo;
                        }, {});
    return componentData;
}

/**
*   Returns an entityset with the given entities
*/
export function loadEntities( registry, fixtureName, EntitySet, options ){
    let data;
    let lines;
    let result;

    fixtureName = fixtureName || 'entity_set.entities.json';
    registry = registry || initialiseRegistry( options );
    result = registry.createEntitySet( EntitySet, options );

    if( _.isString(fixtureName) ){
        if( fixtureName.indexOf('.json') === -1 ){
            fixtureName = fixtureName + '.json';
        }
        data = loadFixture( fixtureName );
        data = JSON.parse( data );
    }
    else if( _.isObject(fixtureName) ){
        data = fixtureName;
    } else {
        throw new Error('invalid fixture name specified');
    }

    _.each( data, line => {
        let com = registry.createComponent( line );
        result.addComponent( com );
        return com;
    });

    return result;
}


export function initialiseRegistry( doLogEvents ){
    var componentData;
    var registry = Elsinore.Registry.create();
    var options, load;

    if( _.isObject(doLogEvents) ){
        options = doLogEvents;
        doLogEvents = options.doLogEvents;
    }
    if( doLogEvents ){
        // log.debug('logging events');
        logEvents( registry );
    }

    options = (options || {});
    load = _.isUndefined(options.loadComponents) ? true : options.loadComponents;

    if( load ){
        componentData = loadComponents();
        // log.debug('loading components ' + JSON.stringify(options) );
        // printIns( componentData );
        return registry.registerComponent( componentData, options )
            .then( () => registry )
    }

    return Promise.resolve(registry);
}

export function pathVarFile( path, clear ){
    path = Path.join( varDir, path );
    if( clear ){ 
        // log.debug('clearing ' + path );
        Sh.rm('-rf', path ); 
    }
    Sh.mkdir('-p', Path.dirname(path) );
    return path;
}

export function printKeys( entitySet, key, options ){
    if( _.isObject(key) ){
        options = key;
        key = null;
    }
    options = options || {};
    if( key ){
        options.gte = key + LU.KEY_START,
        options.lte = key + LU.KEY_LAST
    }
    return LU.printKeys( entitySet._db, entitySet._pQ, options )
        .then( () => entitySet );
}

export function destroyEntitySet( entitySet, clear ){
    let registry = entitySet.getRegistry();
    
    return Promise.resolve(entitySet)
        .then( () => {
            if( clear ){
                return entitySet.clear()
            }
            return entitySet;
        })
        .then( () =>  registry.removeEntitySet(entitySet) )
        .then( () => entitySet )
        .catch( err => { log.debug('error: ' + err ); log.debug( err.stack );} )
}

export function logEvents(obj, prefix){
    prefix = prefix || 'evt';
    obj.on('all', function(evt){
        log.debug(prefix + ' ' + JSON.stringify( _.toArray(arguments) ) );
    });
}


export function printIns(arg,depth,showHidden,colors){
    if( _.isUndefined(depth) ) depth = 2;
    // var stack = __stack[1];
    // var fnName = stack.getFunctionName();
    // var line = stack.getLineNumber();
    // Util.log( fnName + ':' + line + ' ' + Util.inspect(arg,showHidden,depth,colors) );
    Util.log( Util.inspect(arg,showHidden,depth,colors) );
};

export function printVar(){
    let i, len;
    for (i = 0, len = arguments.length; i < len; i++) {
        Util.log( JSON.stringify(arguments[i], null, '\t') );
        // Util.log( Util.inspect(arguments[i], {depth:1}) );
    }
}

global.printIns = printIns;
global.printVar = printVar;

global.log = {
    debug: console.log,
    error: console.log
};