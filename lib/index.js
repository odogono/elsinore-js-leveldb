var _ = require('underscore');
var Backbone = require('backbone');
var LevelUp = require('levelup');
var Sublevel = require('level-sublevel');
var Path = require('path');
var Sh = require('shelljs');

var Elsinore = require('../');

var EntityFilter = Elsinore.EntityFilter;
var EntitySet = Elsinore.EntitySet;
var Entity = Elsinore.Entity;
let Query = Elsinore.Query;
var Registry = Elsinore.Registry;
var Utils = Elsinore.Utils;

var CmdBuffer = require('../cmd_buffer/async');


var KEY_DELIMITER = '\x00';
var SCHEMA_STORE = 'schema-store';
var META_STORE = 'meta-store';
var UUID_KEY = '_local_uuid';



/**
*   Lots of clues take from:
*       https://github.com/pouchdb/pouchdb/blob/master/lib/adapters/leveldb/index.js
*/
var LevelEntitySet = EntitySet.extend({
    type: 'LevelEntitySet',
    isLevelEntitySet: true,
    isAsync: true,


    initialize: function( entities, options ){
        this._cmdBuffer = CmdBuffer.create();
        this.options = options;
    },

    open: function( options ){
        var self = this;
        if( this.isOpen() ){
            return Promise.resolve(this);
        }
        var path = this.options.path;
        // log.debug('opening with options ' + JSON.stringify(options) );
        

        return new Promise( function(resolve){
            self._db = Sublevel(LevelUp( path , function(err,db){
                if( err ) { throw new Error('error opening ' + err); }
                
                self._schemaStore = self._db.sublevel( SCHEMA_STORE, {valueEncoding:'json'} );
                self._metaStore = self._db.sublevel( META_STORE, {valueEncoding: 'json'});

                return self._metaStore.get(UUID_KEY, function(err,val){
                    self.id = !err ? val : Utils.uuid();
                    self._metaStore.put( UUID_KEY, self.id, function(err,val){
                        return resolve(self);
                    });
                });
                // return resolve( self );
            }));
        })
    },

    /**
    *
    */
    close: function(){
        return Promise.resolve();
    },

    /**
    *
    */
    isOpen: function(){
        return this._db && this._db.isOpen();
    },

    /**
    *
    */
    registerComponentDef: function( data ){
        var self = this;
        var store = self._schemaStore;
        var schema = self.getRegistry().registerComponent( data );

        schema = Utils.deepClone( _.pick(schema, 'uri', 'hash', 'obj') );
        schema.registered_at = Date.now();

        return new Promise( function(resolve){
            return store.put( 'hash:' + schema.hash, schema, function(err){
                return store.put( 'uri:' + schema.uri, schema, function(err){
                    return resolve( self );
                });
            });
        });

        return self;
    },

    /**
    *
    */
    getComponentDef: function( schemaId ){
        var self = this;
        var store = self._schemaStore;

        return new Promise( function(resolve){
            return store.get( 'uri:' + schemaId, function(err,val){
                if( err ){
                    throw new Error('component def not found: ' + schemaId + ' : ' + err );
                }
                return resolve(val);
            });
        });
    },


});


LevelEntitySet.create = function( options ){
    var result;

    options || (options={});

    options = _.extend( {
        path: Path.join( Sh.tempdir(), 'lvlEs_' + options.id )
    }, options );

    result = new LevelEntitySet( null, options );
    // result.cid = _.uniqueId('es');
    
    return result;
}

module.exports = LevelEntitySet;