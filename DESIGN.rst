=========
Redis CRM
=========

Braining about Redis for a simple CRM.

There will be no admin-style CRUD views, just the frontend.

Users
=====

Redis Keys
----------

**strings**

users:nextid
   incr to generate user ids
username.to.id:#<username>
   maps lowercase usernames to ids

**hashes**

users:#<id>
   user details

**sets**

users
   user ids

Contacts
========

A contact is a person or an organisation.

A person can be associated with a single organisation.

Common fields:
   id
   type
   backgroundInfo
   phoneNumbers (array of {number, type})
   emailAddresses (array of {email, type})
   addresses (array of {address, city, county, postal, country, type})

Person fields:
   title
   firstName
   lastName
   jobTitle
   organisation

Organisation fields:
   name

Redis Keys
----------

**strings**

contacts:nextid
   incr to generate contact ids

**hashes**

contacts:#<id>
   contact details

**sets**

org.to.people:#<contactid>
   ids of people associated with a given organisation

Categories
==========

Tasks can be assigned a single category.

Redis Keys
----------

**strings**

categories:nextid
   incr to generate category ids

categories:#<id>
   category name

categoryname.to.id:#<categoryname>
   maps lowercase category names to ids

**sets**

categories
   category ids

Tasks
=====

Tasks are assigned to a user with a due date and *may* be linked to a contact.

Screens
-------

**Dashboard**

Tasks for current user betweet given dates (-inf, +7), low-high

* Categories (assigned by display logic, not query):

  * Overdue
  * Next 7 days

**Calendar**

Calendar display of incomplete tasks for the date range being displayed, low-high.

* Filters:

  * User
  * Category

**Tasks List**

This is the only place completed tasks can be viewed, as completed tasks are
viewed elsewhere as updates.

* Filters:

  * Completion
  * User
  * Category

**Contact**

* Incomplete tasks, low-high.

Redis Keys
----------

**strings**

tasks:nextid
   incr to generate task ids

**hashes**

tasks:#<id>
   task details

**sorted sets**

For vewing and filtering incomplete tasks throughout the app:

tasks:cron
   incomplete task ids, by due timestamp
tasks:user:#<userid>
   incomplete task ids assigned to a user, by due timestamp
tasks:user:#<userid>:category:#<categoryid>
   incomplete task ids assigned to a user by category, by due timestamp
tasks:contact:#<contact>
   incomplete tasks linked to a contact, by due timestamp

The following are purely to support viewing completed tasks on the tasks list:

tasks:completed
   completed task ids, by completion timestamp
tasks:user:#<userid>:completed
   completed task ids assigned to a user, by completion timestamp
tasks:user:#<userid>:category:#<categoryid>:completed
   completed task ids assigned to a user by category, by completion timestamp

Updates
=======

Updates record notes and task completion for a contact.

Screens
-------

**Dashboard**

Updates, high-low

* Filters

  * Type (notes or tasks)
  * User

**Contact**

Updates, high-low

* Filters:

  * Type (notes or tasks)

Redis Keys
----------

**strings**

updates:nextid
   incr to generate update ids

**hashes**

updates:#<id>
   update details

**sorted sets**

updates:cron
   update ids, by created timestamp
updates:<type>
   update ids by type, by created timestamp
updates:user:#<userid>
   updates by a user, by created timestamp
updates:user:#<userid>:<type>
   updates by a user by type, by created timestamp
updates:contact:#<contactid>
   updates for a contact, by created timestamp
updates:contact:#<contactid>:<type>
   updates for a contact by type, by created timestamp
