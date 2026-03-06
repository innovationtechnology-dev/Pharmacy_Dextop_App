const sqlite3 = require('./release/app/node_modules/sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'release', 'app', 'sql', 'myCoolDatabase.sqlite3');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run('ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT "admin"', (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('Column "role" already exists.');
      } else {
        console.error('Error adding role column:', err.message);
      }
    } else {
      console.log('Successfully added "role" column to users table.');
    }
  });
});

db.close();
