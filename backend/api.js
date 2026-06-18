// CONFIGURATION
const ADMIN_API_KEY = "WC2026_ADMIN_SECURE_TOKEN_XYZ"; // Change this to a secure key

/**
 * Handle HTTP GET Requests
 */
function doGet(e) {
  const action = e.parameter.action;
  
  try {
    switch (action) {
      case "getMatches":
        return handleGetMatches(e);
      case "getLeaderboard":
        return handleGetLeaderboard(e);
      case "adminGetUsers":
        return handleAdminGetUsers(e);
      case "adminGetMatches":
        return handleAdminGetMatches(e);
      default:
        return jsonResponse({ error: "Invalid GET action" }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: err.toString() }, 500);
  }
}

/**
 * Handle HTTP POST Requests
 */
function doPost(e) {
  let body = {};
  
  if (e.postData && e.postData.contents) {
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonResponse({ error: "Malformed JSON body" }, 400);
    }
  }

  const action = e.parameter.action || body.action;
  
  try {
    switch (action) {
      case "register":
        return handleRegister(body);
      case "login":
        return handleLogin(body);
      case "submitPrediction":
        return handleSubmitPrediction(body);
      case "submitWinnerPrediction":
        return handleSubmitWinnerPrediction(body);
      case "adminResetPin":
        return handleAdminResetPin(body);
      case "adminOverrideScore":
        return handleAdminOverrideScore(body);
      case "adminSyncMatches":
        return handleAdminSyncMatches(body);
      default:
        return jsonResponse({ error: "Invalid POST action" }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: err.toString() }, 500);
  }
}

// ==========================================
// BUSINESS LOGIC HANDLERS
// ==========================================

/**
 * Register employee and link LINE User ID
 */
