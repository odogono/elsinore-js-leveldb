'use strict';

var _ = require('underscore');
var Backbone = require('backbone');
var LevelUp = require('levelup');
// var Sublevel = require('level-sublevel');
var Path = require('path');
var PromiseQ = require('promise-queue');
var Sh = require('shelljs');

var Elsinore = require('elsinore-js');
var LU = require('./utils');

var BitField = Elsinore.BitField;
var EntityFilter = Elsinore.EntityFilter;
var EntitySet = Elsinore.EntitySet;
var Entity = Elsinore.Entity;
var Errors = Elsinore.Errors;
var Query = Elsinore.Query;
var Registry = Elsinore.Registry;
var Utils = Elsinore.Utils;

var CmdBuffer = require('elsinore-js/lib/cmd_buffer/async'); //Elsinore.CmdBuffer.Async; //require('../cmd_buffer/async');
var Query = require('./query');

var Constants = require('./constants');

/**
*   Lots of clues take from:
*       https://github.com/pouchdb/pouchdb/blob/master/lib/adapters/leveldb/index.js
*
*   NOTE: sublevel currently breaks closing, so we can't use it
*/
var LevelEntitySet = EntitySet.extend({
    type: 'LevelEntitySet',
    isLevelEntitySet: true,
    isMemoryEntitySet: false,
    isAsync: true,

    initialize: function initialize(entities, options) {
        this._cmdBuffer = CmdBuffer.create();
        this.options = options;
        this._pQ = new PromiseQ(1);
    },

    open: function open(options) {
        var self = this;
        var levelOptions, defaultComponentDefId, defaultEntityId, defaultComponentId;
        if (this.isOpen()) {
            return Promise.resolve(this);
        }
        var path = this.options.path;
        self.log('opening ' + this.cid + ' with options ' + JSON.stringify(options));

        levelOptions = _.extend({}, options.leveldb, {
            valueEncoding: 'json'
        });

        this.id = _.isUndefined(options.esId) ? 1 : options.esId;
        defaultComponentDefId = _.isUndefined(options.componentDefId) ? 100 : options.componentDefId;
        defaultEntityId = _.isUndefined(options.entityIdSeed) ? 50 : options.entityIdSeed;
        defaultComponentId = _.isUndefined(options.componentId) ? 200 : options.componentId;

        return LU.openDb(levelOptions).then(function (db) {
            self._db = db;
            // sets the UUID of this db
            return LU.getSet(self._db, null, Constants.UUID, Utils.uuid());
        }).then(function () {
            return LU.getSet(self._db, null, Constants.ENTITY_SET_ID, self.id).then(function (id) {
                self.id = id;
            });
        }).then(function () {
            // set up an id for component defs
            return LU.createReuseableId(self._db, self._pQ, Constants.COMPONENT_DEF_ID, defaultComponentDefId).then(function (ruid) {
                self._cdefId = ruid;
            });
        }).then(function () {
            return LU.createReuseableId(self._db, self._pQ, Constants.ENTITY_ID, defaultEntityId).then(function (ruid) {
                self._entityId = ruid;
            });
        }).then(function () {
            return LU.createReuseableId(self._db, self._pQ, Constants.COMPONENT_ID, defaultComponentId).then(function (ruid) {
                self._componentId = ruid;
            });
        }).then(function () {
            // load existing component defs into memory and then notify the registry about them
            return self.getComponentDefs({ notifyRegistry: true }).then(function () {
                self.log('opened @ ' + self._db.location);
                return self;
            });
        });
    },

    /**
    *   Returns a promise for a new component def id
    */
    _createComponentDefId: function _createComponentDefId(c) {
        return this._cdefId.get();
    },

    _releaseComponentDefId: function _releaseComponentDefId(id) {
        return this._cdefId.release(id);
    },

    _readValue: function _readValue(key) {
        var self = this;
        return new Promise(function (resolve, reject) {
            self._db.get(key, function (err, val) {
                if (err) {
                    return reject(err);
                }
                return resolve(val);
            });
        });
    },

    /**
    *
    */
    close: function close() {
        return LU.closeDb(this._db);
    },

    /**
    *   Clears all data from the EntitySet, by getting all the keys and then deleting them
    */
    clear: function clear(options) {
        var self = this;
        // printIns( this,1 );
        return LU.readStream(this._db, {
            values: false,
            gte: Constants.KEY_START,
            lte: Constants.KEY_LAST
        }).then(function (keys) {
            var ops = _.map(keys, function (key) {
                // log.debug('clearing ' + key);
                return { type: 'del', key: key };
            });
            return LU.batch(self._db, self._pQ, ops);
        }).then(function () {
            return self;
        });
    },

    /**
    *   Returns a promise for the number of entities in this entityset
    */
    size: function size(debug) {
        return LU.readStream(this._db, {
            values: false,
            gte: Constants.ENTITY_BITFIELD + Constants.KEY_START,
            lte: Constants.ENTITY_BITFIELD + Constants.KEY_LAST
        }).then(function (keys) {
            // if( debug ) { printIns( keys ); }
            return keys.length;
        });
    },

    /**
    *
    */
    isOpen: function isOpen() {
        return this._db && this._db.isOpen();
    },

    /**
    *   Registers a component def.
    *   Returns a promise eventually resolving to this.
        - do we already
    */
    registerComponentDef: function registerComponentDef(data, options) {
        var self = this;
        var store = self._db;
        var initial;

        options = options || {};

        // self.log('registering schema ' + JSON.stringify(data) + ' ' + JSON.stringify(options) );

        // if this hasn't been called from the registry, then we forward the request
        // on to the registry, which takes care of decomposing the incoming schemas
        // and then notifying each of the entitySets about the new component defs
        if (!options.fromRegistry) {
            return this.getRegistry().registerComponent(data, { fromES: self }).then(function () {
                return self;
            });
        }

        return this.getComponentDefByHash(data.hash).then(function (existing) {
            if (existing) {
                return existing;
            }
            // self.log('no existing cdef ' + data.hash );
            return self._registerComponentDef(data);
        });
    },

    _registerComponentDef: function _registerComponentDef(cdef, options) {
        var self = this;
        // var registry = self.getRegistry();

        return Promise.resolve(cdef).then(function (schema) {
            schema = Utils.deepClone(_.pick(schema, 'uri', 'hash', 'obj', 'iid'));
            schema.registered_at = Date.now();
            // get an internal id for this new component def
            return self._cdefId.get().then(function (id) {
                if (id === undefined) {
                    throw new Error('no cdef esid generated');
                }
                // self.log('generated new cdef id ' + id);
                schema.esid = id;
                // map from the registry id to es id and vice versa
                self._cdefRIdToEsId = self._cdefRIdToEsId || [];
                self._cdefEsIdToRId = self._cdefEsIdToRId || [];
                self._cdefUriToSchema = self._cdefUriToSchema || {};
                self._cdefEsIdToSchema = self._cdefEsIdToSchema || {};

                self._cdefRIdToEsId[schema.iid] = schema.esid;
                self._cdefEsIdToRId[schema.esid] = schema.iid;
                self._cdefUriToSchema[schema.uri] = schema;
                self._cdefEsIdToSchema[schema.esid] = schema;

                // self.log('registered schema ' + JSON.stringify(schema) );
                return schema;
            });
        }).then(function (schema) {
            return LU.batch(self._db, self._pQ, [{ type: 'put', key: [Constants.COMPONENT_DEF_ID, schema.esid].join(Constants.DELIMITER), value: schema }, { type: 'put', key: [Constants.COMPONENT_DEF_HASH, schema.hash].join(Constants.DELIMITER), value: schema }, { type: 'put', key: [Constants.COMPONENT_DEF_URI, schema.uri].join(Constants.DELIMITER), value: schema }]).then(function () {
                return schema;
            });
        }).then(function (schema) {
            // self.log('registering cdef ' + schema.uri + ' ' + schema.hash + ' iid ' + schema.iid + ' esid ' + schema.esid );
            self.trigger('cdef:register', schema);
            return self;
        });
    },

    /**
    *   Returns a component def by its hash
    */
    getComponentDefByHash: function getComponentDefByHash(hash) {
        return LU.get(this._db, null, [Constants.COMPONENT_DEF_HASH, hash].join(Constants.DELIMITER), null);
    },

    /**
    *   Returns a component def by its id/uri
    */
    getComponentDef: function getComponentDef(schemaId, cached) {
        if (cached) {
            var id = this._cdefRIdToEsId[schemaId];
            // log.debug('gCD ' + schemaId + ' ' + id );
            // printIns( id ? this._cdefEsIdToSchema[id] : null );
            // throw new Error('stop');
            return id ? this._cdefEsIdToSchema[id] : null;
        }
        return LU.get(this._db, null, [Constants.COMPONENT_DEF_URI, schemaId].join(Constants.DELIMITER), null);
    },

    /**
    *   Reads component defs into local structures
    *   Returns a promise for an array of registered schemas
    */
    getComponentDefs: function getComponentDefs(options) {
        var self = this;
        var store = self._db;

        options = options || {};

        return LU.readStream(store, {
            keys: false,
            gte: Constants.COMPONENT_DEF_URI + Constants.KEY_START,
            lte: Constants.COMPONENT_DEF_URI + Constants.KEY_LAST
        }).then(function (schemas) {
            // _.each( schemas, function(s){
            //     self.log('read schema ' + s.uri + ' ' + s.hash );
            // })

            if (options.notifyRegistry) {
                var registry = self.getRegistry();
                return Promise.all(_.map(schemas, function (schema) {
                    return registry.registerComponent(schema);
                })).then(function () {
                    return schemas;
                });
            }
            return schemas;
        });
    },

    getEntity: function getEntity(entity, options) {
        var entityId;

        entityId = Entity.toEntityId(entity);

        if (options && options.componentBitFieldOnly) {
            return this._readEntityBitField(entityId);
        }

        return this._readEntityById(entityId);
    },

    /**
    *
    */
    _readEntityById: function _readEntityById(entityId) {
        var registry = this.getRegistry();
        var key = LU.key(Constants.ENTITY_COMPONENT, entityId);
        var store = this._db;

        return LU.readStream(store, {
            keys: false,
            gte: key + Constants.KEY_START,
            lte: key + Constants.KEY_LAST
        }).then(function (components) {
            if (_.size(components) === 0) {
                // log.debug('could not find entity ' + entityId + ' from ' + key + Constants.KEY_START );
                // printIns( components );
                throw new Errors.EntityNotFoundError(entityId);
            }
            var entity = registry.createEntity(null, { id: entityId });
            _.each(components, function (data) {
                var schemaUri = data._sh;
                data = _.omit(data, '_s', '_sh', '_e');
                var component = registry.createComponent(schemaUri, data);
                // printIns( component );
                entity.addComponent(component);
            });
            return entity;
        });
    },

    /**
    *   Returns an entity instance for the given id with only its
    *   bitfield set, but no components retrieved
    */
    _readEntityBitField: function _readEntityBitField(entityId) {
        var registry = this.getRegistry();
        var key = LU.key(Constants.ENTITY_BITFIELD, entityId);
        var store = this._db;

        return LU.get(this._db, null, key, null).then(function (data) {
            var entity;
            if (!data) {
                // log.debug('not found ' + key );
                throw new Errors.EntityNotFoundError(entityId);
            }

            entity = Entity.create(entityId);
            // log.debug('+++_readEntityById ' + entity.id);
            entity.set('comBf', BitField.create(data));
            return entity;
        });
    },

    /**
    *
    */
    update: function update(entitiesAdded, entitiesUpdated, entitiesRemoved, componentsAdded, componentsUpdated, componentsRemoved) {
        var self = this;
        var commands = [];
        var newEntities;
        var existingEntityIds = {};
        var registry = this.getRegistry();
        var result = {};

        // _.each( entitiesAdded, function(e){
        //     log.debug('adding entity ' + JSON.stringify(e) );
        // });

        // extract entities added which need new ids
        newEntities = _.reduce(entitiesAdded, function (result, e) {
            if (e.getEntitySetId() !== self.id) {
                // existingEntityIds[ e.id ] = e;
                result.push(e);
            }
            return result;
        }, []);

        // create entity ids for each of the entities
        return self._entityId.getMultiple(newEntities.length).then(function (entityIds) {
            // assign the entity ids to the entities
            _.each(newEntities, function (entity, ii) {
                var existingId = entity.id;
                // set the new id on the entity (and its components)
                self._setEntityId(entity, entityIds[ii]);
                // record what the entity id was, so we can update references (in components) later
                existingEntityIds[existingId] = entity.id;
            });

            _.each(entitiesAdded, function (entity) {
                commands = self._updateEntity(entity, commands);
                // log.debug('ldbes> added e ' + entity.id + '-' + entity.getEntityId() + '/' + entity.getEntitySetId() );
            });
            result.entitiesAdded = entitiesAdded;

            _.each(entitiesUpdated, function (entity) {
                // log.debug('ldbes> updated e ' + entity.id + '-' + entity.getEntityId() + '/' + entity.getEntitySetId() );
                commands = self._updateEntity(entity, commands);
            });
            result.entitiesUpdated = entitiesUpdated;
        }).then(function () {
            // log.debug('entitiy id map: ' + JSON.stringify(existingEntityIds) );

            // using the build up map of entity ids as they were and as they are, convert
            // any entity references
            componentsAdded = _.map(componentsAdded, function (com) {
                var result = registry.mapComponentEntityRefs(com, existingEntityIds);
                return result;
            });

            result.componentsAdded = componentsAdded;
            // printE( componentsAdded );

            // create component ids for each of the components
            return self._componentId.getMultiple(componentsAdded.length).then(function (componentIds) {
                _.each(componentsAdded, function (com, ii) {
                    // log.debug('adding component ' + com.getSchemaId() + ' ' + JSON.stringify(com) + ' to ' + com.getEntityId() );
                    // log.debug('e id was ' + com._entity.id )
                    // printIns( com );
                    com.set({ id: componentIds[ii] });
                    // var sch = self.getComponentDef( com.getSchemaId(), true );
                    // printIns( sch, 1 );
                    commands = self._updateComponent(com, commands);
                });
                return commands;
            });
        }).then(function () {
            // printIns( componentsRemoved );
            // log.debug('err ' + componentsRemoved.length);
            // deal with removing components
            _.each(componentsRemoved, function (component) {
                commands = self._removeComponent(component, commands);
            });
            // printIns( commands );

            result.componentsRemoved = componentsRemoved;

            // printIns( commands );
            // })
            // .then( function(){
            // deal with removing entities
            _.each(entitiesRemoved, function (entity) {
                commands = self._removeEntity(entity, commands);
                // log.debug('removed e ' + entity.id + '-' + entity.getEntityId() + '/' + entity.getEntitySetId() );
            });
            result.entitiesRemoved = entitiesRemoved;
        }).then(function () {
            // printIns( commands );
            return LU.batch(self._db, self._pQ, commands);
        }).then(function () {
            return result;
        });
    },

    /**
    *   Sets an id on an entity and also updates the components
    */
    _setEntityId: function _setEntityId(entity, entityId, options) {
        var self = this;
        var updateEntityRefs = options ? options.updateEntityRefs : false;
        var existingId = entity.id;
        // log.debug('setting entity id ' + entityId + ' ' + this.id );
        entity.setId(entityId, this.id);

        if (updateEntityRefs) {
            log.debug('changing e refs from ' + existingId + ' to ' + entity.id);
            var coms = entity.getComponents();
            _.each(coms, function (com) {
                log.debug('updating e ref for ' + JSON.stringify(com));
                var schema = self.getComponentDef(com.getSchemaId(), true);
                log.debug('  checking ' + schema.hash + ' ' + JSON.stringify(self.getSchemaRegistry().getProperties(schema.hash)));
            });
        }
    },

    _updateEntity: function _updateEntity(entity, commands) {
        // entity id -> component bitfield
        commands.push({
            type: 'put',
            key: LU.key(Constants.ENTITY_BITFIELD, entity.id), //getEntityId()),
            value: entity.getComponentBitfield().toString()
        });

        // entity id : component bitfield ->
        commands.push({
            type: 'put',
            key: LU.key(Constants.ENTITY_ID_BITFIELD, entity.id, entity.getComponentBitfield().toString()),
            value: entity.id
        });

        // this.trigger('ent:up ',entity.getEntityId() );
        // self.log('update entity ' +

        return commands;
    },

    /**
    *   deletes an array of entities
    */
    _removeEntity: function _removeEntity(entity, commands) {
        commands.push({
            type: 'del',
            key: LU.key(Constants.ENTITY_BITFIELD, entity.id) //getEntityId())
        });

        // entity id : component bitfield ->
        commands.push({
            type: 'del',
            key: LU.key(Constants.ENTITY_ID_BITFIELD, entity.id, entity.getComponentBitfield().toString())
        });

        // log.debug('_removeEntity ' + LU.key(Constants.ENTITY_BITFIELD, entity.id));

        return commands;
    },

    /**
    *
    */
    _updateComponent: function _updateComponent(component, commands) {
        var componentData = component.toJSON();
        var schema = this._cdefUriToSchema[component.schemaUri];
        componentData._s = schema.uri;
        componentData._sh = schema.hash;
        componentData._e = component.getEntityId();

        // entity id : component id -> component
        commands.push({
            type: 'put',
            key: LU.key(Constants.ENTITY_COMPONENT, component.getEntityId(), component.id),
            value: componentData
        });

        // component id -> component JSON
        commands.push({
            type: 'put',
            key: LU.key(Constants.COMPONENT_DATA, component.id),
            value: componentData
        });

        // component def hash -> component JSON
        commands.push({
            type: 'put',
            key: LU.key(Constants.COMPONENT_DEF, schema.hash, component.id),
            value: componentData
        });

        return commands;
    },

    /**
    *   deletes an array of components
    */
    _removeComponent: function _removeComponent(component, commands) {
        var schema = this._cdefUriToSchema[component.schemaUri];
        if (!schema) {
            throw new Error('schema not found for ' + JSON.stringify(component));
        }

        commands.push({
            type: 'del',
            key: LU.key(Constants.ENTITY_COMPONENT, component.getEntityId(), component.id)
        });

        commands.push({
            type: 'del',
            key: LU.key(Constants.COMPONENT_DATA, component.id)
        });

        commands.push({
            type: 'del',
            key: LU.key(Constants.COMPONENT_DEF, schema.hash, component.id)
        });

        return commands;
    },

    query: function query(_query, options) {
        if (!_query) {
            _query = Query.root();
        }
        return Query.execute(this, _query, options).then(function (result) {
            // log.debug('query result: ' + Utils.stringify(result));
            return result;
        });
    }
});

function formatSeq(n) {
    return ('0000000000000000' + n).slice(-16);
}

function parseSeq(s) {
    return parseInt(s, 10);
}

LevelEntitySet.create = function (options) {
    var result;

    options || (options = {});

    // if( options.leveldb ){
    //     printIns( options.leveldb, 1 );
    // }
    options = _.extend({
        path: Path.join(Sh.tempdir(), 'lvlEs_' + options.id)
    }, options.leveldb, options);

    result = new LevelEntitySet(null, options);
    result.log = function (msg) {
        if (options.debug) {
            log.debug('lvldb.' + result.cid + '> ' + msg);
        }
    };
    // result.cid = _.uniqueId('es');

    return result;
};

// incorporate query fns
// LevelEntitySet = require('./query');
module.exports = LevelEntitySet;