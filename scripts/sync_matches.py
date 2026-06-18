import json
import os
import urllib.error
import urllib.parse
import urllib.request

# Configuration
API_BASE_URL = os.environ.get("API_BASE_URL", "https://script.google.com/macros/s/REPLACE-WITH-YOUR-GAS-WEB-APP-ID/exec")
ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "WC2026_ADMIN_SECURE_TOKEN_XYZ")
FOOTBALL_API_PROVIDER = os.environ.get("FOOTBALL_API_PROVIDER", "football-data").strip().lower()
FOOTBALL_API_KEY = os.environ.get("FOOTBALL_API_KEY", "")
API_SPORTS_URL = os.environ.get("FOOTBALL_API_URL", "https://v3.football.api-sports.io/fixtures")
FOOTBALL_DATA_URL = os.environ.get("FOOTBALL_DATA_URL", "https://api.football-data.org/v4/competitions/WC/matches")
LEAGUE_ID = 1  # API-SPORTS league ID for World Cup
SEASON = 2026


def request_json(url, headers=None, params=None, provider_name="Football API"):
    """Fetch JSON with consistent diagnostics for GitHub Action logs."""
    request_url = url
    if params:
        query = urllib.parse.urlencode(params)
        separator = "&" if "?" in url else "?"
        request_url = f"{url}{separator}{query}"

    request = urllib.request.Request(request_url, headers=headers or {}, method="GET")

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            response_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        response_body = e.read().decode("utf-8", errors="replace")
        print(f"{provider_name} HTTP error:", e)
        print("Response body:", response_body[:500])
        return None
    except urllib.error.URLError as e:
        print(f"Error fetching from {provider_name}: could not connect to {request_url}")
        print("Connection details:", e)
        return None
    except Exception as e:
        print(f"Error fetching from {provider_name}:", e)
        return None

    try:
        return json.loads(response_body)
    except ValueError as e:
        print(f"{provider_name} returned non-JSON response:", e)
        print("Response body:", response_body[:500])
        return None


def get_fixtures_from_api_sports():
    """Fetch fixtures from API-SPORTS / API-Football."""
    if not FOOTBALL_API_KEY:
        print("FOOTBALL_API_KEY not set. Using empty list.")
        return []

    data = request_json(
        API_SPORTS_URL,
        headers={"x-apisports-key": FOOTBALL_API_KEY},
        params={"league": LEAGUE_ID, "season": SEASON},
        provider_name="API-SPORTS Football API",
    )
    if not data:
        return []

    if data.get("errors"):
        print("API-SPORTS Football API returned errors:", data.get("errors"))
        return []

    return data.get("response", [])


def get_fixtures_from_football_data():
    """Fetch World Cup fixtures from football-data.org free tier."""
    if not FOOTBALL_API_KEY:
        print("FOOTBALL_API_KEY not set. Using empty list.")
        return []

    data = request_json(
        FOOTBALL_DATA_URL,
        headers={"X-Auth-Token": FOOTBALL_API_KEY},
        params={"season": SEASON},
        provider_name="football-data.org",
    )
    if not data:
        return []

    return data.get("matches", [])


def parse_api_sports_fixture(f):
    status_api = f["fixture"]["status"]["short"]
    if status_api not in ["FT", "AET", "PEN"]:
        return None

    home_team = f["teams"]["home"]["name"]
    away_team = f["teams"]["away"]["name"]
    goals_home = f["goals"]["home"]
    goals_away = f["goals"]["away"]

    qualified_team = ""
    if status_api == "PEN":
        penalty_winner = f["teams"]["home"].get("winner")
        qualified_team = home_team if penalty_winner else away_team
    elif goals_home > goals_away:
        qualified_team = home_team
    elif goals_away > goals_home:
        qualified_team = away_team

    return {
        "matchId": f["fixture"]["id"],  # In production, map this to your sheet Match_ID
        "homeTeam": home_team,
        "awayTeam": away_team,
        "homeScore": goals_home,
        "awayScore": goals_away,
        "status": "Finished",
        "qualifiedTeam": qualified_team,
    }


