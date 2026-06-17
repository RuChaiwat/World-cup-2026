import os
import json
import requests

# Configuration
API_BASE_URL = os.environ.get("API_BASE_URL", "https://script.google.com/macros/s/REPLACE-WITH-YOUR-GAS-WEB-APP-ID/exec")
ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "WC2026_ADMIN_SECURE_TOKEN_XYZ")
FOOTBALL_API_KEY = os.environ.get("FOOTBALL_API_KEY", "")
FOOTBALL_API_URL = os.environ.get("FOOTBALL_API_URL", "https://v3.football.api-sports.io/fixtures")
LEAGUE_ID = 1  # Example league ID
SEASON = 2026

def get_fixtures_from_api():
    """
    Fetch fixtures from the Football API
    """
    if not FOOTBALL_API_KEY:
        print("FOOTBALL_API_KEY not set. Using empty list.")
        return []

    headers = {
        "x-apisports-key": FOOTBALL_API_KEY
    }
    params = {
        "league": LEAGUE_ID,
        "season": SEASON
    }
    
    try:
        response = requests.get(FOOTBALL_API_URL, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if data.get("errors"):
            print("Football API returned errors:", data.get("errors"))
            return []

        return data.get("response", [])
    except requests.exceptions.ConnectionError as e:
        print("Error fetching from Football API: could not connect to", FOOTBALL_API_URL)
        print("Connection details:", e)
        print("Tip: verify DNS/network access or set FOOTBALL_API_URL=https://v3.football.api-sports.io/fixtures")
        return []
    except requests.exceptions.HTTPError as e:
        print("Football API HTTP error:", e)
        print("Response body:", response.text[:500] if 'response' in locals() else "")
        return []
    except ValueError as e:
        print("Football API returned non-JSON response:", e)
        print("Response body:", response.text[:500] if 'response' in locals() else "")
        return []
    except Exception as e:
        print("Error fetching from Football API:", e)
        return []

def get_mock_fixtures():
    """
    Return mock fixtures for local testing and dry-runs
    """
    print("MOCK_API active: Generating mock match updates...")
    return [
        {
            "matchId": "WC01",
            "homeTeam": "Argentina",
            "awayTeam": "Brazil",
            "homeScore": 2,
            "awayScore": 1,
            "status": "Finished",
            "qualifiedTeam": "Argentina"
        },
        {
            "matchId": "WC02",
            "homeTeam": "England",
            "awayTeam": "France",
            "homeScore": 1,
            "awayScore": 1,
            "status": "Finished",
            "qualifiedTeam": "England" # Won via penalty
        }
    ]

def main():
    print("Starting Match Synchronization Job...")
    
    finished_matches = []
    
    # 1. Fetch matches from Football API or generate mock data
    if os.environ.get("MOCK_API") == "true":
        finished_matches = get_mock_fixtures()
    else:
        api_fixtures = get_fixtures_from_api()
        # Parse API fixtures
        for f in api_fixtures:
            status_api = f["fixture"]["status"]["short"]
            
            if status_api in ["FT", "AET", "PEN"]:
                home_team = f["teams"]["home"]["name"]
                away_team = f["teams"]["away"]["name"]
                goals_home = f["goals"]["home"]
                goals_away = f["goals"]["away"]
                
                # Determine qualified team (penalty shootout or outcome)
                qualified_team = ""
                if status_api == "PEN":
                    penalty_winner = f["teams"]["home"]["winner"]
                    qualified_team = home_team if penalty_winner else away_team
                elif goals_home > goals_away:
                    qualified_team = home_team
                elif goals_away > goals_home:
                    qualified_team = away_team
                
                # We map match IDs by checking schedules. 
                # For this setup, we assume matches are identified by Home_Team VS Away_Team mapping
                finished_matches.append({
                    "matchId": f["fixture"]["id"], # In production, map this to your sheet matchId
                    "homeTeam": home_team,
                    "awayTeam": away_team,
                    "homeScore": goals_home,
                    "awayScore": goals_away,
                    "status": "Finished",
                    "qualifiedTeam": qualified_team
                })
                
    if not finished_matches:
        print("No finished matches found to synchronize.")
        return

    # 2. POST updates to Apps Script API
    print(f"Submitting {len(finished_matches)} match updates to Apps Script API...")
    
    url = f"{API_BASE_URL}?action=adminSyncMatches"
    payload = {
        "apiKey": ADMIN_API_KEY,
        "matches": finished_matches
    }
    
    try:
        response = requests.post(url, json=payload, timeout=20)
        result = response.json()
        if result.get("success"):
            print("Successfully synced matches! Apps Script response:", result.get("message"))
        else:
            print("Apps Script rejected sync:", result.get("error"))
    except Exception as e:
        print("Failed to post updates to Apps Script Web App:", e)

if __name__ == "__main__":
    main()
