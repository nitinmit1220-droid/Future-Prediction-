
// ============================================
// 1. IMPORT PACKAGES
// ============================================

require("dotenv").config();

const express = require("express");
const path = require("path");
const OpenAI = require("openai");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);

const connectDB = require("./database/db");

const app = express();


// ============================================
// 2. MIDDLEWARE
// ============================================

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));


// ============================================
// 3. OPENAI CONNECTION
// ============================================

const ai = process.env.OPENAI_API_KEY
    ? new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    })
    : null;


// ============================================
// 4. DATABASE VARIABLE
// ============================================

let db;


// ============================================
// 5. SESSION CONFIGURATION
// ============================================

if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is missing from .env");
}

app.use(session({

    store: new SQLiteStore({
        db: "sessions.sqlite",
        dir: path.join(__dirname, "database")
    }),

    secret: process.env.SESSION_SECRET,

    resave: false,

    saveUninitialized: false,

    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 8
    }
}));


// ============================================
// 6. CREATE AND UPDATE ADMIN TABLE
// ============================================

async function setupAdminTable() {

    // Create table if it does not exist.
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

    // Check existing table columns.
    const columns = await db.all(
        "PRAGMA table_info(admins)"
    );

    const hasStatus = columns.some(
        column => column.name === "status"
    );

    // Add status column to an older table.
    // Existing admins will be approved.
    if (!hasStatus) {

        await db.exec(`
            ALTER TABLE admins
            ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'
        `);
    }

    console.log("Admin table is ready!");
}


// ============================================
// 7. ADMIN AUTHENTICATION MIDDLEWARE
// ============================================

async function requireAdmin(req, res, next) {

    try {

        if (!req.session.adminId) {
            return res.status(401).json({
                error: "Please login as admin first."
            });
        }

        // Verify that this admin still exists and is approved.
        const admin = await db.get(
            `SELECT id, status
             FROM admins
             WHERE id = ?`,
            [req.session.adminId]
        );

        if (!admin || admin.status !== "approved") {

            req.session.destroy(() => {});

            return res.status(403).json({
                error: "Your admin account is not approved."
            });
        }

        next();

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Unable to verify admin account."
        });
    }
}


// ============================================
// 8. CHECK AUTHENTICATION STATUS
// ============================================

app.get("/api/auth/status", async (req, res) => {

    try {

        const admin = await db.get(
            "SELECT id FROM admins LIMIT 1"
        );

        res.json({

            authenticated: Boolean(req.session.adminId),

            hasAdmin: Boolean(admin)

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Unable to check authentication status."
        });
    }
});


// ============================================
// 9. ADMIN REGISTRATION
// ============================================

