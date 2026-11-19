
// ============================================
// 1. SELECT HTML ELEMENTS
// ============================================

const authSection = document.getElementById("authSection");
const appSection = document.getElementById("appSection");

const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");

const authMessage = document.getElementById("authMessage");

const studentForm = document.getElementById("studentForm");
const studentTableBody = document.getElementById("studentTableBody");

const studentSelect = document.getElementById("studentSelect");
const getFeedbackBtn = document.getElementById("getFeedbackBtn");
const feedbackResult = document.getElementById("feedbackResult");

const logoutBtn = document.getElementById("logoutBtn");
const themeToggle = document.getElementById("themeToggle");

const adminRefreshBtn = document.getElementById("adminRefreshBtn");

const showRegisterBtn = document.getElementById("showRegister");
const showLoginBtn = document.getElementById("showLogin");

let students = [];
let performanceChart = null;


// ============================================
// 2. API REQUEST FUNCTION
// ============================================

async function apiRequest(url, options = {}) {

    const response = await fetch(url, {
        ...options,

        headers: {
            "Content-Type": "application/json",
            ...options.headers
        },

        credentials: "same-origin"
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {

        if (response.status === 401 && url !== "/api/auth/login") {
            showLoginScreen();
        }

        throw new Error(data.error || data.message || "Something went wrong.");
    }

    return data;
}


// ============================================
// 3. SHOW AUTHENTICATION MESSAGE
// ============================================

function showAuthMessage(message, type = "error") {

    authMessage.textContent = message;

    authMessage.className = "message";

    if (type === "success") {
        authMessage.classList.add("success");
    }
}


// ============================================
// 4. SHOW REGISTER PAGE
// ============================================

function showRegisterScreen() {

    loginForm.classList.add("hidden");

    registerForm.classList.remove("hidden");

    authMessage.textContent = "";
}


// ============================================
// 5. SHOW LOGIN PAGE
// ============================================

function showLoginScreen(hasAdmin = true) {

    authSection.classList.remove("hidden");

    appSection.classList.add("hidden");

    registerForm.classList.add("hidden");

    loginForm.classList.add("hidden");

    authMessage.textContent = "";

    if (hasAdmin === false) {

        registerForm.classList.remove("hidden");

    } else {

        loginForm.classList.remove("hidden");
    }
}


// ============================================
// 6. REGISTER AND LOGIN PAGE SWITCHING
// ============================================

// REGISTER HERE BUTTON

if (showRegisterBtn) {

    showRegisterBtn.addEventListener("click", function(event) {

        event.preventDefault();

        showRegisterScreen();

    });

}


// BACK TO LOGIN BUTTON

if (showLoginBtn) {

    showLoginBtn.addEventListener("click", function(event) {

        event.preventDefault();

        showLoginScreen(true);

    });

}


// ============================================
// 7. CHECK LOGIN STATUS
// ============================================

async function checkAuthStatus() {

    try {

        const data = await apiRequest("/api/auth/status");

        if (data.authenticated) {

            await showApplication();

        } else {

            showLoginScreen(data.hasAdmin);

        }

    } catch (error) {

        showLoginScreen();

        // Avoid showing an error for a normal logged-out session.
        if (!error.message.includes("401")) {
            showAuthMessage(error.message);
        }
    }
}


// ============================================
// 8. ADMIN REGISTRATION
// ============================================

registerForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const name = document.getElementById("registerName").value.trim();

    const email = document.getElementById("registerEmail").value.trim();

    const password = document.getElementById("registerPassword").value;

    const button = registerForm.querySelector("button");

    button.disabled = true;

    button.textContent = "Creating Account...";

    try {

        const data = await apiRequest("/api/auth/register", {

            method: "POST",

            body: JSON.stringify({
                name,
                email,
                password
            })

        });

        registerForm.reset();

        // If registration creates an approved and logged-in admin
        if (data.admin && data.admin.status === "approved") {

            await showApplication();

        } else {

            // Pending registration: return to login
            showLoginScreen(true);

            showAuthMessage(
                data.message || "Registration submitted. Wait for admin approval.",
                "success"
            );
        }

    } catch (error) {

        showAuthMessage(error.message);

    } finally {

        button.disabled = false;

        button.textContent = "Create Admin Account";
    }
});


// ============================================
// 9. ADMIN LOGIN
// ============================================

loginForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();

    const password = document.getElementById("loginPassword").value;

    const button = loginForm.querySelector("button");

    button.disabled = true;

    button.textContent = "Logging in...";

    try {

        const data = await apiRequest("/api/auth/login", {

            method: "POST",

            body: JSON.stringify({
                email,
                password
            })

        });

        loginForm.reset();

        await showApplication();

    } catch (error) {

        showAuthMessage(error.message);

    } finally {

        button.disabled = false;

        button.textContent = "Login";
    }
});


// ============================================
// 10. SHOW MAIN APPLICATION
// ============================================

