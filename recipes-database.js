const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const db = new Database('recipes.db');
db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TEXT NOT NULL
    )    
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL
    )    
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        ingredients TEXT NOT NULL,
        instructions TEXT NOT NULL,
        prep_time INTEGER NOT NULL,
        cook_time INTEGER NOT NULL,
        servings INTEGER NOT NULL,
        difficulty TEXT NOT NULL,
        favorite INTEGER DEFAULT 0,
        user_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
    )    
`);

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (userCount.count === 0) {
    const insertUser = db.prepare(`
        INSERT INTO users (username, email, password, created_at)
        VALUES (?, ?, ?, ?)
    `);

    const hash1 = bcrypt.hashSync('password123', 10);
    const hash2 = bcrypt.hashSync('password123', 10);
    const hash3 = bcrypt.hashSync('password123', 10);

    insertUser.run('john_chef', 'john@recipes.com', hash1, new Date().toISOString());
    insertUser.run('maria_cook', 'maria@recipes.com', hash2, new Date().toISOString());
    insertUser.run('alex_baker', 'alex@recipes.com', hash3, new Date().toISOString());

    console.log('✅ Sample users created with hashed passwords!');
    console.log('   All users have password: password123');
}

const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
if (categoryCount.count === 0) {
    const insertCategory = db.prepare(`
        INSERT INTO categories (name, description, created_at)
        VALUES (?, ?, ?)    
    `);

    insertCategory.run('Breakfast', 'Morning meals to start your day', new Date().toISOString());
    insertCategory.run('Lunch', 'Midday meals', new Date().toISOString());
    insertCategory.run('Dinner', 'Evening meals', new Date().toISOString());
    insertCategory.run('Dessert', 'Sweet treats and desserts', new Date().toISOString());
    insertCategory.run('Snacks', 'Quick bites and snacks', new Date().toISOString());

    console.log('✅ Sample categories created!');
}

console.log('📚 Database initialized with users, categories and recipes!');
module.exports = db;
