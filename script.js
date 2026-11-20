
const STORAGE_KEY = "attendly_tracker_v1";
const THEME_KEY = "attendly_theme";

const $ = id => document.getElementById(id);
const today = new Date();

const STUDENT_NAMES = [
  "Varman", "Sivaraman", "Thandayudhapani", "Elamparuthi",
  "Rajagopal", "Lingesh", "Haaris", "Meeran", "Naofil", "Shahid"
];

const firebaseConfig = {
  apiKey: "AIzaSyDHkKaIsqmyKT-pKdZEuquKwiUuPsAKQME",
  authDomain: "attendly-1d85e.firebaseapp.com",
  projectId: "attendly-1d85e",
  storageBucket: "attendly-1d85e.firebasestorage.app",
  messagingSenderId: "1074079530757",
  appId: "1:1074079530757:web:24151c5359b1e93846816c"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const attendanceDoc = db.collection("attendly").doc("main");

const defaultData = {
  students: STUDENT_NAMES.map((name, i) => ({
    id: i + 1,
    name
  })),
  attendance: {}
};

let data = structuredClone(defaultData);
let draft = {};
let isAdmin = false;
let dataLoaded = false;
let unsubscribeData = null;

function localDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2400);
}

function selectedDate() {
  return $("attendanceDate").value;
}

function recordsFor(date) {
  return data.attendance[date] || {};
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function setEditingEnabled(enabled) {
  [
    "markAllPresent",
    "clearMarks",
    "saveAttendance",
    "saveStudents"
  ].forEach(id => {
    const element = $(id);
    if (element) element.disabled = !enabled;
  });

  document.querySelectorAll("#attendanceRows button").forEach(button => {
    button.disabled = !enabled;
  });

  document.querySelectorAll("#studentEditor input").forEach(input => {
    input.disabled = !enabled;
  });

  const loginBtn = $("loginBtn");
  const logoutBtn = $("logoutBtn");

  if (loginBtn) loginBtn.style.display = enabled ? "none" : "inline-block";
  if (logoutBtn) logoutBtn.style.display = enabled ? "inline-block" : "none";

  const message = $("authMessage");
  if (message) {
    message.textContent = enabled
      ? "Administrator logged in"
      : "Viewer mode – login required to edit";
  }
}

function renderAttendance() {
  draft = { ...recordsFor(selectedDate()) };
  renderAttendanceRows();
  updateDashboard();
}

function renderAttendanceRows() {
  $("attendanceRows").innerHTML = data.students.map(student => {
    const status = draft[student.id] || "";

    return `
      <tr>
        <td class="roll">${String(student.id).padStart(2, "0")}</td>
        <td class="student-name">${escapeHtml(student.name)}</td>
        <td>
          <div class="status-control">
            <button class="status-btn present ${status === "Present" ? "selected" : ""}"
              data-id="${student.id}" data-status="Present"
              ${isAdmin ? "" : "disabled"}>Present</button>
            <button class="status-btn absent ${status === "Absent" ? "selected" : ""}"
              data-id="${student.id}" data-status="Absent"
              ${isAdmin ? "" : "disabled"}>Absent</button>
          </div>
        </td>
      </tr>`;
  }).join("");

  $("attendanceRows").querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      if (!isAdmin) return;
      draft[button.dataset.id] = button.dataset.status;
      renderAttendanceRows();
      updateDashboard();
    });
  });
}

function updateDashboard() {
  const values = Object.values(draft);
  const present = values.filter(v => v === "Present").length;
  const absent = values.filter(v => v === "Absent").length;
  const marked = present + absent;

  $("totalStudents").textContent = data.students.length;
  $("presentCount").textContent = present;
  $("absentCount").textContent = absent;

  $("attendanceRate").textContent = marked
    ? `${Math.round(present / marked * 100)}%`
    : "—";

  $("presentHint").textContent = marked
    ? `${present} of 10 students`
    : "Not marked yet";

  $("absentHint").textContent = marked
    ? `${absent} of 10 students`
    : "Not marked yet";

  $("markedSummary").textContent =
    `${marked} of 10 students marked`;
}

function renderStudents() {
  $("studentEditor").innerHTML = data.students.map(student => `
    <label class="student-edit-row">
      <span>${String(student.id).padStart(2, "0")}</span>
      <input maxlength="45"
        aria-label="Student ${student.id} name"
        data-student-id="${student.id}"
        value="${escapeHtml(student.name)}"
        ${isAdmin ? "" : "disabled"}>
    </label>
  `).join("");
}

