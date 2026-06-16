# Google Sheets Database Setup Instructions

This document provides guidelines on how to structure the Google Sheets that will act as the database for the World Cup 2026 Prediction System.

Please create a Google Sheet containing the following five tabs (sheets) exactly matching the structures described below:

---

## 1. Sheet Name: `User_Master`
This sheet is populated by admins beforehand with employee details. The `Line_User_ID` column is populated automatically during first-time registration.

| Column Header | Data Type | Key | Description |
| :--- | :--- | :--- | :--- |
| `Employee_ID` | Text | Primary Key | Unique employee identifier (e.g., EMP001). |
| `Full_Name` | Text | | First and last name of the employee. |
| `User_PIN` | Text (4 digits)| | 4-digit PIN configured during registration. |
| `Line_User_ID` | Text | | Unique LINE User ID (automatically linked on registration). |

---

## 2. Sheet Name: `Matches`
Stores match schedules, actual scores, and admin overrides. Updated periodically by GitHub Actions (and overridden by the Admin Dashboard if needed).

| Column Header | Data Type | Key | Description |
| :--- | :--- | :--- | :--- |
| `Match_ID` | Text | Primary Key | Unique match identifier (e.g., WC01). |
| `Home_Team` | Text | | Name of the home country/team. |
| `Away_Team` | Text | | Name of the away country/team. |
| `Kickoff_Time` | ISO DateTime | | Scheduled kick-off time in UTC (e.g. `2026-06-14T19:00:00Z`). |
| `Stage` | Text | | Match stage: `Group`, `Round of 16`, `Quarterfinals`, `Semifinals`, `Third place`, `Final`. |
| `Home_Score_Actual` | Number/Blank | | Actual home score synced from Football API. |
| `Away_Score_Actual` | Number/Blank | | Actual away score synced from Football API. |
| `Qualified_Team_Actual`| Text/Blank | | Actual team that qualified for the next round (for knockout stages). |
| `Override_Home_Score` | Number/Blank | | Manually overridden home score set by Admin. |
| `Override_Away_Score` | Number/Blank | | Manually overridden away score set by Admin. |
| `Override_Qualified_Team`| Text/Blank | | Manually overridden qualified team set by Admin. |
| `Status` | Text | | Match status: `Scheduled`, `Live`, `Finished`. |

---

## 3. Sheet Name: `Raw_Submissions`
Log of match predictions submitted by employees. The API filters submissions using the latest timestamp for each `Employee_ID` and `Match_ID`.

| Column Header | Data Type | Key | Description |
| :--- | :--- | :--- | :--- |
| `Timestamp` | ISO DateTime | | The timestamp of when the prediction was submitted. |
| `Employee_ID` | Text | | The ID of the employee who made the prediction. |
| `Match_ID` | Text | | The match identifier. |
| `Home_Score_Predict` | Number | | Predicted home score. |
| `Away_Score_Predict` | Number | | Predicted away score. |
| `Qualified_Team_Predict`| Text/Blank | | Predicted team to qualify (for knockout stages). |

---

## 4. Sheet Name: `Tournament_Winner_Submissions`
Log of tournament winner predictions.

| Column Header | Data Type | Key | Description |
| :--- | :--- | :--- | :--- |
| `Timestamp` | ISO DateTime | | The timestamp of when the prediction was submitted. |
| `Employee_ID` | Text | | The ID of the employee who made the prediction. |
| `Team_Predict` | Text | | Predicted World Cup champion team name. |

---

## 5. Sheet Name: `Leaderboard`
Main leaderboard cache for fast reading. Calculated and written by the GitHub Actions sync job.

| Column Header | Data Type | Key | Description |
| :--- | :--- | :--- | :--- |
| `Employee_ID` | Text | Primary Key | Unique employee identifier. |
| `Full_Name` | Text | | First and last name of the employee. |
| `Total_Points` | Number | | Total points accumulated. |
| `Rank` | Number | | Ranked position in leaderboard. |
