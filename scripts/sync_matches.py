import os
import json
import requests
from datetime import datetime
import gspread
from google.oauth2.service_account import Credentials

# Configuration
SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID", "YOUR_SPREADSHEET_ID_HERE")
FOOTBALL_API_KEY = os.environ.get("FOOTBALL_API_KEY", "")
FOOTBALL_API_URL = "https://v3.api-football.com/fixtures"  # API-Football endpoint
LEAGUE_ID = 1  # Example: 1 for World Cup in API-Football
SEASON = 2026

# Google Sheets Scopes
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

def get_gspread_client():
    # Attempt to load credentials from env var or file
    creds_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if creds_json:
        creds_data = json.loads(creds_json)
        creds = Credentials.from_service_account_info(creds_data, scopes=SCOPES)
    else:
        # Fallback to local file
        creds = Credentials.from_service_account_file("credentials.json", scopes=SCOPES)
    return gspread.authorize(creds)

def sync_match_results(sheet):
    """
    Fetches match results from Football API and updates the Matches sheet.
    """
    print("Syncing match results from Football API...")
    
    # Check if we are running in mock mode for testing
    if os.environ.get("MOCK_API") == "true":
        print("Mock mode active. Skipping live API fetch.")
        return
        
    if not FOOTBALL_API_KEY:
        print("FOOTBALL_API_KEY is not set. Skipping API sync.")
        return

    headers = {
        "x-apisports-key": FOOTBALL_API_KEY
    }
    params = {
        "league": LEAGUE_ID,
        "season": SEASON
    }
    
    try:
        response = requests.get(FOOTBALL_API_URL, headers=headers, params=params, timeout=10)
        data = response.json()
        if "response" not in data:
            print("Invalid response from Football API:", data)
            return
            
        api_fixtures = data["response"]
        
        # Load active matches from sheet
        records = sheet.get_all_records()
        
        for idx, row in enumerate(records):
            match_id = str(row["Match_ID"])
            
            # Skip if manually overridden or status is finished
            if row["Override_Home_Score"] != "" or row["Override_Away_Score"] != "":
                continue
            if row["Status"] == "Finished":
                continue
                
            # Find matching fixture in API data
            # Typically match using home/away names or date
            fixture = find_matching_fixture(fixture_list=api_fixtures, 
                                            home_team=row["Home_Team"], 
                                            away_team=row["Away_Team"])
            if not fixture:
                continue
                
            status_api = fixture["fixture"]["status"]["short"] # FT, AET, PEN, etc.
            
            # Check if match has finished
            if status_api in ["FT", "AET", "PEN"]:
                goals_home = fixture["goals"]["home"]
                goals_away = fixture["goals"]["away"]
                
                # If extra time or penalty shootout, determine qualifying team
                qualified_team = ""
                if status_api == "PEN":
                    penalty_winner = fixture["teams"]["home"]["winner"]
                    qualified_team = row["Home_Team"] if penalty_winner else row["Away_Team"]
                elif goals_home > goals_away:
                    qualified_team = row["Home_Team"]
                elif goals_away > goals_home:
                    qualified_team = row["Away_Team"]
                
                # Update match details in Google Sheets
                row_num = idx + 2  # 1-based index + header row
                sheet.update_cell(row_num, get_col_index(sheet, "Home_Score_Actual"), goals_home)
                sheet.update_cell(row_num, get_col_index(sheet, "Away_Score_Actual"), goals_away)
                sheet.update_cell(row_num, get_col_index(sheet, "Status"), "Finished")
                if qualified_team:
                    sheet.update_cell(row_num, get_col_index(sheet, "Qualified_Team_Actual"), qualified_team)
                
                print(f"Updated Match {match_id}: {row['Home_Team']} {goals_home} - {goals_away} {row['Away_Team']}")
                
    except Exception as e:
        print("Error fetching match results:", e)

def find_matching_fixture(fixture_list, home_team, away_team):
    for f in fixture_list:
        api_home = f["teams"]["home"]["name"]
        api_away = f["teams"]["away"]["name"]
        if (home_team.lower() in api_home.lower()) and (away_team.lower() in api_away.lower()):
            return f
    return None

def get_col_index(sheet, header_name):
    headers = sheet.row_values(1)
    return headers.index(header_name) + 1