app.post("/api/auth/register", async (req, res) => {

    try {

        const name = String(req.body.name || "").trim();

        const email = String(req.body.email || "")
            .trim()
            .toLowerCase();

        const password = String(req.body.password || "");

        // Check empty fields.
        if (!name || !email || !password) {

            return res.status(400).json({
                error: "All fields are required."
            });
        }

        // Validate email.
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {

            return res.status(400).json({
                error: "Enter a valid email address."
            });
        }

        // Validate password.
        if (password.length < 8) {

            return res.status(400).json({
                error: "Password must contain at least 8 characters."
            });
        }

        // Check whether email already exists.
        const existingAdmin = await db.get(
            "SELECT id FROM admins WHERE email = ?",
            [email]
        );

        if (existingAdmin) {

            return res.status(409).json({
                error: "This email is already registered. Please login."
            });
        }

        // Count existing admins.
        const adminCount = await db.get(
            "SELECT COUNT(*) AS total FROM admins"
        );

        // First admin gets automatic approval.
        // Other admins need approval.
        const isFirstAdmin = adminCount.total === 0;

        const status = isFirstAdmin
            ? "approved"
            : "pending";

        // Hash password.
        const hashedPassword = await bcrypt.hash(
            password,
            12
        );

        // Save new admin.
        const result = await db.run(
            `INSERT INTO admins
            (name, email, password, status)
            VALUES (?, ?, ?, ?)`,
            [
                name,
                email,
                hashedPassword,
                status
            ]
        );

        // Additional admins must wait for approval.
        if (status === "pending") {

            return res.status(201).json({

                message: "Registration successful! Wait for admin approval.",

                admin: {
                    id: result.lastID,
                    name,
                    email,
                    status
                }

            });
        }

        // Automatically login the first admin.
        req.session.regenerate((error) => {

            if (error) {

                console.error(error);

                return res.status(500).json({
                    error: "Registration succeeded, but login failed. Please login."
                });
            }

            req.session.adminId = result.lastID;

            req.session.save((saveError) => {

                if (saveError) {

                    console.error(saveError);

                    return res.status(500).json({
                        error: "Unable to create login session. Please login."
                    });
                }

                res.status(201).json({

                    message: "First admin registered successfully!",

                    admin: {
                        id: result.lastID,
                        name,
                        email,
                        status
                    }

                });
            });
        });

    } catch (error) {

        console.error(error);

        if (error.code === "SQLITE_CONSTRAINT") {

            return res.status(409).json({
                error: "This email is already registered."
            });
        }

        res.status(500).json({
            error: "Unable to register admin."
        });
    }
});


// ============================================
// 10. ADMIN LOGIN
// ============================================

app.post("/api/auth/login", async (req, res) => {

    try {

        const email = String(req.body.email || "")
            .trim()
            .toLowerCase();

        const password = String(req.body.password || "");

        if (!email || !password) {

            return res.status(400).json({
                error: "Email and password are required."
            });
        }

        // Find admin.
        const admin = await db.get(
            "SELECT * FROM admins WHERE email = ?",
            [email]
        );

        if (!admin) {

            return res.status(401).json({
                error: "Invalid email or password."
            });
        }

        // Check password.
        const passwordMatch = await bcrypt.compare(
            password,
            admin.password
        );

        if (!passwordMatch) {

            return res.status(401).json({
                error: "Invalid email or password."
            });
        }

        // Check approval status.
        if (admin.status === "pending") {

            return res.status(403).json({
                error: "Your account is waiting for admin approval."
            });
        }

        if (admin.status === "rejected") {

            return res.status(403).json({
                error: "Your admin registration was rejected."
            });
        }

        // Create a fresh session.
        req.session.regenerate((error) => {

            if (error) {

                console.error(error);

                return res.status(500).json({
                    error: "Unable to login."
                });
            }

            req.session.adminId = admin.id;

            req.session.save((saveError) => {

                if (saveError) {

                    console.error(saveError);

                    return res.status(500).json({
                        error: "Unable to save login session."
                    });
                }

                res.json({

                    message: "Login successful!",

                    admin: {
                        id: admin.id,
                        name: admin.name,
                        email: admin.email,
                        status: admin.status
                    }

                });
            });
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Unable to login."
        });
    }
});


// ============================================
// 11. GET CURRENT ADMIN
// ============================================

app.get("/api/auth/me", requireAdmin, async (req, res) => {

    try {

        const admin = await db.get(
            `SELECT id, name, email, status
             FROM admins
             WHERE id = ?`,
            [req.session.adminId]
        );

        if (!admin) {

            return res.status(401).json({
                error: "Admin account not found."
            });
        }

        res.json({ admin });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Unable to get admin information."
        });
    }
});


// ============================================
// 12. GET PENDING ADMIN REQUESTS
// ============================================

app.get("/api/admin/requests", requireAdmin, async (req, res) => {

    try {

        const requests = await db.all(
            `SELECT id, name, email
             FROM admins
             WHERE status = 'pending'
             ORDER BY id ASC`
        );

        res.json(requests);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Unable to get admin requests."
        });
    }
});


// ============================================
// 13. APPROVE OR REJECT ADMIN REQUEST
// ============================================

