// ADMIN PANEL STATE MANAGEMENT
let apiBaseUrl = localStorage.getItem("wc_admin_api_url") || "";
let adminToken = localStorage.getItem("wc_admin_token") || "";

let usersList = [];
let matchesList = [];

// DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  // Populate saved keys
  document.getElementById("input-api-url").value = apiBaseUrl;
  document.getElementById("input-api-key").value = adminToken;
  
  setupEventListeners();
  
  if (apiBaseUrl && adminToken) {
    connectAndLoad();
  }
});

// Event Binding
function setupEventListeners() {
  // Connection button
  document.getElementById("btn-connect").addEventListener("click", () => {
    apiBaseUrl = document.getElementById("input-api-url").value.trim();
    adminToken = document.getElementById("input-api-key").value.trim();
    
    localStorage.setItem("wc_admin_api_url", apiBaseUrl);
    localStorage.setItem("wc_admin_token", adminToken);
    
    if (!apiBaseUrl || !adminToken) {
      showAlert("กรุณาระบุ API URL และ TOKEN", "error");
      return;
    }
    connectAndLoad();
  });

  // Tab switching
  document.getElementById("tab-users").addEventListener("click", () => switchTab("users"));
  document.getElementById("tab-matches").addEventListener("click", () => switchTab("matches"));

  // Reload buttons
  document.getElementById("btn-reload-users").addEventListener("click", fetchUsers);
  document.getElementById("btn-reload-matches").addEventListener("click", fetchMatches);

  // Search filter
  document.getElementById("search-users").addEventListener("input", filterUsersTable);

  // Modals close buttons
  document.getElementById("btn-cancel-reset").addEventListener("click", () => closeModal("modal-reset-pin"));
  document.getElementById("btn-cancel-override").addEventListener("click", () => closeModal("modal-override-score"));

  // Modals save actions
  document.getElementById("btn-save-reset").addEventListener("click", handleSavePinReset);
  document.getElementById("btn-save-override").addEventListener("click", handleSaveOverride);
}

// Switch Tabs
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".dashboard-view").forEach(view => view.classList.remove("active"));
  
  if (tabId === "users") {
    document.getElementById("tab-users").classList.add("active");
    document.getElementById("view-users").classList.add("active");
    if (apiBaseUrl && adminToken) fetchUsers();
  } else {
    document.getElementById("tab-matches").classList.add("active");
    document.getElementById("view-matches").classList.add("active");
    if (apiBaseUrl && adminToken) fetchMatches();
  }
}

// Initial Data Pull
function connectAndLoad() {
  showAlert("กำลังเชื่อมต่อเซิร์ฟเวอร์...", "");
  fetchUsers()
    .then(() => fetchMatches())
    .then(() => showAlert("เชื่อมต่อสำเร็จ ดึงข้อมูลครบถ้วน!", "success"))
    .catch(err => {
      showAlert("เชื่อมต่อล้มเหลว: โปรดตรวจสอบ URL หรือ TOKEN", "error");
      console.error(err);
    });
}

// ==========================================
// 1. USER MANAGEMENT SECTION
// ==========================================

function fetchUsers() {
  if (!apiBaseUrl) return Promise.reject("No URL");
  
  const tbody = document.getElementById("users-table-body");
  tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">กำลังโหลดพนักงาน...</td></tr>`;
  
  return fetch(`${apiBaseUrl}?action=adminGetUsers&apiKey=${adminToken}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--accent-red);">${data.error}</td></tr>`;
        return;
      }
      usersList = data.users || [];
      renderUsersTable(usersList);
    });
}