def compute_leaderboard(ss):
    """
    Computes scores and rankings for all users based on predictions and actual results.
    Writes the cache back to the Leaderboard sheet.
    """
    print("Computing leaderboard scores...")
    
    # 1. Fetch all worksheets
    user_sheet = ss.getSheetByName("User_Master") if hasattr(ss, "getSheetByName") else ss.worksheet("User_Master")
    match_sheet = ss.worksheet("Matches")
    sub_sheet = ss.worksheet("Raw_Submissions")
    winner_sheet = ss.worksheet("Tournament_Winner_Submissions")
    lead_sheet = ss.worksheet("Leaderboard")
    
    users = user_sheet.get_all_records()
    matches = match_sheet.get_all_records()
    submissions = sub_sheet.get_all_records()
    winner_subs = winner_sheet.get_all_records()
    
    # 2. Get latest prediction per user per match
    latest_predicts = {}  # (employee_id, match_id) -> row
    # Sort chronologically so latest overwrite
    sorted_subs = sorted(submissions, key=lambda x: x["Timestamp"])
    for sub in sorted_subs:
        key = (str(sub["Employee_ID"]), str(sub["Match_ID"]))
        latest_predicts[key] = sub
        
    # Get latest tournament winner prediction per user
    latest_winner_predicts = {} # employee_id -> team_name
    sorted_winners = sorted(winner_subs, key=lambda x: x["Timestamp"])
    for sub in sorted_winners:
        latest_winner_predicts[str(sub["Employee_ID"])] = sub["Team_Predict"]
        
    # 3. Find if the Final match is finished and who is the Champion
    champion_team = None
    final_match = next((m for m in matches if str(m["Stage"]).lower() == "final"), None)
    if final_match and is_match_finished(final_match):
        champion_team = get_settled_qualifier(final_match)
        
    # 4. Compute points for each employee
    leaderboard = []
    
    for u in users:
        emp_id = str(u["Employee_ID"])
        full_name = u["Full_Name"]
        total_points = 0
        
        # Calculate scores match by match
        for m in matches:
            if not is_match_finished(m):
                continue
                
            act_home = get_settled_home_score(m)
            act_away = get_settled_away_score(m)
            act_qualify = get_settled_qualifier(m)
            
            # Find prediction
            pred = latest_predicts.get((emp_id, str(m["Match_ID"])))
            if not pred:
                continue
                
            pred_home = pred["Home_Score_Predict"]
            pred_away = pred["Away_Score_Predict"]
            
            # Correct Score (3 pts)
            if pred_home == act_home and pred_away == act_away:
                total_points += 3
            # Correct Outcome but wrong score (1 pt)
            elif (pred_home > pred_away and act_home > act_away) or \
                 (pred_home < pred_away and act_home < act_away) or \
                 (pred_home == pred_away and act_home == act_away):
                total_points += 1
                
            # Knockout round bonus (+1 pt)
            if str(m["Stage"]).lower() != "group":
                pred_qualify = pred.get("Qualified_Team_Predict", "")
                if pred_qualify and pred_qualify == act_qualify:
                    total_points += 1
                    
        # Champion bonus (+10 pts)
        if champion_team:
            pred_champion = latest_winner_predicts.get(emp_id)
            if pred_champion and pred_champion.lower().strip() == champion_team.lower().strip():
                total_points += 10
                
        leaderboard.append({
            "Employee_ID": emp_id,
            "Full_Name": full_name,
            "Total_Points": total_points
        })
        
    # 5. Rank the leaderboard
    # Sort by total points descending, then by name ascending
    leaderboard.sort(key=lambda x: (-x["Total_Points"], x["Full_Name"]))
    
    # Calculate ranks (handling ties properly using dense ranking)
    current_rank = 0
    current_score = -1
    for idx, row in enumerate(leaderboard):
        if row["Total_Points"] != current_score:
            current_rank = idx + 1
            current_score = row["Total_Points"]
        row["Rank"] = current_rank
        
    # 6. Write Leaderboard back to Google Sheet
    lead_sheet.clear()
    lead_sheet.update("A1", [["Employee_ID", "Full_Name", "Total_Points", "Rank"]])
    
    rows_to_write = [[r["Employee_ID"], r["Full_Name"], r["Total_Points"], r["Rank"]] for r in leaderboard]
    if rows_to_write:
        lead_sheet.update(f"A2:D{len(rows_to_write)+1}", rows_to_write)
        
    print(f"Leaderboard updated. Calculated {len(leaderboard)} ranks.")

# ==========================================
# SCORING HELPERS
# ==========================================
def is_match_finished(m):
    return m["Status"] == "Finished" or \
           m["Override_Home_Score"] != "" or \
           m["Home_Score_Actual"] != ""

def get_settled_home_score(m):
    if m["Override_Home_Score"] != "":
        return int(m["Override_Home_Score"])
    return int(m["Home_Score_Actual"]) if m["Home_Score_Actual"] != "" else 0

def get_settled_away_score(m):
    if m["Override_Away_Score"] != "":
        return int(m["Override_Away_Score"])
    return int(m["Away_Score_Actual"]) if m["Away_Score_Actual"] != "" else 0

def get_settled_qualifier(m):
    if m["Override_Qualified_Team"] != "":
        return m["Override_Qualified_Team"]
    return m["Qualified_Team_Actual"]

if __name__ == "__main__":
    try:
        gc = get_gspread_client()
        sh = gc.open_by_key(SPREADSHEET_ID)
        
        matches_worksheet = sh.worksheet("Matches")
        sync_match_results(matches_worksheet)
        compute_leaderboard(sh)
        
        print("Sync and points computation completed successfully.")
    except Exception as e:
        print("Script execution failed:", e)
        exit(1)
