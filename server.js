require('dotenv').config();
const express = require('express');
const db = require('./recipes-database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

// 🌐 CORS - Allow frontend to connect!
app.use((req, res, next) => {
    // Line 1: "I allow requests from ANY origin"
    res.header('Access-Control-Allow-Origin', '*'); // In production instead of '*' write the site's address: e.g. 'https://myrecipeapp.com'
    // Line 2: "I allow these HTTP methods"
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    // Line 3: "I allow these headers in requests"
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Line 4-6: Handle "preflight" checks (browser's security check)
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    // Line 7: Continue to next middleware/route
    next();
});

const JWT_SECRET = process.env.JWT_SECRET;
console.log('JWT_SECRET:', JWT_SECRET ? 'Loaded ✅' : 'NOT LOADED ❌');

function authenticateToken(req, res, next) {
    // Get token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({
            error: "Access denied. No token provided."
        });
    }

    try {
        // Verify token and extract user info
        const decoded = jwt.verify(token, JWT_SECRET);
        // Attach user info to request object
        req.user = decoded;
        // Continue to the next middleware/route
        next();
    } catch (error) {
        return res.status(403).json({
            error: "Invalid or expired token"
        });
    }
}

const count = db.prepare('SELECT COUNT(*) as count FROM recipes').get();
if (count.count === 0) {
    const insert = db.prepare(`
        INSERT INTO recipes (title, ingredients, instructions, prep_time, 
            cook_time, servings, difficulty, favorite, created_at, user_id, category_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
    `);

    insert.run('Rice', 'water, rice, oil, salt', 'add ingredients, cook', 
        4, 20, 4, 'easy', 1, new Date().toISOString(), 1, 3);
    insert.run('Beans', 'water, beans, oil, salt, seasoning', 'add ingredients, cook', 
        7, 30, 6, 'medium', 0, new Date().toISOString(), 2, 3);
    insert.run('Pork Chops', 'Pork Chop, seasoning, oil', 'add ingredients, cook', 
        2, 10, 2, 'hard', 0, new Date().toISOString(), 1, 3);

    console.log('🍚 New recipe added!');
}

app.get('/api/recipes', (req, res) => {
    const filter = req.query.filter;

    let query = `
        SELECT recipes.*, users.username AS author,
            categories.name AS category_name
        FROM recipes 
        JOIN users ON recipes.user_id = users.id
        JOIN categories ON recipes.category_id = categories.id
    `;
    
    if (filter === 'easy') {
        query += " WHERE difficulty = 'easy'";
    } else if (filter === 'medium') {
        query += " WHERE difficulty = 'medium'";
    } else if (filter === 'hard') {
        query += " WHERE difficulty = 'hard'";
    } else if (filter === 'favorite') {
        query += " WHERE favorite = 1";
    } else if (filter === 'notFavorite') {
        query += " WHERE favorite = 0";
    }
    
    const recipes = db.prepare(query).all();

    res.json({
        count: recipes.length,
        recipes: recipes
    });
});

app.get('/api/recipes/search', (req, res) => {
    const query = req.query.q;

    if (!query) {
        return res.status(400).json({
            error: "Search query required",
            example: "/api/recipes/search?q=rice"
        });
    }

    const searchPattern = `%${query}%`;
    const results = db.prepare(`
        SELECT recipes.*, users.username as author,
            categories.name AS category_name
        FROM recipes
        JOIN users ON recipes.user_id = users.id
        JOIN categories ON recipes.category_id = categories.id 
        WHERE title LIKE ? OR ingredients LIKE ? 
            OR users.username LIKE ? OR categories.name LIKE ?
    `).all(searchPattern, searchPattern, searchPattern, searchPattern);

    res.json({
        query: query,
        count: results.length,
        results: results
    });
});

