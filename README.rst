==========
successcrm
==========

Install
=======

1. Clone the repo::

      git clone git://github.com/insin/successcrm.git

2. Install dependencies::

      npm install

3. Ensure ``redis-server`` is running, configuring settings in ``/settings.js``
   if necessary.

4. Create an initial user::

      node bin/successcrm.js createuser

   Follow the prompts; a password will be generated a printed to the console.

5. Start serving::

      node app.js