function handleRegister(body) {
  const { employeeId, pin, lineUserId, fullName } = body;
  if (!employeeId || !pin) {
    return jsonResponse({ error: "Employee_ID and PIN are required" }, 400);
  }
  if (pin.length !== 4 || isNaN(pin)) {
    return jsonResponse({ error: "PIN must be a 4-digit number" }, 400);
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("User_Master");
  const data = getSheetData(userSheet);
  
  const rowIdx = data.findIndex(row => String(row.Employee_ID).trim() === String(employeeId).trim());
  
  if (rowIdx === -1) {
    return jsonResponse({ error: "Employee ID not found in database. Please contact Admin." }, 404);
  }
  
  const targetRow = data[rowIdx];
  if (targetRow.User_PIN && targetRow.Line_User_ID) {
    return jsonResponse({ error: "Employee is already registered." }, 400);
  }
  
  const sheetRow = rowIdx + 2;
  updateCellByHeader(userSheet, sheetRow, "User_PIN", String(pin));
  if (lineUserId) {
    updateCellByHeader(userSheet, sheetRow, "Line_User_ID", String(lineUserId));
  }
  if (fullName && !targetRow.Full_Name) {
    updateCellByHeader(userSheet, sheetRow, "Full_Name", String(fullName));
  }
  
  return jsonResponse({ success: true, message: "Registration successful" });
}

/**
 * Login verification
 */
function handleLogin(body) {
  const { employeeId, pin, lineUserId } = body;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("User_Master");
  const data = getSheetData(userSheet);
  
  if (lineUserId && !employeeId && !pin) {
    const user = data.find(row => String(row.Line_User_ID) === String(lineUserId));
    if (user) {
      return jsonResponse({ 
        success: true, 
        registered: true,
        employeeId: user.Employee_ID,
        fullName: user.Full_Name
      });
    } else {
      return jsonResponse({ success: true, registered: false });
    }
  }
  
  if (!employeeId || !pin) {
    return jsonResponse({ error: "Employee ID and PIN are required" }, 400);
  }
  
  const userIdx = data.findIndex(row => String(row.Employee_ID).trim() === String(employeeId).trim());
  if (userIdx === -1) {
    return jsonResponse({ error: "Employee ID not found" }, 404);
  }
  
  const user = data[userIdx];
  if (String(user.User_PIN) !== String(pin)) {
    return jsonResponse({ error: "Incorrect PIN" }, 401);
  }
  
  if (lineUserId && String(user.Line_User_ID) !== String(lineUserId)) {
    updateCellByHeader(userSheet, userIdx + 2, "Line_User_ID", String(lineUserId));
  }
  
  return jsonResponse({
    success: true,
    registered: true,
    employeeId: user.Employee_ID,
    fullName: user.Full_Name
  });
}

/**
 * Get matches along with user predictions
 */
function handleGetMatches(e) {
  const employeeId = e.parameter.employeeId;
  if (!employeeId) {
    return jsonResponse({ error: "employeeId parameter is required" }, 400);
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const matchSheet = ss.getSheetByName("Matches");
  const subSheet = ss.getSheetByName("Raw_Submissions");
  const winSheet = ss.getSheetByName("Tournament_Winner_Submissions");
  
  const matches = getSheetData(matchSheet);
  const submissions = getSheetData(subSheet);
  const winners = getSheetData(winSheet);
  
  const userPredicts = {};
  submissions
    .filter(row => String(row.Employee_ID) === String(employeeId))
    .forEach(row => {
      userPredicts[row.Match_ID] = {
        homeScore: row.Home_Score_Predict,
        awayScore: row.Away_Score_Predict,
        qualifiedTeam: row.Qualified_Team_Predict,
        timestamp: row.Timestamp
      };
    });
    
  const userWinnerPredict = winners
    .filter(row => String(row.Employee_ID) === String(employeeId))
    .sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp))
    .pop();
  
  const matchesResult = matches.map(m => {
    const pred = userPredicts[m.Match_ID] || null;
    const kickoff = new Date(m.Kickoff_Time);
    const now = new Date();
    const isLocked = now >= kickoff;
    
    const homeScoreActual = m.Override_Home_Score !== "" && m.Override_Home_Score !== null && m.Override_Home_Score !== undefined ? m.Override_Home_Score : m.Home_Score_Actual;
    const awayScoreActual = m.Override_Away_Score !== "" && m.Override_Away_Score !== null && m.Override_Away_Score !== undefined ? m.Override_Away_Score : m.Away_Score_Actual;
    const qualifiedTeamActual = m.Override_Qualified_Team !== "" && m.Override_Qualified_Team !== null && m.Override_Qualified_Team !== undefined ? m.Override_Qualified_Team : m.Qualified_Team_Actual;
    
    return {
      matchId: m.Match_ID,
      homeTeam: m.Home_Team,
      awayTeam: m.Away_Team,
      kickoffTime: m.Kickoff_Time,
      stage: m.Stage,
      status: m.Status,
      isLocked: isLocked,
      actual: {
        homeScore: homeScoreActual,
        awayScore: awayScoreActual,
        qualifiedTeam: qualifiedTeamActual
      },
      prediction: pred
    };
  });
  
  const firstSemifinal = matches.find(m => String(m.Stage).toLowerCase() === "semifinals");
  const winnerLockTime = firstSemifinal ? new Date(firstSemifinal.Kickoff_Time) : null;
  const isWinnerLocked = winnerLockTime ? (new Date() >= winnerLockTime) : false;
  
  return jsonResponse({
    matches: matchesResult,
    winnerPrediction: userWinnerPredict ? userWinnerPredict.Team_Predict : null,
    isWinnerLocked: isWinnerLocked
  });
}

/**
 * Submit Match Prediction
 */