function renderUsersTable(users) {
  const tbody = document.getElementById("users-table-body");
  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">ไม่พบข้อมูลพนักงาน</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  users.forEach(u => {
    const isLineLinked = u.Line_User_ID ? true : false;
    const pinDisplay = u.User_PIN ? `<code>${u.User_PIN}</code>` : `<span style="color: var(--text-secondary); font-style: italic;">ยังไม่ได้ตั้ง PIN</span>`;
    const lineBadge = isLineLinked 
      ? `<span class="badge badge-success">เชื่อมต่อแล้ว</span>` 
      : `<span class="badge badge-danger">ยังไม่เชื่อมต่อ</span>`;
      
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${u.Employee_ID}</strong></td>
      <td>${u.Full_Name || '-'}</td>
      <td>${pinDisplay}</td>
      <td>${lineBadge}</td>
      <td>
        <button class="btn btn-blue reset-pin-btn" data-id="${u.Employee_ID}" data-name="${u.Full_Name}">🔑 รีเซ็ต PIN</button>
      </td>
    `;
    
    // Bind click trigger for reset PIN
    tr.querySelector(".reset-pin-btn").addEventListener("click", () => {
      openResetPinModal(u.Employee_ID, u.Full_Name);
    });

    tbody.appendChild(tr);
  });
}

function filterUsersTable() {
  const query = document.getElementById("search-users").value.toLowerCase();
  const filtered = usersList.filter(u => 
    String(u.Employee_ID).toLowerCase().includes(query) || 
    String(u.Full_Name).toLowerCase().includes(query)
  );
  renderUsersTable(filtered);
}

function openResetPinModal(empId, fullName) {
  document.getElementById("reset-user-id").value = empId;
  document.getElementById("reset-user-name").value = fullName;
  document.getElementById("reset-user-pin").value = "";
  openModal("modal-reset-pin");
}

function handleSavePinReset() {
  const empId = document.getElementById("reset-user-id").value;
  const pin = document.getElementById("reset-user-pin").value.trim();
  
  if (pin.length !== 4 || isNaN(pin)) {
    showAlert("กรุณาระบุ PIN เป็นตัวเลข 4 หลัก", "error");
    return;
  }

  showAlert("กำลังดำเนินการรีเซ็ต PIN...", "");
  
  fetch(`${apiBaseUrl}?action=adminResetPin`, {
    method: "POST",
    body: JSON.stringify({
      apiKey: adminToken,
      employeeId: empId,
      newPin: pin
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      showAlert("รีเซ็ต PIN สำเร็จ!", "success");
      closeModal("modal-reset-pin");
      fetchUsers();
    } else {
      showAlert(data.error || "เกิดข้อผิดพลาดในการรีเซ็ต PIN", "error");
    }
  })
  .catch(err => {
    showAlert("ส่งข้อมูลรีเซ็ต PIN ล้มเหลว", "error");
    console.error(err);
  });
}

// ==========================================
// 2. MATCH OVERRIDES SECTION
// ==========================================

function fetchMatches() {
  if (!apiBaseUrl) return Promise.resolve();
  
  const tbody = document.getElementById("matches-table-body");
  tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-secondary);">กำลังโหลดแมตช์แข่งขัน...</td></tr>`;
  
  return fetch(`${apiBaseUrl}?action=adminGetMatches&apiKey=${adminToken}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--accent-red);">${data.error}</td></tr>`;
        return;
      }
      matchesList = data.matches || [];
      renderMatchesTable(matchesList);
    });
}