app.get('/api/recipes/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const recipe = db.prepare(`       
        SELECT recipes.*, users.username AS author,
            categories.name AS category_name
        FROM recipes 
        JOIN users ON recipes.user_id = users.id
        JOIN categories ON recipes.category_id = categories.id 
        WHERE recipes.id = ?`).get(id);

    if (!recipe) {
        return res.status(404).json({
            error: "Recipe not found",
            id: id
        });
    }

    res.json(recipe);
});

app.post('/api/recipes', authenticateToken, (req, res) => {
    const { title, ingredients, instructions, prep_time, cook_time, 
        servings, difficulty, favorite, category_id } = req.body; // remove 'user_id' when using tokens

    if (!title || !ingredients || !instructions || !prep_time || !cook_time ||
        !servings || !difficulty || favorite === undefined || !category_id) {
        return res.status(400).json({
            error: "Missing required fields",
            required: ["title", "ingredients", "instructions", "prep_time", 
                "cook_time", "servings", "difficulty", "favorite", "category_id"] // remove 'user_id' when using tokens
        });
    }

    // You don't need it anymore because the middleware already verified the user exists (they're logged in!)
    // const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
    // if (!user) {
    //     return res.status(400).json({
    //         error: "User not found",
    //         hint: "Available users: 1 (john_chef), 2 (maria_cook), 3 (alex_baker)"
    //     });
    // }

    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(category_id);
    if (!category) {
        return res.status(400).json({
            error: "Category not found",
            hint: "Available categories: 1 (Breakfast), 2 (Lunch), 3 (Dinner), 4 (Dessert), 5 (Snacks)"
        });
    }

    const insert = db.prepare(`
        INSERT INTO recipes (title, ingredients, instructions, prep_time, 
        cook_time, servings, difficulty, favorite, user_id, category_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
    `);

    const result = insert.run(title, ingredients, instructions, prep_time, cook_time, 
        servings, difficulty, favorite ? 1 : 0, req.user.userId, category_id, new Date().toISOString());

    const newRecipe = db.prepare(`
        SELECT recipes.*, users.username as author,
            categories.name AS category_name
        FROM recipes 
        JOIN users ON recipes.user_id = users.id 
        JOIN categories ON recipes.category_id = categories.id 
        WHERE recipes.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({
        message: "Recipe created successfully",
        recipe: newRecipe
    });
});

app.post('/api/auth/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                error: "Missing required fields",
                required: ["username", "email", "password"]
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                error: "Password must be at least 6 characters"
            });
        }

        const existingUsername = db.prepare(`
            SELECT id FROM users WHERE username = ?`).get(username);
        if (existingUsername) {
            return res.status(400).json({
                error: "Username already taken"
            });
        }

        const existingEmail = db.prepare(`
            SELECT id FROM users WHERE email = ?`).get(email);
        if (existingEmail) {
            return res.status(400).json({
                error: "Email already registered"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const insert = db.prepare(`
            INSERT INTO users (username, email, password, created_at)
            VALUES (?, ?, ?, ?)
        `);

        const result = insert.run(username, email, hashedPassword, 
            new Date().toISOString());

        const newUser = db.prepare(`
            SELECT id, username, email, created_at
            FROM users 
            WHERE id = ?
        `).get(result.lastInsertRowid);

        const token = jwt.sign(
            // PAYLOAD - data to store in token
            {
                userId: newUser.id,
                usename: newUser.username
            },
            // SECRET - your secret key from .env
            JWT_SECRET,
            // OPTIONS - when should token expire
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: "User created successfully",
            recipe: newUser,
            token: token
        });
    } catch (error) {
        console.log('Signup error:', error);
        res.status(500).json({ error: "Server error during signup" });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: "Missing required fields",
                required: ["email", "password"]
            });
        }

        const user = db.prepare(`
            SELECT * FROM users WHERE email = ?`).get(email);

        if (!user) {
            return res.status(401).json({
                error: "Invalid email or password"
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                error: "Invalid email or password"
            });
        }

        const token = jwt.sign(
            {
                userId: user.id,
                usernamne: user.username
            },
            JWT_SECRET,
            {expiresIn: '7d'}
        );

        res.json({
            message: "Login successful",
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                created_at: user.created_at
            },
            token: token
        })

    } catch(error) {
        console.error('Login error:', error);
        res.status(500).json({ error: "Server error during login" });
    }
});