async function showApplication() {

    authSection.classList.add("hidden");

    appSection.classList.remove("hidden");

    try {

        const data = await apiRequest("/api/auth/me");

        document.getElementById("adminName").textContent =
            data.admin.name;

        document.getElementById("adminEmail").textContent =
            data.admin.email;

        document.querySelector(".profile-icon").textContent =
            data.admin.name.charAt(0).toUpperCase();

        await loadStudents();

    } catch (error) {

        showLoginScreen(true);

        showAuthMessage(error.message);
    }
}


// ============================================
// 11. ADMIN LOGOUT
// ============================================

logoutBtn.addEventListener("click", async function() {

    const confirmLogout = confirm("Are you sure you want to logout?");

    if (!confirmLogout) {
        return;
    }

    try {

        await apiRequest("/api/auth/logout", {
            method: "POST"
        });

        students = [];

        if (performanceChart) {

            performanceChart.destroy();

            performanceChart = null;
        }

        // Show login page after logout
        showLoginScreen(true);

        loginForm.reset();

        registerForm.reset();

        showAuthMessage(
            "You have logged out successfully.",
            "success"
        );

    } catch (error) {

        alert(error.message);
    }
});


// ============================================
// 12. PAGE NAVIGATION
// ============================================

const navLinks = document.querySelectorAll(".nav-link");

const pages = document.querySelectorAll(".page");

navLinks.forEach(function(link) {

    link.addEventListener("click", function(event) {

        event.preventDefault();

        const pageName = link.dataset.page;

        navLinks.forEach(item => {
            item.classList.remove("active");
        });

        link.classList.add("active");

        pages.forEach(page => {
            page.classList.remove("active");
        });

        document.getElementById(pageName).classList.add("active");

        const titles = {
            dashboard: "Dashboard",
            "add-student": "Add Student",
            students: "Students",
            prediction: "AI Prediction",
            admin: "Admin Dashboard"
        };

        document.getElementById("pageTitle").textContent =
            titles[pageName];

        if (pageName === "admin") {
            loadAdminDashboard();
        }

    });

});


// ============================================
// 13. LOAD ALL STUDENTS
// ============================================

async function loadStudents() {

    try {

        const data = await apiRequest("/api/students");

        students = Array.isArray(data) ? data : data.students || [];

        renderStudents();

        updateDashboard();

        updateStudentDropdown();

        updateAdminStats();

    } catch (error) {

        console.error("Student loading error:", error);

        studentTableBody.innerHTML = `
            <tr>
                <td colspan="7">${escapeHTML(error.message)}</td>
            </tr>
        `;
    }
}


// ============================================
// 14. DISPLAY STUDENTS IN TABLE
// ============================================

function renderStudents() {

    if (students.length === 0) {

        studentTableBody.innerHTML = `
            <tr>
                <td colspan="7">No students found.</td>
            </tr>
        `;

        return;
    }

    studentTableBody.innerHTML = students.map(function(student) {

        let badgeClass = "performance-weak";

        if (student.performance === "Good") {

            badgeClass = "performance-good";

        } else if (student.performance === "Average") {

            badgeClass = "performance-average";
        }

        return `
            <tr>

                <td>${student.id}</td>

                <td>${escapeHTML(student.name)}</td>

                <td>${escapeHTML(student.roll_number)}</td>

                <td>${student.attendance}%</td>

                <td>${student.predicted_score}</td>

                <td>
                    <span class="performance-badge ${badgeClass}">
                        ${escapeHTML(student.performance)}
                    </span>
                </td>

                <td>
                    <button
                        class="delete-btn"
                        data-id="${student.id}"
                    >
                        Delete
                    </button>
                </td>

            </tr>
        `;

    }).join("");
}


// ============================================
// 15. ADD NEW STUDENT
// ============================================

studentForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const formData = new FormData(studentForm);

    const student = Object.fromEntries(formData.entries());

    Object.keys(student).forEach(function(key) {

        if (key !== "name" && key !== "roll_number") {
            student[key] = Number(student[key]);
        }
    });

    const button = studentForm.querySelector("button");

    const message = document.getElementById("formMessage");

    button.disabled = true;

    button.textContent = "Adding Student...";

    try {

        const data = await apiRequest("/api/students", {

            method: "POST",

            body: JSON.stringify(student)

        });

        message.textContent = data.message;

        message.className = "message success";

        studentForm.reset();

        await loadStudents();

    } catch (error) {

        message.textContent = error.message;

        message.className = "message";

    } finally {

        button.disabled = false;

        button.textContent = "Add Student";
    }
});


// ============================================
// 16. DELETE STUDENT
// ============================================

studentTableBody.addEventListener("click", async function(event) {

    if (!event.target.classList.contains("delete-btn")) {
        return;
    }

    const id = event.target.dataset.id;

    const confirmed = confirm("Do you want to delete this student?");

    if (!confirmed) {
        return;
    }

    try {

        const data = await apiRequest(`/api/students/${id}`, {

            method: "DELETE"

        });

        alert(data.message);

        await loadStudents();

    } catch (error) {

        alert(error.message);
    }
});


// ============================================
// 17. UPDATE DASHBOARD STATISTICS
// ============================================