function renderMatchesTable(matches) {
  const tbody = document.getElementById("matches-table-body");
  if (matches.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-secondary);">ไม่พบแมตช์การแข่งขัน</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  matches.forEach(m => {
    // Stage and Status
    const statusText = m.Status || "Scheduled";
    let statusClass = "badge-blue";
    if (statusText.toLowerCase() === "finished") statusClass = "badge-success";
    if (statusText.toLowerCase() === "live") statusClass = "badge-danger";
    
    // Formatting match kickoff
    const dateStr = new Date(m.Kickoff_Time).toLocaleString("th-TH", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });

    const hasOverride = (m.Override_Home_Score !== null && m.Override_Home_Score !== "") || (m.Override_Away_Score !== null && m.Override_Away_Score !== "");
    const actualScore = (m.Home_Score_Actual !== null && m.Home_Score_Actual !== "") ? `${m.Home_Score_Actual} - ${m.Away_Score_Actual}` : '-';
    
    const overrideScore = hasOverride ? `<strong>${m.Override_Home_Score} - ${m.Override_Away_Score}</strong>` : '-';
    const overrideQual = m.Override_Qualified_Team ? ` (${m.Override_Qualified_Team})` : '';
    const actualQual = m.Qualified_Team_Actual ? ` (${m.Qualified_Team_Actual})` : '';

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${m.Match_ID}</code></td>
      <td><strong>${m.Home_Team} VS ${m.Away_Team}</strong></td>
      <td>${dateStr} น.</td>
      <td><span class="badge" style="background: rgba(255,255,255,0.05);">${m.Stage}</span></td>
      <td><span class="badge ${statusClass}">${statusText}</span></td>
      <td>${actualScore}${actualQual}</td>
      <td><span style="color: var(--primary);">${overrideScore}${overrideQual}</span></td>
      <td>
        <button class="btn btn-orange override-btn" data-id="${m.Match_ID}">⚙️ Override</button>
      </td>
    `;

    tr.querySelector(".override-btn").addEventListener("click", () => {
      openOverrideModal(m);
    });

    tbody.appendChild(tr);
  });
}

function openOverrideModal(m) {
  document.getElementById("override-match-id").value = m.Match_ID;
  document.getElementById("override-teams").textContent = `${m.Home_Team} VS ${m.Away_Team}`;
  
  // Set labels
  document.getElementById("label-home-score").textContent = `สกอร์ฝั่งเหย้า (${m.Home_Team})`;
  document.getElementById("label-away-score").textContent = `สกอร์ฝั่งเยือน (${m.Away_Team})`;
  
  // Populate values
  document.getElementById("override-home-score").value = m.Override_Home_Score !== null ? m.Override_Home_Score : "";
  document.getElementById("override-away-score").value = m.Override_Away_Score !== null ? m.Override_Away_Score : "";
  
  // Build qualification selector options
  const qualSelect = document.getElementById("override-qualified-team");
  const optHome = document.getElementById("opt-home-team");
  const optAway = document.getElementById("opt-away-team");
  
  optHome.value = m.Home_Team;
  optHome.textContent = `${m.Home_Team} เข้ารอบ`;
  optAway.value = m.Away_Team;
  optAway.textContent = `${m.Away_Team} เข้ารอบ`;
  
  qualSelect.value = m.Override_Qualified_Team || "";
  
  openModal("modal-override-score");
}

function handleSaveOverride() {
  const matchId = document.getElementById("override-match-id").value;
  const homeScoreVal = document.getElementById("override-home-score").value;
  const awayScoreVal = document.getElementById("override-away-score").value;
  const qualTeamVal = document.getElementById("override-qualified-team").value;
  
  const homeScore = homeScoreVal === "" ? null : parseInt(homeScoreVal);
  const awayScore = awayScoreVal === "" ? null : parseInt(awayScoreVal);
  
  showAlert("กำลังดำเนินการบันทึก Override...", "");
  
  fetch(`${apiBaseUrl}?action=adminOverrideScore`, {
    method: "POST",
    body: JSON.stringify({
      apiKey: adminToken,
      matchId,
      homeScore,
      awayScore,
      qualifiedTeam: qualTeamVal
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      showAlert("ตังค่า Override สกอร์สำเร็จ!", "success");
      closeModal("modal-override-score");
      fetchMatches();
    } else {
      showAlert(data.error || "เกิดข้อผิดพลาดในการตั้งค่า Override", "error");
    }
  })
  .catch(err => {
    showAlert("ส่งข้อมูล Override ล้มเหลว", "error");
    console.error(err);
  });
}

// ==========================================
// SYSTEM HELPERS
// ==========================================

function openModal(modalId) {
  document.getElementById(modalId).style.display = "flex";
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = "none";
}

function showAlert(message, type = "") {
  const box = document.getElementById("alert-box");
  box.textContent = message;
  box.className = `toast-alert show ${type}`;
  
  if (window.alertTimer) clearTimeout(window.alertTimer);
  
  if (type !== "") {
    window.alertTimer = setTimeout(() => {
      box.className = "toast-alert";
    }, 4000);
  }
}
