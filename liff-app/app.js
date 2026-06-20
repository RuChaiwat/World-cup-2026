// CONFIGURATION - Put your deployed Google Apps Script Web App URL here
const API_BASE_URL = "https://script.google.com/macros/s/AKfycbx3Lu1FeP_pY591MF9OJJv61hEVRL_feSPQ_fkOq6r74ePHpKVCtt9vW97pq-avAMKfqA/exec";
const OPENCHAT_URL = ""; // Line OpenChat/Group Join Link. Leave blank while OpenChat/OA is temporarily disabled.
const SHOW_OPENCHAT = false; // Set to true when the LINE OpenChat/OA link is ready to show.

let currentUser = null; // { employeeId, fullName, lineUserId }
let matchesData = [];
let requestedInitialScreen = new URLSearchParams(window.location.search).get("screen") || "matches";

// Initialize App
document.addEventListener("DOMContentLoaded", () => {
  configureOpenChatBanner();
  initLiff();
  setupEventListeners();
});

// 1. Initialize LINE LIFF
function initLiff() {
  // Replace with your LIFF ID from LINE Developers Console
  liff.init({ liffId: "2010392073-d04GAnnm" })
    .then(() => {
      if (liff.isLoggedIn()) {
        resolveLineUserId()
          .then(lineUserId => {
            if (lineUserId) {
              checkAutoLogin(lineUserId);
            } else {
              showAuthScreen();
            }
          })
          .catch(err => {
            console.warn("Failed to resolve LINE User ID:", err);
            showAuthScreen();
          });
      } else {
        // For development outside LINE client, enable mock mode or trigger login
        // In production, users must open this via LINE OA
        showAuthScreen();
      }
    })
    .catch(err => {
      console.error("LIFF Initialization failed", err);
      // Fallback for browser testing
      showAuthScreen();
    });
}

function resolveLineUserId() {
  const context = liff.getContext ? liff.getContext() : null;
  if (context && context.userId) {
    return Promise.resolve(context.userId);
  }

  return liff.getProfile()
    .then(profile => profile.userId)
    .catch(err => {
      console.warn("LIFF profile scope is unavailable; continuing without profile permission.", err);
      return null;
    });
}


function configureOpenChatBanner() {
  const openChatButton = document.getElementById("btn-open-chat");
  if (!openChatButton) return;

  const shouldShowOpenChat = SHOW_OPENCHAT && Boolean(OPENCHAT_URL);
  openChatButton.style.display = shouldShowOpenChat ? "flex" : "none";
  openChatButton.setAttribute("aria-hidden", String(!shouldShowOpenChat));
}

// Check if LINE User ID is already linked
function checkAutoLogin(lineUserId) {
  fetch(`${API_BASE_URL}?action=login`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" }, // Avoid CORS preflight on some configurations
    body: JSON.stringify({ lineUserId })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success && data.registered) {
        loginUser(data.employeeId, data.fullName, lineUserId);
      } else {
        showAuthScreen(lineUserId);
      }
    })
    .catch(err => {
      console.error("Auto login check failed:", err);
      showAuthScreen(lineUserId);
    });
}

// 2. Setup Event Listeners
function setupEventListeners() {
  // Login / Registration Button
  document.getElementById("btn-login-submit").addEventListener("click", handleAuthSubmit);

  // Bottom Navigation Click Handler
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach(item => {
    item.addEventListener("click", (e) => {
      const targetScreen = item.getAttribute("data-screen");
      switchScreen(targetScreen);
    });
  });

  // OpenChat Link Click Handler
  const openChatButton = document.getElementById("btn-open-chat");
  if (openChatButton && SHOW_OPENCHAT && OPENCHAT_URL) {
    openChatButton.addEventListener("click", () => {
      if (liff.isInClient()) {
        liff.openWindow({ url: OPENCHAT_URL, external: true });
      } else {
        window.open(OPENCHAT_URL, "_blank");
      }
    });
  }

  // Submit Winner Prediction Button
  document.getElementById("btn-submit-winner").addEventListener("click", handleSubmitWinner);

  const backLeaderboardButton = document.getElementById("btn-back-leaderboard");
  if (backLeaderboardButton) {
    backLeaderboardButton.addEventListener("click", () => switchScreen("leaderboard"));
  }

  const historyDateInput = document.getElementById("history-date-input");
  if (historyDateInput) {
    historyDateInput.addEventListener("change", () => loadHistoryMatches(historyDateInput.value));
  }
}

