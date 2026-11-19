const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");

async function connectDB() {

    const db = await open({
        filename: path.join(__dirname, "students.sqlite"),
        driver: sqlite3.Database
    });

    console.log("Database connected successfully!");

    // Create students table
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

    // Create admin table
    // The CHECK constraint allows only one admin account.
    await db.exec(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log("Admins table created successfully!");

    return db;
}

module.exports = connectDB;