function renderReport() {
  const month = $("reportMonth").value;

  const dates = Object.keys(data.attendance)
    .filter(date => date.startsWith(month))
    .sort();

  const rows = data.students.map(student => {
    let present = 0;
    let marked = 0;

    dates.forEach(date => {
      const status = data.attendance[date]?.[student.id];
      if (status === "Present" || status === "Absent") {
        marked++;
        if (status === "Present") present++;
      }
    });

    return {
      student,
      present,
      marked,
      rate: marked ? Math.round(present / marked * 100) : null
    };
  });

  const totalPresent = rows.reduce((sum, row) => sum + row.present, 0);
  const totalMarked = rows.reduce((sum, row) => sum + row.marked, 0);

  $("sessionCount").textContent = dates.length;
  $("classAverage").textContent = totalMarked
    ? `${Math.round(totalPresent / totalMarked * 100)}%`
    : "—";

  $("reportRows").innerHTML = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.student.name)}</td>
      <td>${row.present}/${row.marked}</td>
      <td>${row.rate === null ? "—" : row.rate + "%"}</td>
    </tr>
  `).join("");
}

async function saveToFirebase() {
  if (!isAdmin) {
    showToast("Administrator login required.");
    return false;
  }

  try {
    await attendanceDoc.set(data);
    return true;
  } catch (error) {
    console.error(error);
    showToast("Firebase save failed: " + error.message);
    return false;
  }
}

function listenToFirebase() {
  if (unsubscribeData) unsubscribeData();

  unsubscribeData = attendanceDoc.onSnapshot(async snapshot => {
    if (snapshot.exists) {
      const remote = snapshot.data();

      if (
        Array.isArray(remote.students) &&
        remote.attendance &&
        typeof remote.attendance === "object"
      ) {
        data = remote;
      }
    } else if (isAdmin) {
      data = structuredClone(defaultData);
      await saveToFirebase();
    } else {
      data = structuredClone(defaultData);
    }

    dataLoaded = true;
    renderAttendance();
    renderStudents();
    renderReport();
    setEditingEnabled(isAdmin);
  }, error => {
    console.error(error);
    showToast("Could not load attendance: " + error.message);
  });
}

// Administrator login
$("loginBtn").addEventListener("click", async () => {
  const email = $("adminEmail").value.trim();
  const password = $("adminPassword").value;
  const message = $("authMessage");

  if (!email || !password) {
    message.textContent = "Enter your email and password.";
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(email, password);
    $("adminPassword").value = "";
  } catch (error) {
    message.textContent = error.message;
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await auth.signOut();
});

// Initial setup
$("attendanceDate").value = localDate(today);
$("reportMonth").value =
  `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

$("todayLabel").textContent = today.toLocaleDateString(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric"
}).toUpperCase();

$("attendanceDate").addEventListener("change", renderAttendance);
$("reportMonth").addEventListener("change", renderReport);

$("markAllPresent").addEventListener("click", () => {
  if (!isAdmin) return;

  data.students.forEach(student => {
    draft[student.id] = "Present";
  });

  renderAttendanceRows();
  updateDashboard();
});

$("clearMarks").addEventListener("click", () => {
  if (!isAdmin) return;
  draft = {};
  renderAttendanceRows();
  updateDashboard();
});

$("saveAttendance").addEventListener("click", async () => {
  if (!isAdmin || !dataLoaded) return;

  const date = selectedDate();

  if (Object.keys(draft).length !== 10) {
    showToast("Mark all 10 students before saving.");
    return;
  }

  data.attendance[date] = { ...draft };

  if (await saveToFirebase()) {
    showToast("Attendance saved successfully.");
    renderReport();
  }
});

$("saveStudents").addEventListener("click", async () => {
  if (!isAdmin || !dataLoaded) return;

  const inputs = [...$("studentEditor").querySelectorAll("input")];
  const names = inputs.map(input => input.value.trim());

  if (names.some(name => !name)) {
    showToast("Please enter all 10 student names.");
    return;
  }

  data.students = data.students.map((student, i) => ({
    ...student,
    name: names[i]
  }));

  if (await saveToFirebase()) {
    showToast("Student names updated.");
    renderAttendance();
    renderStudents();
    renderReport();
  }
});

// Export monthly CSV
$("exportCsv").addEventListener("click", () => {
  const month = $("reportMonth").value;

  const dates = Object.keys(data.attendance)
    .filter(date => date.startsWith(month))
    .sort();

  const lines = [["Roll No", "Student Name", ...dates]];

  data.students.forEach(student => {
    lines.push([
      String(student.id).padStart(2, "0"),
      student.name,
      ...dates.map(date =>
        data.attendance[date]?.[student.id] || "Not marked"
      )
    ]);
  });

  const csv = lines.map(row =>
    row.map(value =>
      `"${String(value).replace(/"/g, '""')}"`
    ).join(",")
  ).join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance-${month}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

// Dark / light theme
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  $("themeToggle").textContent = theme === "dark" ? "☼" : "☾";
}

$("themeToggle").addEventListener("click", () => {
  const current = document.documentElement.dataset.theme;
  setTheme(current === "dark" ? "light" : "dark");
});

setTheme(localStorage.getItem(THEME_KEY) || "dark");

// Authentication state
auth.onAuthStateChanged(user => {
  isAdmin = !!user && user.uid === "tPJr4AuLrXSRG23P1nWCi4dwmy32";

  if (user && !isAdmin) {
    auth.signOut();
    showToast("This account is not an authorized administrator.");
    return;
  }

  setEditingEnabled(isAdmin);
  listenToFirebase();
});

renderAttendance();
renderStudents();
renderReport();