// Handle User Authentication Submission
function handleAuthSubmit() {
  const empIdInput = document.getElementById("input-emp-id").value.trim();
  const pinInput = document.getElementById("input-pin").value.trim();

  if (!empIdInput || !pinInput) {
    showToast("กรุณากรอกรหัสพนักงานและ PIN ให้ครบถ้วน", "error");
    return;
  }
  if (pinInput.length !== 4 || isNaN(pinInput)) {
    showToast("PIN ต้องเป็นตัวเลข 4 หลัก", "error");
    return;
  }

  const lineUserId = liff.isLoggedIn() ? liff.getContext().userId : "MOCK_LINE_USER_" + empIdInput;

  showToast("กำลังยืนยันตัวตน...", "");

  // Attempt login
  fetch(`${API_BASE_URL}?action=login`, {
    method: "POST",
    body: JSON.stringify({
      employeeId: empIdInput,
      pin: pinInput,
      lineUserId: lineUserId
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success && data.registered) {
        showToast("เข้าสู่ระบบสำเร็จ!", "success");
        loginUser(empIdInput, data.fullName, lineUserId);
      } else {
        // If login failed, try registration (auto-register if employee exists but has no PIN set yet)
        registerNewUser(empIdInput, pinInput, lineUserId);
      }
    })
    .catch(err => {
      showToast("เกิดข้อผิดพลาดในการตรวจสอบบัญชี", "error");
      console.error(err);
    });
}

// Handle Registration Flow
function registerNewUser(employeeId, pin, lineUserId) {
  fetch(`${API_BASE_URL}?action=register`, {
    method: "POST",
    body: JSON.stringify({
      employeeId,
      pin,
      lineUserId
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        showToast("ลงทะเบียนและเชื่อมต่อบัญชีสำเร็จ!", "success");
        // Login immediately after successful registration
        checkAutoLogin(lineUserId);
      } else {
        showToast(data.error || "ไม่พบรหัสพนักงานในระบบ หรือ PIN ไม่ถูกต้อง", "error");
      }
    })
    .catch(err => {
      showToast("เชื่อมต่อเซิร์ฟเวอร์ลงทะเบียนล้มเหลว", "error");
      console.error(err);
    });
}

// Authenticate user session in frontend
function loginUser(employeeId, fullName, lineUserId) {
  currentUser = { employeeId, fullName, lineUserId };

  document.getElementById("display-name").textContent = fullName;
  document.getElementById("app-header").style.display = "flex";
  document.getElementById("bottom-nav").style.display = "grid";

  // Transition to requested tab from LIFF/Rich Menu, defaulting to matches.
  const allowedScreens = ["matches", "winner", "history", "leaderboard", "prediction-detail"];
  switchScreen(allowedScreens.includes(requestedInitialScreen) ? requestedInitialScreen : "matches");
}

// 3. Screen Navigation
function switchScreen(screenId) {
  if (!currentUser) return; // Prevent navigation if not logged in

  // Update nav bar active state
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach(item => {
    if (item.getAttribute("data-screen") === screenId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Switch screens
  const screens = document.querySelectorAll(".screen");
  screens.forEach(screen => {
    if (screen.id === `screen-${screenId}`) {
      screen.classList.add("active");
    } else {
      screen.classList.remove("active");
    }
  });

  // Load screen data
  if (screenId === "matches") {
    loadMatches();
  } else if (screenId === "winner") {
    loadWinnerScreen();
  } else if (screenId === "history") {
    loadHistoryScreen();
  } else if (screenId === "leaderboard") {
    loadLeaderboard();
  } else if (screenId === "prediction-detail") {
    loadPredictionHistory();
  }
}

function showAuthScreen(lineUserId = null) {
  currentUser = null;
  document.getElementById("app-header").style.display = "none";
  document.getElementById("bottom-nav").style.display = "none";

  const screens = document.querySelectorAll(".screen");
  screens.forEach(screen => {
    if (screen.id === "screen-auth") {
      screen.classList.add("active");
    } else {
      screen.classList.remove("active");
    }
  });
}

// 4. Matches Tab Operations
function loadMatches() {
  const container = document.getElementById("match-list-container");
  container.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">กำลังโหลดแมตช์การแข่งขัน...</p>`;

  fetch(`${API_BASE_URL}?action=getMatches&employeeId=${currentUser.employeeId}&mode=prediction`)
    .then(res => res.json())
    .then(data => {
      matchesData = data.matches || [];
      renderMatches(filterPredictionMatches(matchesData));
    })
    .catch(err => {
      showToast("โหลดแมตช์แข่งขันล้มเหลว", "error");
      container.innerHTML = `<p style="text-align: center; color: var(--accent-red);">เกิดข้อผิดพลาดในการดึงข้อมูลแมตช์</p>`;
    });
}

function filterPredictionMatches(matches) {
  return (matches || []).filter(isMatchPredictionOpen);
}

function isMatchPredictionOpen(match) {
  if (!match) return false;
  if (match.isPredictionOpen === true) return true;
  if (match.isPredictionOpen === false) return false;

  const kickoff = new Date(match.kickoffTime);
  if (isNaN(kickoff.getTime())) return false;

  const now = new Date();
  const predictionOpenAt = new Date(kickoff.getTime() - (3 * 24 * 60 * 60 * 1000));
  return now >= predictionOpenAt && now < kickoff;
}

function renderMatches(matches) {
  const container = document.getElementById("match-list-container");
  if (matches.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">ไม่มีรายการที่เปิดให้ทายผลในช่วง 3 วันก่อนแข่งขัน</p>`;
    return;
  }

  container.innerHTML = "";

  // Group matches by kickoff date
  const groups = {};
  matches.forEach(m => {
    const dateStr = new Date(m.kickoffTime).toLocaleDateString("th-TH", {
      weekday: "long", day: "numeric", month: "long"
    });
    if (!groups[dateStr]) groups[dateStr] = [];
    groups[dateStr].push(m);
  });

  for (const [dateHeader, matchGroup] of Object.entries(groups)) {
    // Render Date Group Header
    const groupTitle = document.createElement("div");
    groupTitle.className = "date-group-header";
    groupTitle.style.cssText = "font-size: 13px; font-weight: 700; color: var(--primary); text-transform: uppercase; margin-top: 10px; margin-bottom: 6px; letter-spacing: 0.5px;";
    groupTitle.textContent = dateHeader;
    container.appendChild(groupTitle);

    matchGroup.forEach(m => {
      const matchCard = document.createElement("div");
      matchCard.className = `match-card glass-panel ${m.isLocked ? 'locked' : ''}`;

      const timeStr = new Date(m.kickoffTime).toLocaleTimeString("th-TH", {
        hour: "2-digit", minute: "2-digit"
      });

      // Handle scores and status badges
      const pred = m.prediction || { homeScore: "", awayScore: "", qualifiedTeam: "" };
      const isPredictionOpen = isMatchPredictionOpen(m);
      const isMatchLocked = m.isLocked === true || !isPredictionOpen;
      const lockBadgeHtml = isPredictionOpen
        ? `<span class="lock-badge open">🔓 เปิดรับทายผล</span>`
        : `<span class="lock-badge closed">🔒 ปิดรับทายผล</span>`;

      // Knockout stage team qualifier picker
      const isKnockout = m.stage && String(m.stage).toLowerCase() !== "group";
      let knockoutSelectionHtml = "";
      if (isKnockout) {
        const selectedTeam = pred.qualifiedTeam || "";
        knockoutSelectionHtml = `
          <div class="form-group" style="margin-top: 8px;">
            <label class="form-label" style="font-size: 11px;">ทีมที่จะผ่านเข้ารอบ (Knockout Stage Bonus)</label>
            <select class="champ-select qual-picker" id="qualify-${m.matchId}" ${isMatchLocked ? 'disabled' : ''} style="padding: 8px; font-size: 13px;">
              <option value="">-- เลือกทีมเข้ารอบ --</option>
              <option value="${m.homeTeam}" ${selectedTeam === m.homeTeam ? 'selected' : ''}>${m.homeTeam}</option>
              <option value="${m.awayTeam}" ${selectedTeam === m.awayTeam ? 'selected' : ''}>${m.awayTeam}</option>
            </select>
          </div>
        `;
      }

      // Display actual score if locked or finished
      let actualScoreHtml = "";
      if (m.isLocked && m.actual.homeScore !== null && m.actual.homeScore !== "") {
        actualScoreHtml = `
          <div class="actual-score-container">
            <span class="vs-text" style="font-size: 9px; color: var(--accent-green);">ผลการแข่งจริง</span>
            <div class="score-display">${m.actual.homeScore} - ${m.actual.awayScore}</div>
            ${m.actual.qualifiedTeam ? `<span style="font-size: 10px; color: var(--primary);">(${m.actual.qualifiedTeam} เข้ารอบ)</span>` : ''}
          </div>
        `;
      }

      matchCard.innerHTML = `
        <div class="match-meta">
          <span class="stage-badge">${m.stage}</span>
          <span>เวลา ${timeStr} น.</span>
          ${lockBadgeHtml}
        </div>
        
        <div class="match-body">
          <!-- Home Team -->
          <div class="team-container">
            <img class="flag-icon" src="https://flagcdn.com/w80/${getTeamCode(m.homeTeam)}.png" onerror="this.src='https://flagcdn.com/w80/un.png'" alt="${m.homeTeam}">
            <div class="team-name">${m.homeTeam}</div>
          </div>
          
          <!-- VS & Score Entry -->
          <div class="vs-divider">
            <div class="predict-controls">
              <button class="predict-btn dec" ${isMatchLocked ? 'disabled' : ''}>-</button>
              <input type="text" class="predict-input home-score-val" value="${pred.homeScore}" readonly id="score-home-${m.matchId}">
              <button class="predict-btn inc" ${isMatchLocked ? 'disabled' : ''}>+</button>
            </div>
            <span class="vs-text">VS</span>
            <div class="predict-controls">
              <button class="predict-btn dec" ${isMatchLocked ? 'disabled' : ''}>-</button>
              <input type="text" class="predict-input away-score-val" value="${pred.awayScore}" readonly id="score-away-${m.matchId}">
              <button class="predict-btn inc" ${isMatchLocked ? 'disabled' : ''}>+</button>
            </div>
          </div>
          
          <!-- Away Team -->
          <div class="team-container">
            <img class="flag-icon" src="https://flagcdn.com/w80/${getTeamCode(m.awayTeam)}.png" onerror="this.src='https://flagcdn.com/w80/un.png'" alt="${m.awayTeam}">
            <div class="team-name">${m.awayTeam}</div>
          </div>
        </div>
        
        ${knockoutSelectionHtml}
        ${actualScoreHtml}
        
        <button class="card-action submit-pred-btn" data-id="${m.matchId}" ${!isPredictionOpen ? 'disabled' : ''}>
          ${pred.timestamp ? 'แก้ไขคำทายผล' : 'ส่งคำทายผล'}
        </button>
      `;

      // Increments / Decrements Event Bindings on the card
      const incButtons = matchCard.querySelectorAll(".predict-btn.inc");
      const decButtons = matchCard.querySelectorAll(".predict-btn.dec");

      incButtons.forEach(btn => {
        btn.addEventListener("click", () => {
          const input = btn.previousElementSibling;
          let val = parseInt(input.value) || 0;
          input.value = val + 1;
        });
      });

      decButtons.forEach(btn => {
        btn.addEventListener("click", () => {
          const input = btn.nextElementSibling;
          let val = parseInt(input.value) || 0;
          if (val > 0) input.value = val - 1;
        });
      });

      // Submit Prediction action
      const submitBtn = matchCard.querySelector(".submit-pred-btn");
      submitBtn.addEventListener("click", () => {
        const matchId = submitBtn.getAttribute("data-id");
        const homeVal = document.getElementById(`score-home-${matchId}`).value;
        const awayVal = document.getElementById(`score-away-${matchId}`).value;
        const qualSelect = document.getElementById(`qualify-${matchId}`);
        const qualVal = qualSelect ? qualSelect.value : "";

        if (homeVal === "" || awayVal === "") {
          showToast("กรุณากรอกสกอร์ทายผลให้ครบ", "error");
          return;
        }

        if (!isPredictionOpen) {
          showToast("ปิดรับทายผลสำหรับแมตช์นี้แล้ว", "error");
          return;
        }

        submitPrediction(matchId, homeVal, awayVal, qualVal);
      });

      container.appendChild(matchCard);
    });
  }
}

// POST Match Prediction to API
function submitPrediction(matchId, homeScore, awayScore, qualifiedTeam) {
  showToast("กำลังส่งคำทายผล...", "");

  fetch(`${API_BASE_URL}?action=submitPrediction`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      employeeId: currentUser.employeeId,
      matchId,
      homeScore: parseInt(homeScore),
      awayScore: parseInt(awayScore),
      qualifiedTeam
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        showToast("บันทึกคำทำนายสำเร็จ!", "success");
        loadMatches(); // reload to show updated state
      } else {
        showToast(data.error || "เกิดข้อผิดพลาดในการส่งคำทำนาย", "error");
      }
    })
    .catch(err => {
      showToast("บันทึกข้อมูลล้มเหลว", "error");
      console.error(err);
    });
}


// 5. Match History Screen
function loadHistoryScreen() {
  const dateInput = document.getElementById("history-date-input");
  if (!dateInput.value) {
    dateInput.value = getBangkokDateInputValue(new Date());
  }
  loadHistoryMatches(dateInput.value);
}

function loadHistoryMatches(dateValue) {
  const container = document.getElementById("history-list-container");
  container.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">กำลังโหลดผลการแข่งขัน...</p>`;

  fetch(`${API_BASE_URL}?action=getMatches&employeeId=${currentUser.employeeId}&mode=history&date=${dateValue}`)
    .then(res => res.json())
    .then(data => renderHistoryMatches(filterMatchesByBangkokDate(data.matches || [], dateValue)))
    .catch(err => {
      showToast("โหลดผลย้อนหลังล้มเหลว", "error");
      container.innerHTML = `<p style="text-align: center; color: var(--accent-red);">เกิดข้อผิดพลาดในการโหลดผลย้อนหลัง</p>`;
      console.error(err);
    });
}

function filterMatchesByBangkokDate(matches, dateValue) {
  return (matches || []).filter(match => {
    const kickoff = new Date(match.kickoffTime);
    if (isNaN(kickoff.getTime())) return false;
    return getBangkokDateInputValue(kickoff) === dateValue;
  });
}

function renderHistoryMatches(matches) {
  const container = document.getElementById("history-list-container");
  if (matches.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">ไม่มีการแข่งขันในวันที่เลือก</p>`;
    return;
  }

  container.innerHTML = "";
  matches.forEach(m => {
    const timeStr = new Date(m.kickoffTime).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    const actualHome = m.actual.homeScore !== null && m.actual.homeScore !== "" ? m.actual.homeScore : "-";
    const actualAway = m.actual.awayScore !== null && m.actual.awayScore !== "" ? m.actual.awayScore : "-";
    const pred = m.prediction;
    const card = document.createElement("div");
    card.className = "match-card glass-panel locked";
    card.innerHTML = `
      <div class="match-meta">
        <span class="stage-badge">${m.stage}</span>
        <span>เวลา ${timeStr} น.</span>
        <span class="lock-badge closed">${m.status || "Scheduled"}</span>
      </div>
      <div class="match-body">
        <div class="team-container"><img class="flag-icon" src="https://flagcdn.com/w80/${getTeamCode(m.homeTeam)}.png" onerror="this.src='https://flagcdn.com/w80/un.png'" alt="${m.homeTeam}"><div class="team-name">${m.homeTeam}</div></div>
        <div class="vs-divider"><span class="vs-text">ผลการแข่งขัน</span><div class="score-display">${actualHome} - ${actualAway}</div></div>
        <div class="team-container"><img class="flag-icon" src="https://flagcdn.com/w80/${getTeamCode(m.awayTeam)}.png" onerror="this.src='https://flagcdn.com/w80/un.png'" alt="${m.awayTeam}"><div class="team-name">${m.awayTeam}</div></div>
      </div>
      ${m.actual.qualifiedTeam ? `<div style="text-align:center; font-size:12px; color: var(--primary);">${m.actual.qualifiedTeam} เข้ารอบ</div>` : ""}
      ${pred ? `<div style="text-align:center; font-size:12px; color: var(--text-secondary); margin-top:8px;">คำทายของคุณ: ${pred.homeScore} - ${pred.awayScore}</div>` : ""}
    `;
    container.appendChild(card);
  });
}

function getBangkokDateInputValue(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

// 6. Champion Prediction Screen
function loadWinnerScreen() {
  fetch(`${API_BASE_URL}?action=getMatches&employeeId=${currentUser.employeeId}`)
    .then(res => res.json())
    .then(data => {
      const select = document.getElementById("select-champion");
      const submitBtn = document.getElementById("btn-submit-winner");

      if (data.winnerPrediction) {
        select.value = data.winnerPrediction;
        submitBtn.textContent = "แก้ไขคำทำนายแชมป์โลก";
      } else {
        select.value = "";
        submitBtn.textContent = "ส่งคำทำนายแชมป์โลก";
      }

      if (data.isWinnerLocked) {
        select.disabled = true;
        submitBtn.disabled = true;
        submitBtn.textContent = "🔒 ปิดรับทายผลแล้ว";
      } else {
        select.disabled = false;
        submitBtn.disabled = false;
      }
    })
    .catch(err => {
      showToast("ดึงคำทำนายแชมป์โรคล้มเหลว", "error");
    });
}

function handleSubmitWinner() {
  const teamVal = document.getElementById("select-champion").value;
  if (!teamVal) {
    showToast("กรุณาเลือกประเทศที่ต้องการทำนาย", "error");
    return;
  }

  showToast("กำลังส่งคำทำนายแชมป์โลก...", "");

  fetch(`${API_BASE_URL}?action=submitWinnerPrediction`, {
    method: "POST",
    body: JSON.stringify({
      employeeId: currentUser.employeeId,
      teamPredict: teamVal
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        showToast("ทายผลแชมป์โลกสำเร็จ!", "success");
        loadWinnerScreen();
      } else {
        showToast(data.error || "บันทึกทายผลแชมป์โรคล้มเหลว", "error");
      }
    })
    .catch(err => {
      showToast("เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว", "error");
      console.error(err);
    });
}

// 7. Leaderboard Tab Operations
function loadLeaderboard() {
  const container = document.getElementById("leaderboard-container");
  container.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">กำลังโหลดตารางคะแนน...</p>`;

  fetch(`${API_BASE_URL}?action=getLeaderboard&employeeId=${currentUser.employeeId}`)
    .then(res => res.json())
    .then(data => {
      renderLeaderboard(data.leaderboard, data.currentUser);
    })
    .catch(err => {
      showToast("โหลดตารางคะแนนล้มเหลว", "error");
      container.innerHTML = `<p style="text-align: center; color: var(--accent-red);">เกิดข้อผิดพลาดในการโหลดตารางคะแนน</p>`;
    });
}

function renderLeaderboard(board, currentUserRow = null) {
  const container = document.getElementById("leaderboard-container");
  if (board.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">ยังไม่มีคะแนนการแข่งขันในขณะนี้</p>`;
    return;
  }

  container.innerHTML = "";

  const rowsToRender = currentUserRow ? [...board, currentUserRow] : board;
  rowsToRender.forEach((user, index) => {
    const isMe = String(user.Employee_ID) === String(currentUser.employeeId);
    const row = document.createElement("div");

    // Add gold/silver/bronze highlight styling
    let rankClass = "";
    let rankDisplay = user.Rank;
    if (user.Rank === 1) {
      rankClass = "top1";
      rankDisplay = "🥇";
    } else if (user.Rank === 2) {
      rankClass = "top2";
      rankDisplay = "🥈";
    } else if (user.Rank === 3) {
      rankClass = "top3";
      rankDisplay = "🥉";
    }

    if (isMe) {
      rankClass += " current-user";
    }

    const isMedal = isNaN(rankDisplay);

    row.className = `leader-row ${rankClass}`;
    if (isMe) {
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.setAttribute("aria-label", "เปิดประวัติการทายของฉัน");
    }
    row.innerHTML = `
      <div class="leader-rank ${isMedal ? 'medal' : ''}">${rankDisplay}</div>
      <div class="leader-name">
        ${user.Full_Name}
        ${isMe ? ' <span style="font-size: 11px; background: var(--secondary); color:#fff; padding: 2px 6px; border-radius: 8px;">คุณ</span>' : ''}
      </div>
      <div class="leader-points">${user.Total_Points} คะแนน</div>
    `;

    if (isMe) {
      row.addEventListener("click", () => switchScreen("prediction-detail"));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          switchScreen("prediction-detail");
        }
      });
    }

    container.appendChild(row);
  });
}

function loadPredictionHistory() {
  const container = document.getElementById("prediction-history-container");
  container.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">กำลังโหลดประวัติการทาย...</p>`;

  fetch(`${API_BASE_URL}?action=getPredictionHistory&employeeId=${currentUser.employeeId}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        throw new Error(data.error);
      }
      renderPredictionHistory(data.predictions || []);
    })
    .catch(err => {
      showToast("โหลดประวัติการทายล้มเหลว", "error");
      container.innerHTML = `<p style="text-align: center; color: var(--accent-red);">เกิดข้อผิดพลาดในการโหลดประวัติการทาย</p>`;
      console.error(err);
    });
}

function renderPredictionHistory(predictions) {
  const container = document.getElementById("prediction-history-container");
  if (predictions.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">ยังไม่มีประวัติการทายผล</p>`;
    return;
  }

  container.innerHTML = "";
  predictions.forEach(pred => {
    const row = document.createElement("div");
    row.className = "prediction-history-card glass-panel";

    const submittedAt = formatBangkokDateTime(pred.timestamp);
    const kickoffAt = pred.kickoffTime ? formatBangkokDateTime(pred.kickoffTime) : "-";
    const pointsText = pred.isScored ? `${pred.points} คะแนน` : "รอผลการแข่งขัน";
    const pointsClass = pred.isScored ? "scored" : "pending";
    const latestBadge = pred.isLatestForMatch ? `<span class="history-badge latest">คำทายล่าสุด</span>` : `<span class="history-badge old">คำทายเก่า</span>`;
    const actualScoreHtml = pred.isScored
      ? `<div class="history-score-line"><span>ผลจริง</span><strong>${pred.actualHomeScore} - ${pred.actualAwayScore}</strong></div>`
      : `<div class="history-score-line muted"><span>ผลจริง</span><strong>ยังไม่จบการแข่งขัน</strong></div>`;
    const qualifierHtml = pred.predictedQualifiedTeam
      ? `<div class="history-small">ทีมเข้ารอบที่ทาย: ${pred.predictedQualifiedTeam}${pred.actualQualifiedTeam ? ` / ผลจริง: ${pred.actualQualifiedTeam}` : ""}</div>`
      : "";

    row.innerHTML = `
      <div class="history-card-header">
        <div>
          <div class="history-stage">${pred.stage || "Match"}</div>
          <div class="history-teams">${pred.homeTeam || "-"} vs ${pred.awayTeam || "-"}</div>
        </div>
        <div class="history-points ${pointsClass}">${pointsText}</div>
      </div>
      <div class="history-score-grid">
        <div class="history-score-line"><span>คุณทาย</span><strong>${pred.predictedHomeScore} - ${pred.predictedAwayScore}</strong></div>
        ${actualScoreHtml}
      </div>
      ${qualifierHtml}
      <div class="history-footer">
        ${latestBadge}
        <span>ส่งเมื่อ ${submittedAt}</span>
      </div>
      <div class="history-small">Kickoff: ${kickoffAt}</div>
    `;

    container.appendChild(row);
  });
}

// ==========================================
// FRONTEND UTILITY HELPERS
// ==========================================

function formatBangkokDateTime(value) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// Map country/team names from data providers to flag codes (from flagcdn.com).
// Keep common aliases because providers may use FIFA names, short names, or local names.
function getTeamCode(teamName) {
  const map = {
    "argentina": "ar", "australia": "au", "austria": "at", "belgium": "be",
    "bosnia-herzegovina": "ba", "bosnia and herzegovina": "ba", "brazil": "br",
    "canada": "ca", "chile": "cl", "colombia": "co", "costa rica": "cr",
    "croatia": "hr", "curacao": "cw", "curaçao": "cw", "czech republic": "cz",
    "czechia": "cz", "denmark": "dk", "ecuador": "ec", "england": "gb-eng",
    "france": "fr", "germany": "de", "ghana": "gh", "haiti": "ht",
    "iran": "ir", "iran pr": "ir", "italy": "it", "japan": "jp",
    "mexico": "mx", "morocco": "ma", "netherlands": "nl", "new zealand": "nz",
    "nigeria": "ng", "paraguay": "py", "peru": "pe", "poland": "pl",
    "portugal": "pt", "qatar": "qa", "saudi arabia": "sa", "scotland": "gb-sct",
    "senegal": "sn", "serbia": "rs", "south africa": "za", "south korea": "kr",
    "korea republic": "kr", "spain": "es", "switzerland": "ch", "turkey": "tr",
    "türkiye": "tr", "ukraine": "ua", "united states": "us", "united states of america": "us",
    "usa": "us", "uruguay": "uy", "uzbekistan": "uz", "wales": "gb-wls"
  };

  const normalizedName = String(teamName || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();

  return map[normalizedName] || "un";
}

// Show standard premium toast notifications
function showToast(message, type = "") {
  const toast = document.getElementById("toast-container");
  toast.textContent = message;
  toast.className = `toast show ${type}`;

  // Clear other timers
  if (window.toastTimer) clearTimeout(window.toastTimer);

  if (type !== "") {
    window.toastTimer = setTimeout(() => {
      toast.className = "toast";
    }, 3500);
  }
}