function handleSubmitPrediction(body) {
  const { employeeId, matchId, homeScore, awayScore, qualifiedTeam } = body;
  if (!employeeId || !matchId || homeScore === undefined || awayScore === undefined) {
    return jsonResponse({ error: "Missing required fields" }, 400);
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const matchSheet = ss.getSheetByName("Matches");
  const matches = getSheetData(matchSheet);
  
  const match = matches.find(m => String(m.Match_ID) === String(matchId));
  if (!match) {
    return jsonResponse({ error: "Match not found" }, 404);
  }
  
  const kickoff = new Date(match.Kickoff_Time);
  if (new Date() >= kickoff) {
    return jsonResponse({ error: "Prediction closed: Match has already kicked off!" }, 400);
  }
  
  const subSheet = ss.getSheetByName("Raw_Submissions");
  const timestamp = new Date().toISOString();
  
  appendRowToObjectSheet(subSheet, {
    Timestamp: timestamp,
    Employee_ID: employeeId,
    Match_ID: matchId,
    Home_Score_Predict: Number(homeScore),
    Away_Score_Predict: Number(awayScore),
    Qualified_Team_Predict: qualifiedTeam || ""
  });
  
  return jsonResponse({ success: true, message: "Prediction submitted successfully" });
}

/**
 * Submit Tournament Winner Prediction
 */
function handleSubmitWinnerPrediction(body) {
  const { employeeId, teamPredict } = body;
  if (!employeeId || !teamPredict) {
    return jsonResponse({ error: "Missing employeeId or teamPredict" }, 400);
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const matchSheet = ss.getSheetByName("Matches");
  const matches = getSheetData(matchSheet);
  
  const firstSemifinal = matches.find(m => String(m.Stage).toLowerCase() === "semifinals");
  if (firstSemifinal && new Date() >= new Date(firstSemifinal.Kickoff_Time)) {
    return jsonResponse({ error: "Prediction closed: Semifinals have already started!" }, 400);
  }
  
  const winSheet = ss.getSheetByName("Tournament_Winner_Submissions");
  const timestamp = new Date().toISOString();
  
  appendRowToObjectSheet(winSheet, {
    Timestamp: timestamp,
    Employee_ID: employeeId,
    Team_Predict: teamPredict
  });
  
  return jsonResponse({ success: true, message: "Tournament winner prediction submitted" });
}

/**
 * Get Leaderboard Cache
 */
function handleGetLeaderboard(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const boardSheet = ss.getSheetByName("Leaderboard");
  const data = getSheetData(boardSheet);
  
  const sortedBoard = data.sort((a, b) => Number(a.Rank) - Number(b.Rank));
  return jsonResponse({ leaderboard: sortedBoard });
}

// ==========================================
// ADMIN MODULES
// ==========================================

function handleAdminGetUsers(e) {
  const apiKey = e.parameter.apiKey;
  if (apiKey !== ADMIN_API_KEY) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("User_Master");
  const data = getSheetData(userSheet);
  
  return jsonResponse({ users: data });
}

function handleAdminGetMatches(e) {
  const apiKey = e.parameter.apiKey;
  if (apiKey !== ADMIN_API_KEY) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const matchSheet = ss.getSheetByName("Matches");
  const data = getSheetData(matchSheet);
  
  return jsonResponse({ matches: data });
}

function handleAdminResetPin(body) {
  const { apiKey, employeeId, newPin } = body;
  if (apiKey !== ADMIN_API_KEY) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  if (!employeeId || !newPin) {
    return jsonResponse({ error: "Employee ID and new PIN are required" }, 400);
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("User_Master");
  const data = getSheetData(userSheet);
  
  const userIdx = data.findIndex(row => String(row.Employee_ID).trim() === String(employeeId).trim());
  if (userIdx === -1) {
    return jsonResponse({ error: "Employee ID not found" }, 404);
  }
  
  updateCellByHeader(userSheet, userIdx + 2, "User_PIN", String(newPin));
  return jsonResponse({ success: true, message: "PIN reset successfully" });
}

function handleAdminOverrideScore(body) {
  const { apiKey, matchId, homeScore, awayScore, qualifiedTeam } = body;
  if (apiKey !== ADMIN_API_KEY) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const matchSheet = ss.getSheetByName("Matches");
  const data = getSheetData(matchSheet);
  
  const matchIdx = data.findIndex(row => String(row.Match_ID) === String(matchId));
  if (matchIdx === -1) {
    return jsonResponse({ error: "Match not found" }, 404);
  }
  
  const rowNum = matchIdx + 2;
  updateCellByHeader(matchSheet, rowNum, "Override_Home_Score", homeScore === null || homeScore === "" ? "" : Number(homeScore));
  updateCellByHeader(matchSheet, rowNum, "Override_Away_Score", awayScore === null || awayScore === "" ? "" : Number(awayScore));
  updateCellByHeader(matchSheet, rowNum, "Override_Qualified_Team", qualifiedTeam || "");
  
  // Recalculate leaderboard on change
  recalculateLeaderboard(ss);
  
  return jsonResponse({ success: true, message: "Score overridden successfully" });
}

/**
 * Admin: Synchronize match actual results from automated scripts
 */
function handleAdminSyncMatches(body) {
  const { apiKey, matches } = body;
  if (apiKey !== ADMIN_API_KEY) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  if (!matches || !Array.isArray(matches)) {
    return jsonResponse({ error: "matches array is required" }, 400);
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const matchSheet = ss.getSheetByName("Matches");
  const data = getSheetData(matchSheet);
  
  let updatedCount = 0;
  let createdCount = 0;
  const createdMatches = [];
  const unmatchedMatches = [];
  const skippedOverriddenMatches = [];
  
  matches.forEach(m => {
    const matchIdx = findMatchIndexForSync(data, m);
    if (matchIdx === -1) {
      if (m.matchId && m.homeTeam && m.awayTeam) {
        appendRowToObjectSheet(matchSheet, buildMatchRowForSync(m));
        createdMatches.push({
          matchId: m.matchId || "",
          homeTeam: m.homeTeam || "",
          awayTeam: m.awayTeam || ""
        });
        createdCount++;
      } else {
        unmatchedMatches.push({
          matchId: m.matchId || "",
          homeTeam: m.homeTeam || "",
          awayTeam: m.awayTeam || ""
        });
      }
      return;
    }

    const row = data[matchIdx];
    
    // Skip if overridden
    const isOverridden = (row.Override_Home_Score !== "" && row.Override_Home_Score !== null && row.Override_Home_Score !== undefined);
    if (isOverridden) {
      skippedOverriddenMatches.push({
        matchId: row.Match_ID || m.matchId || "",
        homeTeam: row.Home_Team || m.homeTeam || "",
        awayTeam: row.Away_Team || m.awayTeam || ""
      });
      return;
    }

    const rowNum = matchIdx + 2;
    updateCellByHeader(matchSheet, rowNum, "Home_Score_Actual", m.homeScore === null || m.homeScore === "" ? "" : Number(m.homeScore));
    updateCellByHeader(matchSheet, rowNum, "Away_Score_Actual", m.awayScore === null || m.awayScore === "" ? "" : Number(m.awayScore));
    updateCellByHeader(matchSheet, rowNum, "Status", m.status || "Finished");
    if (m.qualifiedTeam) {
      updateCellByHeader(matchSheet, rowNum, "Qualified_Team_Actual", m.qualifiedTeam);
    }
    updatedCount++;
  });
  
  if (body.recalculateLeaderboard !== false) {
    recalculateLeaderboard(ss);
  }
  
  return jsonResponse({
    success: true,
    message: `Synced ${updatedCount} matches and created ${createdCount} new matches. Unmatched: ${unmatchedMatches.length}. Skipped overridden: ${skippedOverriddenMatches.length}. Leaderboard recalculated: ${body.recalculateLeaderboard !== false}.`,
    updatedCount: updatedCount,
    createdCount: createdCount,
    createdMatches: createdMatches.slice(0, 10),
    unmatchedCount: unmatchedMatches.length,
    unmatchedMatches: unmatchedMatches.slice(0, 10),
    skippedOverriddenCount: skippedOverriddenMatches.length,
    skippedOverriddenMatches: skippedOverriddenMatches.slice(0, 10)
  });
}


function buildMatchRowForSync(incomingMatch) {
  const homeScore = incomingMatch.homeScore === null || incomingMatch.homeScore === undefined || incomingMatch.homeScore === "" ? "" : Number(incomingMatch.homeScore);
  const awayScore = incomingMatch.awayScore === null || incomingMatch.awayScore === undefined || incomingMatch.awayScore === "" ? "" : Number(incomingMatch.awayScore);

  return {
    Match_ID: String(incomingMatch.matchId),
    Home_Team: incomingMatch.homeTeam || "",
    Away_Team: incomingMatch.awayTeam || "",
    Kickoff_Time: incomingMatch.kickoffTime || "",
    Stage: incomingMatch.stage || "",
    Home_Score_Actual: homeScore,
    Away_Score_Actual: awayScore,
    Qualified_Team_Actual: incomingMatch.qualifiedTeam || "",
    Override_Home_Score: "",
    Override_Away_Score: "",
    Override_Qualified_Team: "",
    Status: incomingMatch.status || "Scheduled"
  };
}

function findMatchIndexForSync(sheetRows, incomingMatch) {
  const incomingMatchId = String(incomingMatch.matchId || "").trim();
  if (incomingMatchId) {
    const idMatchIdx = sheetRows.findIndex(row => String(row.Match_ID).trim() === incomingMatchId);
    if (idMatchIdx !== -1) return idMatchIdx;
  }

  const incomingHome = normalizeTeamName(incomingMatch.homeTeam);
  const incomingAway = normalizeTeamName(incomingMatch.awayTeam);
  if (!incomingHome || !incomingAway) return -1;

  return sheetRows.findIndex(row =>
    normalizeTeamName(row.Home_Team) === incomingHome &&
    normalizeTeamName(row.Away_Team) === incomingAway
  );
}

function normalizeTeamName(teamName) {
  return String(teamName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// ==========================================
// SCORING ENGINE AND LEADERBOARD GENERATOR
// ==========================================

function recalculateLeaderboard(ss) {
  const userSheet = ss.getSheetByName("User_Master");
  const matchSheet = ss.getSheetByName("Matches");
  const subSheet = ss.getSheetByName("Raw_Submissions");
  const winSheet = ss.getSheetByName("Tournament_Winner_Submissions");
  const leadSheet = ss.getSheetByName("Leaderboard");
  
  const users = getSheetData(userSheet);
  const matches = getSheetData(matchSheet);
  const submissions = getSheetData(subSheet);
  const winners = getSheetData(winSheet);
  
  // Group submissions by employee and match. Storing chronologically so latest overwrites
  const latestPredicts = {};
  submissions.forEach(sub => {
    const key = String(sub.Employee_ID) + "_" + String(sub.Match_ID);
    latestPredicts[key] = sub;
  });
  
  // Group tournament winner predictions
  const latestWinnerPredicts = {};
  winners.forEach(w => {
    latestWinnerPredicts[String(w.Employee_ID)] = w.Team_Predict;
  });
  
  // Find champion if Final is finished
  let championTeam = null;
  const finalMatch = matches.find(m => String(m.Stage).toLowerCase() === "final");
  if (finalMatch && isMatchFinished(finalMatch)) {
    championTeam = getSettledQualifier(finalMatch);
  }
  
  const leaderboard = [];
  
  users.forEach(u => {
    const empId = String(u.Employee_ID);
    const fullName = u.Full_Name;
    let totalPoints = 0;
    
    matches.forEach(m => {
      if (!isMatchFinished(m)) return;
      
      const actHome = getSettledHomeScore(m);
      const actAway = getSettledAwayScore(m);
      const actQualify = getSettledQualifier(m);
      
      const pred = latestPredicts[empId + "_" + String(m.Match_ID)];
      if (!pred) return;
      
      const predHome = Number(pred.Home_Score_Predict);
      const predAway = Number(pred.Away_Score_Predict);
      
      // Correct Score (3 pts)
      if (predHome === actHome && predAway === actAway) {
        totalPoints += 3;
      }
      // Correct Outcome but wrong score (1 pt)
      else if ((predHome > predAway && actHome > actAway) ||
               (predHome < predAway && actHome < actAway) ||
               (predHome === predAway && actHome === actAway)) {
        totalPoints += 1;
      }
      
      // Knockout round bonus (+1 pt)
      if (String(m.Stage).toLowerCase() !== "group") {
        const predQualify = pred.Qualified_Team_Predict;
        if (predQualify && predQualify === actQualify) {
          totalPoints += 1;
        }
      }
    });
    
    // Champion bonus (+10 pts)
    if (championTeam) {
      const predChampion = latestWinnerPredicts[empId];
      if (predChampion && predChampion.toLowerCase().trim() === championTeam.toLowerCase().trim()) {
        totalPoints += 10;
      }
    }
    
    leaderboard.push({
      Employee_ID: empId,
      Full_Name: fullName,
      Total_Points: totalPoints
    });
  });
  
  // Sort leaderboard: Points desc, Name asc
  leaderboard.sort((a, b) => {
    if (b.Total_Points !== a.Total_Points) {
      return b.Total_Points - a.Total_Points;
    }
    return String(a.Full_Name).localeCompare(String(b.Full_Name));
  });
  
  // Apply dense ranking
  let currentRank = 0;
  let currentScore = -1;
  leaderboard.forEach((row, idx) => {
    if (row.Total_Points !== currentScore) {
      currentRank = idx + 1;
      currentScore = row.Total_Points;
    }
    row.Rank = currentRank;
  });
  
  // Clear and rewrite Leaderboard
  leadSheet.clearContents();
  leadSheet.getRange(1, 1, 1, 4).setValues([["Employee_ID", "Full_Name", "Total_Points", "Rank"]]);
  if (leaderboard.length > 0) {
    const rowsToWrite = leaderboard.map(r => [r.Employee_ID, r.Full_Name, r.Total_Points, r.Rank]);
    leadSheet.getRange(2, 1, rowsToWrite.length, 4).setValues(rowsToWrite);
  }
}

function isMatchFinished(m) {
  return m.Status === "Finished" ||
         (m.Override_Home_Score !== "" && m.Override_Home_Score !== null && m.Override_Home_Score !== undefined) ||
         (m.Home_Score_Actual !== "" && m.Home_Score_Actual !== null && m.Home_Score_Actual !== undefined);
}

function getSettledHomeScore(m) {
  if (m.Override_Home_Score !== "" && m.Override_Home_Score !== null && m.Override_Home_Score !== undefined) {
    return Number(m.Override_Home_Score);
  }
  return Number(m.Home_Score_Actual);
}

function getSettledAwayScore(m) {
  if (m.Override_Away_Score !== "" && m.Override_Away_Score !== null && m.Override_Away_Score !== undefined) {
    return Number(m.Override_Away_Score);
  }
  return Number(m.Away_Score_Actual);
}

function getSettledQualifier(m) {
  if (m.Override_Qualified_Team !== "" && m.Override_Qualified_Team !== null && m.Override_Qualified_Team !== undefined) {
    return m.Override_Qualified_Team;
  }
  return m.Qualified_Team_Actual;
}

// ==========================================
// GOOGLE SHEETS UTILITY FUNCTIONS
// ==========================================

function getSheetData(sheet) {
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (values.length <= 1) return [];
  
  const headers = values[0].map(h => String(h).trim());
  const rows = [];
  
  for (let i = 1; i < values.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[i][j];
    }
    rows.push(row);
  }
  return rows;
}

function updateCellByHeader(sheet, rowNum, headerName, value) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const colIdx = headers.indexOf(headerName) + 1;
  if (colIdx > 0) {
    sheet.getRange(rowNum, colIdx).setValue(value);
  }
}

function appendRowToObjectSheet(sheet, dataObj) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const rowValues = [];
  
  for (let i = 0; i < headers.length; i++) {
    const val = dataObj[headers[i]];
    rowValues.push(val !== undefined ? val : "");
  }
  sheet.appendRow(rowValues);
}

function jsonResponse(data, status = 200) {
  const payload = JSON.stringify(data);
  return ContentService.createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}
