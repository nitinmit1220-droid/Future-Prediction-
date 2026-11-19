
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const fs = require("fs");

// ============================================
// 1. DATABASE DIRECTORY
// ============================================

// Use Render persistent disk if DATA_DIR exists.
// Otherwise, use the local database folder.

const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : __dirname;

// Create database directory if missing.
fs.mkdirSync(dataDir, { recursive: true });


// ============================================
// 2. CONNECT DATABASE
// ============================================

async function connectDB() {

    const db = await open({

        filename: path.join(dataDir, "students.sqlite"),

        driver: sqlite3.Database

    });

    console.log("Database connected successfully!");


// ============================================
// 3. CREATE STUDENTS TABLE
// ============================================

    await db.exec(`

        CREATE TABLE IF NOT EXISTS students (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            name TEXT NOT NULL,

            roll_number TEXT NOT NULL UNIQUE,

            attendance REAL NOT NULL,

            previous_marks REAL NOT NULL,

            study_hours REAL NOT NULL,

            assignment_score REAL NOT NULL,

            internal_marks REAL NOT NULL,

            predicted_score REAL,

            performance TEXT,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP

        )

    `);

    console.log("Students table created successfully!");


// ============================================
// 4. CREATE ADMINS TABLE
// ============================================

    await db.exec(`

        CREATE TABLE IF NOT EXISTS admins (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            name TEXT NOT NULL,

            email TEXT NOT NULL UNIQUE,

            password TEXT NOT NULL,

            status TEXT NOT NULL DEFAULT 'approved',

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP

        )

    `);

    console.log("Admins table created successfully!");


// ============================================
// 5. UPDATE OLD ADMINS TABLE
// ============================================

// Check whether the status column exists.

    const columns = await db.all(
        "PRAGMA table_info(admins)"
    );

    const hasStatus = columns.some(
        column => column.name === "status"
    );

// Add status column if using an older database.

    if (!hasStatus) {

        await db.exec(`

            ALTER TABLE admins

            ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'

        `);

        console.log("Admin status column added!");

    }


// ============================================
// 6. RETURN DATABASE
// ============================================

    return db;

}


// ============================================
// 7. EXPORT DATABASE FUNCTION
// ============================================

module.exports = connectDB;
