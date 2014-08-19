

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
            if(Backbone.CROSS_DOMAIN){model.urlRoot = Backbone.CROSS_DOMAIN + model.urlRoot;}
            self.relations[model.prototype.storeIdentifier] = {};
        });

        $.each(arguments, function(i, model) {
            // Get namespace of model, create a collection name that is named same as model but with 'Col' appended
            var si = model.prototype.storeIdentifier
                , colStr = si + 'Col'
                , pcs = getParent(colStr);
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
                self.relations[getObj(relation.relatedModel).prototype.storeIdentifier][revRelation.key] = revRelation;
            });
        });
    },

    relations: {/*
        all relations in to remove redundant code.
        ...
        'SGUser': {
            'messages': {
                key: "messages"
                relatedModel: "EventMessage"
                reverse: true
                reverseKey: "recipient"
                type: "has_many"
            }
        },
        ...

    */},

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
            relatedModel: obj.prototype.storeIdentifier,
        }
    },

    _collectionCheck: function(obj) {
        /* Check in the collection for object of this type, create if it hasn't been done already */
        if(!this.collections[obj.storeIdentifier]){
            var a = getObj(obj.storeIdentifier + 'Col');
            this.collections[obj.storeIdentifier] = new a();
        }
        return this.collections[obj.storeIdentifier];
    },

    find: function(obj, id){
        return this._collectionCheck(obj).get(id);
    },



    cacheObj: function(o, cacheUrl) {
        /* Takes an object and a url and caches minimal object info under url */
        // Save the current version in the store as [{id:5}, {id:4}, {id: 7}...]
        // This allows us to pick up the models where we left them without overwriting
        // Any properties that may have beeen created

        // Decide whether to cache collection or object
        var minimalModels = o.promise;
            if(!minimalModels) {


            if(o instanceof Backbone.Collection) {
                var idAttribute;
                minimalModels = [];

                if (o.models.length){
                    _.each(o.models, function(x) {
                        if(!idAttribute){ idAttribute = x.idAttribute;}
                        var mm = {};
                        mm[idAttribute] = x.id;
                        minimalModels.push(mm);
                    });
                }
            } else { // Its a model, just store its ID
                minimalModels = {};
                minimalModels[o.idAttribute] = o.id;
            }
        }

        // If its been fetched once, it will stay true
        Backbone.store.urlCache[cacheUrl] = minimalModels;
    },

    _getRelation: function(obj, relation) {
        if(!this.relations[obj.storeIdentifier]){return null;}
        return this.relations[obj.storeIdentifier][relation];
    },

    add: function(obj){
        return this._collectionCheck(obj).add(obj);
    },

    where: function(obj, conditions){
        var c = getObj(obj.storeIdentifier + 'Col');
        return new c(obj.all().where(conditions));
    },

};

/*

CHANGED WAY THAT RELATIONS ARE GOTTEN< WHAT THEY LOOK LIKE< AND ADDED IN 'one_one'.   NEED TO CONSOLIDATE has_one one_one comparisons
*/

Backbone.Collection = Backbone.Collection.extend({
    fetch: function(options) {
        var self = this
        ,   url = _.isFunction(self.url) ? self.url() : self.url
        ,   xhrObj;

        xhrObj = Backbone.Model.prototype.fetch.call(this, options);
        $.when(xhrObj).done(function() {
            Backbone.store.cacheObj(self, url);
        });
        return xhrObj;
    },

});