function updateDashboard() {

    const total = students.length;

    const good = students.filter(
        student => student.performance === "Good"
    ).length;

    const average = students.filter(
        student => student.performance === "Average"
    ).length;

    const weak = students.filter(
        student => student.performance === "Needs Improvement"
    ).length;

    document.getElementById("totalStudents").textContent = total;

    document.getElementById("goodStudents").textContent = good;

    document.getElementById("averageStudents").textContent = average;

    document.getElementById("weakStudents").textContent = weak;

    updateChart(good, average, weak);
}


// ============================================
// 18. PERFORMANCE CHART
// ============================================

function updateChart(good, average, weak) {

    const canvas = document.getElementById("performanceChart");

    if (!canvas || typeof Chart === "undefined") {
        return;
    }

    if (performanceChart) {
        performanceChart.destroy();
    }

    performanceChart = new Chart(canvas, {

        type: "doughnut",

        data: {

            labels: [
                "Good",
                "Average",
                "Needs Improvement"
            ],

            datasets: [{

                data: [good, average, weak],

                backgroundColor: [
                    "#22c55e",
                    "#f59e0b",
                    "#ef4444"
                ],

                borderWidth: 0
            }]
        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            plugins: {

                legend: {
                    position: "bottom"
                }
            }
        }
    });
}


// ============================================
// 19. UPDATE STUDENT DROPDOWN
// ============================================

function updateStudentDropdown() {

    studentSelect.innerHTML = `
        <option value="">Select a student</option>
    `;

    students.forEach(function(student) {

        const option = document.createElement("option");

        option.value = student.id;

        option.textContent =
            `${student.name} (${student.roll_number})`;

        studentSelect.appendChild(option);
    });
}


// ============================================
// 20. GENERATE AI FEEDBACK
// ============================================

getFeedbackBtn.addEventListener("click", async function() {

    const studentId = studentSelect.value;

    if (!studentId) {

        feedbackResult.textContent = "Please select a student.";

        return;
    }

    getFeedbackBtn.disabled = true;

    getFeedbackBtn.textContent = "Generating...";

    feedbackResult.textContent =
        "Please wait. AI is preparing recommendations...";

    try {

        const data = await apiRequest(
            `/api/ai-feedback/${studentId}`,
            {
                method: "POST",
                body: JSON.stringify({})
            }
        );

        feedbackResult.textContent = data.feedback;

    } catch (error) {

        feedbackResult.textContent = error.message;

    } finally {

        getFeedbackBtn.disabled = false;

        getFeedbackBtn.textContent =
            "Generate AI Recommendations";
    }
});


// ============================================
// 21. ADMIN DASHBOARD STATISTICS
// ============================================

function updateAdminStats() {

    const total = students.length;

    const good = students.filter(
        student => student.performance === "Good"
    ).length;

    const average = students.filter(
        student => student.performance === "Average"
    ).length;

    const weak = students.filter(
        student => student.performance === "Needs Improvement"
    ).length;

    document.getElementById("adminTotalStudents").textContent = total;

    document.getElementById("adminGoodStudents").textContent = good;

    document.getElementById("adminAverageStudents").textContent = average;

    document.getElementById("adminWeakStudents").textContent = weak;
}


// ============================================
// 22. ADMIN STUDENT TABLE
// ============================================

async function loadAdminDashboard() {

    try {

        await loadStudents();

        const table = document.getElementById("adminStudentTable");

        if (students.length === 0) {

            table.innerHTML = `
                <tr>
                    <td colspan="5">No student records found.</td>
                </tr>
            `;

            return;
        }

        table.innerHTML = students.map(function(student) {

            return `
                <tr>

                    <td>${student.id}</td>

                    <td>${escapeHTML(student.name)}</td>

                    <td>${escapeHTML(student.roll_number)}</td>

                    <td>${student.predicted_score}</td>

                    <td>${escapeHTML(student.performance)}</td>

                </tr>
            `;

        }).join("");

    } catch (error) {

        console.error(error);
    }
}


// ============================================
// 23. ADMIN REFRESH BUTTON
// ============================================

adminRefreshBtn.addEventListener("click", function() {

    loadAdminDashboard();
});


// ============================================
// 24. DARK MODE
// ============================================

themeToggle.addEventListener("click", function() {

    document.body.classList.toggle("dark");

    const isDark = document.body.classList.contains("dark");

    localStorage.setItem("eduTheme", isDark ? "dark" : "light");

    themeToggle.textContent = isDark
        ? "☀️ Light Mode"
        : "🌙 Change Theme";
});


// ============================================
// 25. LOAD SAVED THEME
// ============================================

const savedTheme = localStorage.getItem("eduTheme");

if (savedTheme === "dark") {

    document.body.classList.add("dark");

    themeToggle.textContent = "☀️ Light Mode";
}


// ============================================
// 26. ESCAPE HTML
// ============================================

function escapeHTML(value) {

    return String(value ?? "").replace(/[&<>"']/g, function(character) {

        const characters = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return characters[character];
    });
}


// ============================================
// 27. START APPLICATION
// ============================================

checkAuthStatus();
