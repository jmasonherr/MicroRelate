MicroRelate.js
==============

An automagic backbone.js plugin that relates Models to each other. Designed for seamless integration to a JSON REST API.  Prevent duplicates, and fetch and find models easier. and Inspired by backbone-relational and jjrelational.

##Example

### Part 1: Create some models

```
User = Backbone.RelationModel.extend({
    nameString: 'User',
    urlRoot: '/api/user/',
});

City = Backbone.RelationModel.extend({
    nameString: 'City',
    idAttribute: 'name',
    urlRoot: '/api/city/',
});

Company = Backbone.RelationModel.extend({
    nameString: 'Company', // Should be the model name
    idAttribute: 'id',
    urlRoot: '/api/company/',
    relations: [
        // One to one
        {
            type: 'one_one',
            key: 'manager',
            relatedModel: 'User',
            reverseKey: 'company',
        },
        // Foreign key
        {
            type: 'has_one',
            key: 'city',
            relatedModel: 'City',
            reverseKey: 'companies',
        },
        // Many to many
        {
            type: 'many_many',
            key: 'employees',
            relatedModel: 'User',
            reverseKey: 'jobs',
        },
    ],
});
```
nameString should be the same as the model name.

The key and reverseKey are how you will traverse the relationships

Relations should be a list of objects with a 'type' (string) , 'key' (string), 'relatedModel' (string), and 'reverseKey' (string)

There are three options for type, 'one_one', 'has_one', and 'many_many'

### Part 2: Register them with the store

The reverse relationships are set up automatically when you register the models.  You should only do this once in the beginning

Collections are also set up automatically.  They are the modelName + 'Col', and know their url based on their models or what relationship they came from.  More on that later.

```
// Register your models just once
> Backbone.store.registerModels(User, City, Library);

```
This is best put at the end of your models file, or right after your models are declared

### Exploring relationships

Let's make fictional companies and relationships


```
// Make a city
> var rancho = new City({name: 'RanchoCucamonga'});


// Make some people
> var adam = new User({id: 1, name: 'Adam'});
> var ders = new User({id: 2, name: 'Ders'});
> var blake = new User({id: 3, name: 'Blake'});
> var alice = new User({id: 4, name: 'Alice'});


// Make a company
> var telemericorp = new Company({id: 1, manager: 4, city: rancho, employees: []});


// Returns a model
> telemericorp.get('manager'); // RelationModel that is Alice.  Even though we only provided an ID, MicroRelate figures out which model should be there and populates it.

> rancho.get('companies') // returns a CompanyCol collection containing Telemericorp

// The same model as alice
> telemericorp.get('manager') == alice;
true

// The reverse is automagically set up
> alice.get('company') == telemericorp // returns RelationModel 'telemericorp'
true
```

### Models are stored centrally

```
// Look at the entire User collection in memory
> User.all() // returns UserCol with all User models present
> User.all().get(2) // returns ders RelatedModel

// Same as .find
> User.find(2) // returns ders RelatedModel
```


### Duplicates are watched for

You can instantiate a relationship with an ID, object or list, and it will be converted to the correct model.  If the model already exists, that one will be used

```
// No matter how many times you try to make Alice, there's only one
> var newalice = new User({id: 4});
> newalice == alice
true

// Set with an integer like an API might
> telemericorp.set('manager', 4);
> telemericorp.get('manager') == alice;
true

// Set with an object
> telemericorp.set('manager', {id: 4});
> telemericorp.get('manager') == alice;
true


// What about the employees?
> telemericorp.get('employees') // returns Empty UserCol .  Collections are automagically made with the name of the nameString


// You can set with a list of IDs
> telemericorp.set('employees', [2,3]);
> telemericorp.toJSON()
[{id: 2, name: 'Ders'}, {id: 3, name: 'Blake'}]

// Or a list of objects
> telemericorp.set('employees', [{id: 2}, {id: 3}]);
> telemericorp.toJSON()
[{id: 2, name: 'Ders'}, {id: 3, name: 'Blake'}]

// Why not just a list of the RelatedModels themselves
> telemericorp.set('employees', [ders, blake]);
> telemericorp.toJSON()
[{id: 2, name: 'Ders'}, {id: 3, name: 'Blake'}]


// Add employees
> telemericorp.get('employees').add(adam);

// They're all in the collection
> telemericorp.get('employees').length;
3

// And you can see the reverse
> adam.get('jobs') // returns CompanyCol collection with only telemericorp
```


### Serialization uses IDs

toJSON will return the IDs of the related models.

```
// Serialization returns the IDs of the models
> telemericorp.toJSON() 
{id: 1, manager: 4, city: 'RanchoCucamonga', employees: [1, 2, 3]}
```


### URLs automatically nested


```
// Nested urls are set up automatically
> ders.get('jobs').url
'/api/user/2/jobs/'

// API endpoints are cached
> ders.fetchRelated('jobs'); // return XHR request
> ders.fetchRelated('jobs'); // cached, returns empty list
[]
```

##Philosophy

MicroRelate is meant to be easy to use and easy to read code that is robust to errors.  Let me know what the Docs are missing.  More comments coming soon.