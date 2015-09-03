odgn-entity-leveldb
===================

- register component def
- retrieve component def

- retrieve entity by id (id internal to ES)
    using key : ent:<component_id>
- retrieve component by id (id internal to ES)
    using key : com:<component_id>
- retrieve components by entity id
    using key : <entity_id>:<component_id>

- retrieve components by component def
    using key : <def_id>:<component_id>

- retrieve components by entityfilter
    <filter_hash>:<component_id>



## Reusing ids

when an id is released:

- a key is added cdefid:ia:<def_id> = <def_id>

when an id is generated

- checks for the first key in cdefid:ia:*