app.patch("/api/admin/requests/:id", requireAdmin, async (req, res) => {

    try {

        const id = Number(req.params.id);

        const status = req.body.status;

        if (!Number.isInteger(id) || id <= 0) {

            return res.status(400).json({
                error: "Invalid admin ID."
            });
        }

        if (!["approved", "rejected"].includes(status)) {

            return res.status(400).json({
                error: "Status must be approved or rejected."
            });
        }

        // Prevent changing your own account.
        if (id === req.session.adminId) {

            return res.status(400).json({
                error: "You cannot change your own account status."
            });
        }

        const result = await db.run(
            `UPDATE admins
             SET status = ?
             WHERE id = ? AND status = 'pending'`,
            [status, id]
        );

        if (result.changes === 0) {

            return res.status(404).json({
                error: "Pending admin request not found."
            });
        }

        res.json({

            message: `Admin request ${status} successfully!`

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Unable to update admin request."
        });
    }
});


// ============================================
// 14. ADMIN LOGOUT
// ============================================

app.post("/api/auth/logout", (req, res) => {

    req.session.destroy((error) => {

        if (error) {

            console.error(error);

            return res.status(500).json({
                error: "Unable to logout."
            });
        }

        res.clearCookie("connect.sid");

        res.json({
            message: "Logged out successfully!"
        });
    });
});


// ============================================
// 15. VALIDATE STUDENT DETAILS
// ============================================

function validateStudent(data) {

    const name = String(data.name || "").trim();

    const roll_number = String(data.roll_number || "").trim();

    const attendance = Number(data.attendance);

    const previous_marks = Number(data.previous_marks);

    const study_hours = Number(data.study_hours);

    const assignment_score = Number(data.assignment_score);

    const internal_marks = Number(data.internal_marks);

    if (!name || !roll_number) {

        return {
            error: "Name and roll number are required."
        };
    }

    if (
        !Number.isFinite(attendance) ||
        !Number.isFinite(previous_marks) ||
        !Number.isFinite(study_hours) ||
        !Number.isFinite(assignment_score) ||
        !Number.isFinite(internal_marks)
    ) {

        return {
            error: "Please enter valid numbers."
        };
    }

    if (
        attendance < 0 || attendance > 100 ||
        previous_marks < 0 || previous_marks > 100 ||
        study_hours < 0 || study_hours > 24 ||
        assignment_score < 0 || assignment_score > 100 ||
        internal_marks < 0 || internal_marks > 100
    ) {

        return {
            error: "Marks and attendance must be 0-100. Study hours must be 0-24."
        };
    }

    return {

        student: {
            name,
            roll_number,
            attendance,
            previous_marks,
            study_hours,
            assignment_score,
            internal_marks
        }

    };
}


// ============================================
// 16. PREDICT STUDENT PERFORMANCE
// ============================================

function predictPerformance(student) {

    const studyScore = Math.min(
        student.study_hours / 8,
        1
    ) * 100;

    const score =
        student.attendance * 0.20 +
        student.previous_marks * 0.25 +
        studyScore * 0.15 +
        student.assignment_score * 0.15 +
        student.internal_marks * 0.25;

    const predicted_score = Number(score.toFixed(2));

    let performance;

    if (predicted_score >= 75) {

        performance = "Good";

    } else if (predicted_score >= 50) {

        performance = "Average";

    } else {

        performance = "Needs Improvement";
    }

    return {
        predicted_score,
        performance
    };
}


// ============================================
// 17. GET ALL STUDENTS
// ============================================

app.get("/api/students", requireAdmin, async (req, res) => {

    try {

        const students = await db.all(
            "SELECT * FROM students ORDER BY id DESC"
        );

        res.json(students);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Unable to get students."
        });
    }
});


// ============================================
// 18. ADD NEW STUDENT
// ============================================

