# How to View Database Files

This guide shows you multiple ways to view and interact with your SQLite database.

## 📁 Database File Location

**Development:**
```
release/app/sql/myCoolDatabase.sqlite3
```

**Production:**
```
~/Library/Application Support/Electron/myCoolDatabase.sqlite3 (macOS)
%APPDATA%/Electron/myCoolDatabase.sqlite3 (Windows)
~/.config/Electron/myCoolDatabase.sqlite3 (Linux)
```

---

## Method 1: SQLite Command Line (Recommended)

### Install SQLite (if not already installed)

**macOS:**
```bash
# Usually pre-installed, if not:
brew install sqlite3
```

**Windows:**
Download from: https://www.sqlite.org/download.html

**Linux:**
```bash
sudo apt-get install sqlite3
```

### Basic Commands

**Open database:**
```bash
cd electron-react-boilerplate-sqlite3
sqlite3 release/app/sql/myCoolDatabase.sqlite3
```

**Inside SQLite shell:**
```sql
-- List all tables
.tables

-- View table structure
.schema users

-- View all users
SELECT * FROM users;

-- View users (without password hash)
SELECT id, name, email, created_at FROM users;

-- Count users
SELECT COUNT(*) FROM users;

-- Exit
.quit
```

### One-liner Commands (Run from terminal)

```bash
# View all users
sqlite3 release/app/sql/myCoolDatabase.sqlite3 "SELECT id, name, email, created_at FROM users;"

# Count users
sqlite3 release/app/sql/myCoolDatabase.sqlite3 "SELECT COUNT(*) as total FROM users;"

# List all tables
sqlite3 release/app/sql/myCoolDatabase.sqlite3 ".tables"

# View table structure
sqlite3 release/app/sql/myCoolDatabase.sqlite3 "PRAGMA table_info(users);"

# Export to CSV
sqlite3 release/app/sql/myCoolDatabase.sqlite3 ".mode csv" ".output users.csv" "SELECT * FROM users;" ".quit"
```

---

## Method 2: Using the App's SQL Demo Page

1. **Start the app:**
   ```bash
   npm start
   ```

2. **Navigate to SQL Demo page** in the app

3. **Run these useful queries:**

   **View all users:**
   ```sql
   SELECT id, name, email, created_at FROM users;
   ```

   **Count users:**
   ```sql
   SELECT COUNT(*) as total_users FROM users;
   ```

   **List all tables:**
   ```sql
   SELECT name FROM sqlite_master WHERE type='table';
   ```

   **View table structure:**
   ```sql
   PRAGMA table_info(users);
   ```

   **Search users by email:**
   ```sql
   SELECT * FROM users WHERE email LIKE '%gmail%';
   ```

---

## Method 3: GUI Database Viewers

### DB Browser for SQLite (Free, Cross-platform)
1. Download: https://sqlitebrowser.org/
2. Open: File → Open Database → Select `myCoolDatabase.sqlite3`
3. Browse tables, view data, run queries

### TablePlus (macOS, Windows, Linux)
1. Download: https://tableplus.com/
2. Add SQLite connection → Select database file
3. Beautiful UI for viewing and editing

### VS Code Extension
1. Install "SQLite Viewer" extension in VS Code
2. Right-click database file → "Open Database"
3. View tables and run queries in VS Code

---

## Method 4: Programmatic Access (Node.js)

Create a simple script to view data:

```javascript
// view-db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'release/app/sql/myCoolDatabase.sqlite3');
const db = new sqlite3.Database(dbPath);

db.all('SELECT id, name, email, created_at FROM users', (err, rows) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log('Users in database:');
  console.table(rows);
  db.close();
});
```

Run: `node view-db.js`

---

## 🔍 Useful Queries

### View All Users
```sql
SELECT id, name, email, created_at FROM users;
```

### View Recent Users
```sql
SELECT * FROM users ORDER BY created_at DESC LIMIT 10;
```

### Search by Name
```sql
SELECT * FROM users WHERE name LIKE '%Naeem%';
```

### Search by Email
```sql
SELECT * FROM users WHERE email = 'test@gmail.com';
```

### Database Statistics
```sql
SELECT 
  COUNT(*) as total_users,
  COUNT(DISTINCT email) as unique_emails
FROM users;
```

---

## 📊 Quick Reference

| Task | Command |
|------|---------|
| View all users | `SELECT id, name, email, created_at FROM users;` |
| Count users | `SELECT COUNT(*) FROM users;` |
| List tables | `.tables` or `SELECT name FROM sqlite_master WHERE type='table';` |
| Table structure | `PRAGMA table_info(users);` |
| Export to CSV | `.mode csv` `.output file.csv` `SELECT * FROM users;` |
| View database file | `ls -lh release/app/sql/myCoolDatabase.sqlite3` |

---

## ⚠️ Important Notes

1. **Don't edit the database file directly** while the app is running
2. **Password hashes** are stored securely - you won't see plain passwords
3. **Backup before modifying:** Always backup before making changes
4. **Production location** differs from development - check `app.getPath('userData')`

---

## 🐛 Troubleshooting

**Database locked?**
- Close the app first, then open the database file

**File not found?**
- Make sure the app has run at least once to create the database
- Check if you're in development mode (database in `release/app/sql/`)
- Check production path: `app.getPath('userData')`

**Permission denied?**
- Check file permissions: `chmod 644 release/app/sql/myCoolDatabase.sqlite3`