def parse_football_data_match(match):
    if match.get("status") != "FINISHED":
        return None

    home_team = match["homeTeam"]["name"]
    away_team = match["awayTeam"]["name"]
    full_time_score = match.get("score", {}).get("fullTime", {})
    goals_home = full_time_score.get("home")
    goals_away = full_time_score.get("away")

    if goals_home is None or goals_away is None:
        return None

    winner = match.get("score", {}).get("winner")
    qualified_team = ""
    if winner == "HOME_TEAM":
        qualified_team = home_team
    elif winner == "AWAY_TEAM":
        qualified_team = away_team

    return {
        "matchId": match["id"],  # In production, map this to your sheet Match_ID
        "homeTeam": home_team,
        "awayTeam": away_team,
        "homeScore": goals_home,
        "awayScore": goals_away,
        "status": "Finished",
        "qualifiedTeam": qualified_team,
    }


def get_mock_fixtures():
    """Return mock fixtures for local testing and dry-runs."""
    print("MOCK_API active: Generating mock match updates...")
    return [
        {
            "matchId": "WC01",
            "homeTeam": "Argentina",
            "awayTeam": "Brazil",
            "homeScore": 2,
            "awayScore": 1,
            "status": "Finished",
            "qualifiedTeam": "Argentina",
        },
        {
            "matchId": "WC02",
            "homeTeam": "England",
            "awayTeam": "France",
            "homeScore": 1,
            "awayScore": 1,
            "status": "Finished",
            "qualifiedTeam": "England",  # Won via penalty
        },
    ]


def get_finished_matches():
    if os.environ.get("MOCK_API") == "true":
        return get_mock_fixtures()

    if FOOTBALL_API_PROVIDER in ["football-data", "football-data.org"]:
        api_matches = get_fixtures_from_football_data()
        parser = parse_football_data_match
    elif FOOTBALL_API_PROVIDER in ["api-sports", "api-football"]:
        api_matches = get_fixtures_from_api_sports()
        parser = parse_api_sports_fixture
    else:
        print(f"Unsupported FOOTBALL_API_PROVIDER: {FOOTBALL_API_PROVIDER}")
        print("Use 'football-data' for football-data.org or 'api-sports' for API-SPORTS/API-Football.")
        return []

    finished_matches = []
    for match in api_matches:
        parsed = parser(match)
        if parsed:
            finished_matches.append(parsed)

    return finished_matches


def build_apps_script_url(action):
    """Append action to the Apps Script URL without breaking existing query params."""
    parsed_url = urllib.parse.urlparse(API_BASE_URL)
    query_params = urllib.parse.parse_qsl(parsed_url.query, keep_blank_values=True)
    query_params = [(key, value) for key, value in query_params if key != "action"]
    query_params.append(("action", action))
    updated_query = urllib.parse.urlencode(query_params)
    return urllib.parse.urlunparse(parsed_url._replace(query=updated_query))


def main():
    print("Starting Match Synchronization Job...")
    print(f"Football API provider: {FOOTBALL_API_PROVIDER}")

    finished_matches = get_finished_matches()

    if not finished_matches:
        print("No finished matches found to synchronize.")
        return

    # POST updates to Apps Script API
    print(f"Submitting {len(finished_matches)} match updates to Apps Script API...")

    url = build_apps_script_url("adminSyncMatches")
    payload = {
        "action": "adminSyncMatches",
        "apiKey": ADMIN_API_KEY,
        "matches": finished_matches,
    }

    try:
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "text/plain;charset=utf-8"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))

        if result.get("success"):
            print("Successfully synced matches! Apps Script response:", result.get("message"))
        else:
            error = result.get("error")
            print("Apps Script rejected sync:", error)
            if error == "Invalid POST action":
                print("Hint: redeploy the latest backend/api.js to Apps Script so doPost can read action from the JSON body.")
                print("Hint: verify API_BASE_URL is the Web App /exec URL, not the Apps Script editor or /dev URL.")
    except Exception as e:
        print("Failed to post updates to Apps Script Web App:", e)


if __name__ == "__main__":
    main()