app.post("/api/students", requireAdmin, async (req, res) => {

    try {

        const result = validateStudent(req.body);

        if (result.error) {

            return res.status(400).json({
                error: result.error
            });
        }

        const student = result.student;

        const prediction = predictPerformance(student);

        const insertResult = await db.run(
            `INSERT INTO students
            (
                name,
                roll_number,
                attendance,
                previous_marks,
                study_hours,
                assignment_score,
                internal_marks,
                predicted_score,
                performance
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                student.name,
                student.roll_number,
                student.attendance,
                student.previous_marks,
                student.study_hours,
                student.assignment_score,
                student.internal_marks,
                prediction.predicted_score,
                prediction.performance
            ]
        );

        const savedStudent = await db.get(
            "SELECT * FROM students WHERE id = ?",
            [insertResult.lastID]
        );

        res.status(201).json({

            message: "Student added successfully!",

            student: savedStudent

        });

    } catch (error) {

        console.error(error);

        if (error.code === "SQLITE_CONSTRAINT") {

            return res.status(409).json({
                error: "This roll number already exists."
            });
        }

        res.status(500).json({
            error: "Unable to add student."
        });
    }
});


// ============================================
// 19. DELETE STUDENT
// ============================================

app.delete("/api/students/:id", requireAdmin, async (req, res) => {

    try {

        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {

            return res.status(400).json({
                error: "Invalid student ID."
            });
        }

        const result = await db.run(
            "DELETE FROM students WHERE id = ?",
            [id]
        );

        if (result.changes === 0) {

            return res.status(404).json({
                error: "Student not found."
            });
        }

        res.json({
            message: "Student deleted successfully!"
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Unable to delete student."
        });
    }
});


// ============================================
// 20. GENERATE AI RECOMMENDATIONS
// ============================================

app.post("/api/ai-feedback/:id", requireAdmin, async (req, res) => {

    try {

        if (!ai) {

            return res.status(503).json({
                error: "OpenAI API key is not configured."
            });
        }

        if (!process.env.OPENAI_MODEL) {

            return res.status(503).json({
                error: "Please set OPENAI_MODEL in your .env file."
            });
        }

        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {

            return res.status(400).json({
                error: "Invalid student ID."
            });
        }

        const student = await db.get(
            "SELECT * FROM students WHERE id = ?",
            [id]
        );

        if (!student) {

            return res.status(404).json({
                error: "Student not found."
            });
        }

        const response = await ai.responses.create({

            model: process.env.OPENAI_MODEL,

            input: `You are a student learning assistant.

Give simple and practical study recommendations for this student.
Do not make medical or personal assumptions.

Student details:
Name: ${student.name}
Attendance: ${student.attendance}%
Previous marks: ${student.previous_marks}
Study hours per day: ${student.study_hours}
Assignment score: ${student.assignment_score}
Internal marks: ${student.internal_marks}
Calculated score: ${student.predicted_score}
Performance category: ${student.performance}

Give:
1. A short performance summary.
2. Three practical improvement tips.
3. A simple weekly study suggestion.`
        });

        res.json({

            feedback: response.output_text || "No feedback was generated."

        });

    } catch (error) {

        console.error(error);

        if (
            error.status === 429 ||
            error.code === "credit_balance_exhausted"
        ) {

            return res.status(503).json({
                error: "OpenAI API credits are unavailable. Check your API billing."
            });
        }

        res.status(500).json({
            error: "Unable to generate AI recommendations."
        });
    }
});


// ============================================
// 21. START SERVER
// ============================================

async function startServer() {

    try {

        // Connect database.
        db = await connectDB();

        // Create or update admin table.
        await setupAdminTable();

        const PORT = process.env.PORT || 3000;

        app.listen(PORT, () => {

            console.log("--------------------------------");

            console.log(
                `EduPredict AI is running at http://localhost:${PORT}`
            );

            console.log("--------------------------------");
        });

    } catch (error) {

        console.error("Server could not start:", error);

        process.exit(1);
    }
}

startServer();
