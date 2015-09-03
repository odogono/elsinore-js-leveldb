'use strict';

var KEY_DELIMITER = '!'; // '\x00';
var KEY_START = '\x00';
var KEY_LAST = '\xFF';

module.exports = {
    SCHEMA_STORE: 'schema-store',
    META_STORE: 'meta-store',
    KEY_DELIMITER: KEY_DELIMITER,
    UUID: '_local_uuid',
    ENTITY_SET_ID: '_local_id',
    KEY_START: KEY_START,
    KEY_LAST: KEY_LAST,
    ENTITY_ID: '_ent_id',
    COMPONENT_ID: '_com_id',
    COMPONENT_DATA: '_com_data',
    COMPONENT_DEF: '_com_def',
    ENTITY_COMPONENT: '_ent_com',
    ENTITY_BITFIELD: '_ent_bf',
    ENTITY_ID_BITFIELD: '_ent_id_bf',
    COMPONENT_DEF_URI: ['cdef', 'uri'].join(KEY_DELIMITER),
    COMPONENT_DEF_HASH: ['cdef', 'hash'].join(KEY_DELIMITER),
    COMPONENT_DEF_ID: ['cdef', 'id'].join(KEY_DELIMITER)
};