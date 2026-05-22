"@mp-lb/zog": patch

Handle legacy Mongo documents with app primary keys

Zog now treats an existing domain primary key field as authoritative on reads, even when Mongo `_id` contains a generated ObjectId. `findById` also falls back to legacy documents that still store the app primary key field directly.
