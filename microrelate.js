// TODO: ADD IN MANY TO MANY RELATINOSHIP GETTING IN REVERSE
// DEAL WITH DEFAULT_COLL

Backbone.store = {
    collections: {
        // 'SGUser': SGUserCol containing all objects
    },

    urlCache: {},

    registerModels: function(models) {
        /* Add all relations.  Could make collections too, so those don't hve to be declared
            Could also get rid of collection check.  Later
        */
        var self = this;

        // Register default
        // Necessary to create naked objects, because they get made automatically based on the namespace
        Backbone.RelationModelCol = Backbone.Collection.extend({});

        // Initialize default in collection
        this.collections['defaultModel'] = new Backbone.RelationModelCol;

        // Iterate over models put in, fill out relations hash, and create their collections
        $.each(arguments, function(i, model) {
            // Setup the relations hash
            self.relations[model.prototype.nameString] = {};
        });

        $.each(arguments, function(i, model) {
            // Get namespace of model, create a collection name that is named same as model but with 'Col' appended
            var si = model.prototype.nameString
                , colStr = si + 'Col'
                , pcs = getParent(colStr);
            var DEFAULT_COLL = window.DEFAULT_COLL or Backbone.Collection;
            pcs[colStr] = DEFAULT_COLL.extend({
                model: model,
                url: model.prototype.urlRoot,
            });
            // Make the Collection with
            var a = pcs[colStr];

            // Initialize in collections store
            self.collections[si] = new a();
            $.each(model.prototype.relations, function(ii, relation) {
                // Add every relation and its inverse to the store
                self.relations[si][relation.key] = relation;
                revRelation = self._reverse(model, relation);
                self.relations[getObj(relation.relatedModel).prototype.nameString][revRelation.key] = revRelation;
            });
        });
    },

    relations: {/* all relations in to remove redundant code.  */},

    _reverse: function(obj, relation) {
        var type = 'has_many';
        if(relation.type == 'many_many') {
            type = 'many_many';
        } else if (relation.type == 'one_one') {
            type = 'one_one';
        }
        return {
            key: relation.reverseKey,
            reverseKey: relation.key,
            type: type,
            reverse: true,
            relatedModel: obj.prototype.nameString,
        }
    },

    _collectionCheck: function(obj) {
        /* Check in the collection for object of this type, create if it hasn't been done already */
        if(!this.collections[obj.nameString]){
            var a = getObj(obj.nameString + 'Col');
            this.collections[obj.nameString] = new a();
        }
        return this.collections[obj.nameString];
    },

    find: function(obj, id){
        return this._collectionCheck(obj).get(id);
    },

    _getRelation: function(obj, relation) {
        if(!this.relations[obj.nameString]){return null;}
        return this.relations[obj.nameString][relation];
    },

    add: function(obj){
        return this._collectionCheck(obj).add(obj);
    },

    where: function(obj, conditions){
        var c = getObj(obj.nameString + 'Col');
        return new c(obj.all().where(conditions));
    },

};

/*

CHANGED WAY THAT RELATIONS ARE GOTTEN< WHAT THEY LOOK LIKE< AND ADDED IN 'one_one'.   NEED TO CONSOLIDATE has_one one_one comparisons
*/