Backbone.RelationModel = Backbone.Model.extend({
    storeIdentifier: 'Backbone.RelationModel',
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

        if(Backbone.CROSS_DOMAIN){
            this.urlRoot = Backbone.CROSS_DOMAIN + this.urlRoot;
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

        var self = this;
        var relatedModel
            , self = this
            , newCol
            , lookup = {}
            , c
            , originalResult = Backbone.Model.prototype.get.call( this, attr )
            , relation = this._getRelation(attr);


        if(relation){
            if(relation.reverse) {
                relatedModel = getObj(relation.relatedModel);
                // M2M Relations have to look in collections
                if(relation.type == 'many_many') {
                    c = getObj(relatedModel.prototype.storeIdentifier + 'Col');
                    newCol = new c([]);
                    $.each(relatedModel.all().models, function(i,x) {
                        if(x && x.get(relation.reverseKey) && (x.get(relation.reverseKey).get(self.id) || x.get(relation.reverseKey).get(self.id.toString()))) {
                            newCol.add(x);
                        }
                    });
                // FK relations can just use a 'where' statement
                } else {
                    lookup[relation.reverseKey] = this;
                    newCol = Backbone.store.where(relatedModel.prototype, lookup);
                }
                newCol.url = _makeUrl(newCol, this, relation);
                return newCol;
            } else {
                // make sure right url being set for many to manys
                if (originalResult && relation.type == 'many_many'){
                    var origResUrl = _.isFunction(originalResult.url) ? originalResult.url() : originalResult.url;
                    // only reset the url if the relation is not already included
                    if (origResUrl.indexOf(relation.key) < 0){
                        originalResult.url = _makeUrl(originalResult, this, relation);
                    }
                }

            }

        }

        return originalResult;
    },

    addRelation: function(key, model, single) {
        // Create a relationship for it

        // Convert model to string
        if(!_.isString(model)) {
            model = model.prototype.storeIdentifier;
        }

        /* For custom API endpoints that return something other than a relationship */
        if(!Backbone.store.relations[this.storeIdentifier]){throw 'Object not in store';}

        // Dont create twice
        // create if it isnt in the store or if it takes filters?
        if(!Backbone.store.relations[this.storeIdentifier][key]) {
            // Add relation
            Backbone.store.relations[this.storeIdentifier][key] = {
                key: key,
                relatedModel: model,
                reverse: false,
                reverseKey: '',
                type: single ? 'has_one' : 'has_many',
            };
            // Set the relationship with an empty collection
            this.set(key, new new getObj(model + 'Col'))
        }

        return this.get(key);
    },

    fetch: function(options) {
        var self = this
        ,   xhrObj// = Backbone.Model.prototype.fetch.call(this, options)
        ,   url = _.isFunction(self.url) ? self.url() : self.url;

        xhrObj = Backbone.Model.prototype.fetch.call(this, options);
        $.when(xhrObj).done(function() {
            Backbone.store.cacheObj(self, url);
        });
        return xhrObj;
    },

    fetchRelated: function(attr, options, filters){
        /* Fetch models across a relationship */
        // If no id, not ready to fetch
        if(!this.id) {
            throw 'Cannot fetch related on object without an id';
        }
        options = options || {};
        filters = filters || {};

        // Call reset on the collection when its fetched
        _.extend(options, {reset: true});

        var relation = this._getRelation(attr)
        ,   o = this.get(attr);


        // If relation hasn't been seen/set yet, then we need to create that object.
        if(!o) {
            o = setType(this, relation, isSingle(relation) ? {} : []);
            this.set(attr, o);
        }

        var existingUrl = _.isFunction(o.url) ? o.url() : o.url;

        // Make sure its a relation
        if(!relation){
            throw attr + ' is not a relation on ' + this.storeIdentifier;
        }

        // Keep filters on collection so they stay on the url
        if(o instanceof Backbone.Collection) {
            o._filters = filters;
        }

        // URL of requested collection
        var newUrl = _makeUrl(o, this, {key: attr});

        // If its a model and has already been fetched
        if(o instanceof Backbone.Model && o.id) {
            newUrl = o.urlRoot + o.id + '/';
        }

        // If its an object and is already reasonably populated, set as fetched
        if('attributes' in o && o.attributes.length > 3) {
            Backbone.store.cacheObj(o, newUrl);
            return o;
        }

       // Sets new url on object so caching can happen in fetch if necessary
        o.url = newUrl;

        // Set cached version and return []
        if(Backbone.store.urlCache[newUrl]) {
            if(Backbone.store.urlCache[newUrl].promise) {
                return Backbone.store.urlCache[newUrl];
            }
            if(newUrl != existingUrl) {
                if(o instanceof Backbone.Model) {
                    this.set(attr, setType(this, relation, Backbone.store.urlCache[newUrl]));
                } else {
                    this.get(attr).reset(Backbone.store.urlCache[newUrl]);
                }
            }
            return this.get(attr);
        }

        // Call fetch like any other.  This sets fetched as true
        jqx = o.fetch(options);
        Backbone.store.cacheObj(jqx, newUrl);

        return jqx
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
                        data[k] = setType(self, relation, v);

                        if(data[k] instanceof Backbone.Collection) {
                            data[k].url = _makeUrl(data[k], self, relation);
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
        return obj.urlRoot + obj.id + '/' + relation.key + '/' + serializeParams(coll._filters);
    }
    return obj.urlRoot + serializeParams(coll._filters);
};

serializeParams = function(filters) {
    var str = "";
    if (filters && !_.isEmpty(filters)) {
        for (var key in filters) {
            if (str != "") {
                str += "&";
            } else {
                str += "?";
            }
            str += key + "=" + filters[key];
        }
    }
    return str;
};

isSingle = function(relation) {
    return relation.type.indexOf('one') > -1;

};

setType = function(obj, relation, val) {
    if (!val){return null};
    var result
    , data = {}
    , obj = getObj(relation.relatedModel);

    if(isSingle(relation)) {
        return _coerceSingle(obj, val);
    } else {
        if(val instanceof Backbone.Collection) {
            val.url = _makeUrl(val, obj, relation);
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
        result.url = _makeUrl(result, obj, relation);
        return result;
    }
};

_handleID = function(i) {
    if(_.isNumber(i)){
        return parseInt(i);
    }
    return i;
};

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
        return new obj(data)
    }
    return null;
};

getParent = function(s) {
    var s = s.split('.');
    if(s.length > 1) {
        return getObj(s.splice(0, s.length - 1).join('.'));
    }
    return window
};

getObj = function(s){
    var o = window;
    $.each(s.split('.'), function(i,x){
        o = o[x];
    });
    return o;
};