app.put('/api/recipes/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const { title, ingredients, instructions, prep_time, 
        cook_time, servings, difficulty, favorite, category_id } = req.body;

    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);

    if (!recipe) {
        return res.status(404).json({
            error: "Recipe not found",
            id: id
        });
    }

    if (recipe.user_id !== req.user.userId) {
        return res.status(403).json({
            error: "Forbidden: You can only update your own recipes",
            recipe_owner: recipe.user_id,
            your_user_id: req.user.userId
        });
    }

    const update = db.prepare(`
        UPDATE recipes
        SET title = ?, ingredients = ?, instructions = ?, prep_time = ?, 
            cook_time = ?, servings = ?, difficulty = ?, favorite = ?, category_id = ?
        WHERE ID = ?    
    `);

    update.run(
        title !== undefined ? title : recipe.title,
        ingredients !== undefined ? ingredients : recipe.ingredients, 
        instructions !== undefined ? instructions : recipe.instructions, 
        prep_time !== undefined ? prep_time : recipe.prep_time, 
        cook_time !== undefined ? cook_time : recipe.cook_time, 
        servings !== undefined ? servings : recipe.servings, 
        difficulty !== undefined ? difficulty : recipe.difficulty, 
        favorite !== undefined ? (favorite ? 1 : 0) : recipe.favorite,
        category_id !== undefined ? category_id : recipe.category_id,
        id
    );

    const updatedRecipe = db.prepare(`
        SELECT recipes.*, users.username as author,
            categories.name AS category_name
        FROM recipes 
        JOIN users ON recipes.user_id = users.id
        JOIN categories ON recipes.category_id = categories.id
        WHERE recipes.id = ?
    `).get(id);

    res.json({
        message: "Recipe updated successfully",
        recipe: updatedRecipe
    });
});

app.patch('/api/recipes/:id/toggle', (req, res) => {
    const id = parseInt(req.params.id);
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);

    if (!recipe) {
        return res.status(404).json({
            error: "Recipe not found"
        });
    }

    const newFavoriteStatus = recipe.favorite === 1 ? 0 : 1;

    db.prepare
        ('UPDATE recipes SET favorite = ? WHERE id = ?').run(newFavoriteStatus, id);

    const updateRecipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
    
    res.json({
        message: "Recipe toggled",
        recipe: updateRecipe
    });
});

app.delete('/api/recipes/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);

    if (!recipe) {
        return res.status(404).json({
            error: "Recipe not found",
            id: id
        });
    }

    // Check ownership
    if (recipe.user_id !== req.user.userId) {
        return  res.status(403).json({
            error: "Forbidden: You can only delete your own recipes",
            recipe_owner: recipe.user_id,
            your_user_id: req.user.userId
        });
    }

    db.prepare('DELETE FROM recipes WHERE id = ?').run(id);

    res.json({
        message: "Recipe deleted successfully",
        recipe: recipe
    });
});

app.get('/api/stats', (req, res) => {
    const total = db.prepare('SELECT COUNT(*) as count FROM recipes').get().count;
    const favorite = db.prepare
        ('SELECT COUNT(*) as count FROM recipes WHERE favorite = 1').get().count;
    const notFavorite = total - favorite;

    res.json({
        total: total,
        favorite: favorite,
        notFavorite: notFavorite,
        completionRate: total > 0 ? Math.round((favorite / total) * 100) : 0
    });
});

app.listen(3000, () => {
    console.log('📚 Recipes API with Database running at http://localhost:3000/');
    console.log('\nEndpoints:');
    console.log('  GET    /api/recipes              - Get all recipes');
    console.log('  GET    /api/recipes?filter=...   - Filter recipes');
    console.log('  GET    /api/recipes/search?q=... - Search recipes');
    console.log('  GET    /api/recipes/:id          - Get one recipes');
    console.log('  POST   /api/recipes              - Create recipes');
    console.log('  PUT    /api/recipes/:id          - Update recipes');
    console.log('  PATCH  /api/recipes/:id/toggle   - Toggle completed status');
    console.log('  DELETE /api/recipes/:id          - Delete recipes');
    console.log('  GET    /api/stats                - Get statistics');
});