Backbone.RelationModel = Backbone.Model.extend({
    nameString: 'Backbone.RelationModel',
    relations: [],

    constructor: function(attrs, options) {
        attrs = attrs || {}, options = options || {};
        // If its already this kind of object, return it
        if(attrs instanceof this.constructor) {
            return attrs;
        }
        // If it already exists, return the existing
        if(attrs[this.idAttribute]) {
            attrs[this.idAttribute] = _handleID(attrs[this.idAttribute]);
            var existing = Backbone.store.find(this, attrs[this.idAttribute]);
            if(existing) {
                existing.set(attrs, options);
                return existing;
            }
        }

        Backbone.Model.apply( this, arguments );
        Backbone.store.add(this);
    },

    _getRelation: function(key) {
        return Backbone.store._getRelation(this, key);
    },

    get: function(attr){
        // Check the relationships, return a relationship if exists
        // All heavy lifting will happen on 'set'
        window.x = {t:this, a: attr};
        var relatedModel, newCol
            , lookup = {}
            , originalResult = Backbone.Model.prototype.get.call( this, attr )
            , relation = this._getRelation(attr);

        if(relation){
            if(relation.reverse) {
                relatedModel = getObj(relation.relatedModel);
                lookup[relation.reverseKey] = this;
                newCol = Backbone.store.where(relatedModel.prototype, lookup);
                _makeUrl(newCol, this, relation);
                return newCol;
            }
        }
        return originalResult;
    },
    
    fetch: function(key, options) {
        /* Works as usual for models, with standard arguments but will replace 'fetchRelated' as more intuitive for relationships */
        if(arguments.length == 2) {
            key = arguments[0];
            options = arguments[1];
        } else {
            if(_.isString(arguments[0])){
                key = arguments[0], options = {};
            }else{
                key = null, options = arguments[0];
            }
        }
        
        if (key) {
            if(this._getRelation(key)) {
                return this.fetchRelated(key)
            } else {
                throw new Error("No relation named '" +  key + "' on : " + this.nameString);
            }
        } else {
            return Backbone.Model.prototype.fetch.call(this, options);
        }
    },

    fetchRelated: function(attr, options){
        options = options || {};
        // Make sure its a relation
        if(!this._getRelation(attr)){return []}
        // CHeck to see if its already been fetched, if not, return jqxhr object
        var o = this.get(attr);
        if(!o){return null};

        // On fence about caching reverse relations already fetched
//        var relation = this._getRelation(attr);
//        if(relation) {
//           if(!relation.reverse) {}}

        // This object already exists, just return it
        if('attributes' in o) {
            // 2 is conservative. 1 is just id. Not much just has two attributes
            if(_.keys(o.attributes).length > 2){
                return [];
            }
        }

        // Cache by only fetching once
        if(o._alreadyFetched) {
            return [];
        }

        // Check its URL to make sure it was set properly
        var u = _.isFunction(o.url)?  o.url() : o.url;
        if(u){
            if(u.split('/').length < 5) {
                // Not nested, need to remake url
                _makeUrl(o, this, {key:attr});
            }

            // This call has been made before, the data is already here
            if(u in Backbone.store.urlCache){
                return [];
            }
            Backbone.store.urlCache[u] = true;
        }
        o._alreadyFetched = true;
        return o.fetch(options);
    },

    toJSON: function(options) {
        var self = this;
        var json = Backbone.Model.prototype.toJSON.call( this, options );
        $.each(this.relations, function(i, relation) {
            if(relation.reverse && relation.key in json) {
                // Remove reverse relations
                delete json[relation.key];
            } else {
                var x = self.get(relation.key);
                if(x !== undefined) {
                    if(isSingle(relation)) {
                        if(x instanceof Backbone.Model) {
                            json[relation.key] = x.get(x.idAttribute) || '';
                        } else {
                            json[relation.key] = x;
                        }
                    } else {
                        var l = [];
                        if(x instanceof Backbone.Model && x.get(x.idAttribute)) {
                            json[relation.key] = l.push(x.get(x.idAttribute));
                        } else if(x instanceof Backbone.Collection) {
                            $.each(x.pluck(x.model.prototype.idAttribute), function(ii, y) {
                                    if(y){
                                        l.push(_handleID(y));
                                    }
                            });
                        } else {
                            l = x;
                        }
                        json[relation.key] = l;
                    }
                }
            }
        });

        return json;
    },

    set: function (key, val, options) {
        // var self = this;
        var attrs, id, existing,
            data = {},
            self = this;

        if (key === null) {
            return this;
        }
        if (_.isObject(key)) {
            attrs = key;
            options = val;
        } else {
            attrs = {};
            attrs[key] = val;
        }
        if(attrs[this.idAttribute]) {
            attrs[this.idAttribute] = _handleID(attrs[this.idAttribute]);
        }


        $.each(attrs, function(k,v) {
            // If it has changed
            if(v !== self.get(k)) {
                // Check for relation
                var relation = self._getRelation(k);
                if(relation) {
                    if(!relation.reverse) {
                        // if it is a relation, set it to a collection
                        data[k] = setType(self, relation, v)

                        if(data[k] instanceof Backbone.Collection) {
                            _makeUrl(data[k], self, relation);
                        }
                    }
                } else {
                    data[k] = v;
                }
            }
        });

        return Backbone.Model.prototype.set.call(this, data, options);
    },

    all: function() {
        return Backbone.store._collectionCheck(this);
    },

});

_.extend(Backbone.RelationModel, {
    all: function() {
        return this.prototype.all();
    },

    find: function(id) {
        return this.prototype.all().get(id);
    },

});

_makeUrl = function(coll, obj, relation) {
    if(obj.id){
        coll.url = obj.url() + relation.key + '/';
    }
}

isSingle = function(relation) {
    return relation.type.indexOf('one') > -1;
}

setType = function(obj, relation, val) {
    if (!val){return null};
    var result, data = {}, obj = getObj(relation.relatedModel);

    if(isSingle(relation)) {
        return _coerceSingle(obj, val);
    } else {
        if(val instanceof Backbone.Collection) {
            _makeUrl(val, obj, relation);
            return val;
        }
        // Multi relationship.  Make sure it gets a collection
        result = getObj(relation.relatedModel + 'Col');
        result = new result();

        if (_.isArray(val)) {
            // Array
            var newObjs = [];
            $.each(val, function(i,x) {
                var cc = _coerceSingle(obj, x);
                if(cc) {
                   newObjs.push(cc);
                }
            });
            result.add(newObjs);

        } else if(_.isObject(val)) {
            // Let the collection coerce it into a model
            var cc = _coerceSingle(obj, val);
            if(cc){
                result.add(cc);
            }
        }
        _makeUrl(result, obj, relation);
        return result;
    }
}

_handleID = function(i) {
    if(_.isNumber(i)){
        return parseInt(i);
    }
    return i;
}

_coerceSingle = function(obj, val) {
    var data = {};
    if(val instanceof obj) {
        return val;
    }
    else if(_.isObject(val)){

        return new obj(val);
    }
    else if(_.isString(val) || _.isNumber(val)) {
        val = _handleID(val);
        if(obj.find(val)){return obj.find(val)};
        data[obj.prototype.idAttribute] = val;
//        console.log('newdata');
//        console.log(data);
        return new obj(data)
    }
    return null;
}

getParent = function(s) {
    var s = s.split('.');
    if(s.length > 1) {
        return getObj(s.splice(0, s.length - 1).join('.'));
    }
    return window
}

getObj = function(s){
    var o = window;
    $.each(s.split('.'), function(i,x){
        o = o[x];
    });
    return o;
}
//////








