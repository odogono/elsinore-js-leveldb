var async = require('async');
var levelup = require('levelup');
var path = require('path');


module.exports = function(entity){

    // sync strategy
    // entity is flattened
    // each entity is stored against its id
    // the entity type of each entity is added to a set key

    var LevelDbSync = entity.EntitySync.extend({
        constructor: function(options){
            // set some default options
            options = _.extend({
                keyPrefix:'odgn',
                keyDelimter:'\x00'
            }, options);

            var location = path.normalize(options.location);

            log.debug('creating at ' + location);
            this.db = levelup(location, options);
            entity.EntitySync.apply(this, arguments);
        },

        create: function( model, options, callback ){
            log.debug('LevelDbSync create ' + JSON.stringify(model) );

            this.db.put('entityType', model.entityType, function(err){
                if( err ) throw err;
                callback();
            });
        },


    })

    return LevelDbSync;
}