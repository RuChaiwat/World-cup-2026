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
SYNC_BATCH_SIZE = int(os.environ.get("SYNC_BATCH_SIZE", "20"))


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
    home_team = (f["teams"].get("home") or {}).get("name") or ""
    away_team = (f["teams"].get("away") or {}).get("name") or ""
    if not home_team or not away_team:
        return None
    regular_score = get_api_sports_regular_time_score(f)
    goals_home = regular_score.get("home")
    goals_away = regular_score.get("away")
    match_status = map_api_sports_status(status_api)

    qualified_team = ""
    home_winner = (f["teams"].get("home") or {}).get("winner")
    away_winner = (f["teams"].get("away") or {}).get("winner")
    if home_winner is True:
        qualified_team = home_team
    elif away_winner is True:
        qualified_team = away_team
    elif goals_home is not None and goals_away is not None and goals_home > goals_away:
        qualified_team = home_team
    elif goals_home is not None and goals_away is not None and goals_away > goals_home:
        qualified_team = away_team

    match_status = infer_match_status(match_status, goals_home, goals_away, qualified_team)
    if match_status == "Scheduled":
        goals_home = None
        goals_away = None
        qualified_team = ""

    return {
        "matchId": f["fixture"]["id"],
        "homeTeam": home_team,
        "awayTeam": away_team,
        "kickoffTime": f["fixture"].get("date", ""),
        "stage": f.get("league", {}).get("round", ""),
        "homeScore": goals_home,
        "awayScore": goals_away,
        "status": match_status,
        "qualifiedTeam": qualified_team,
    }


def get_api_sports_regular_time_score(f):
    # API-SPORTS `goals` can represent the final score after extra time/penalties.
    # For prediction scoring we use the 90-minute score (`score.fulltime`) when present.
    fulltime_score = (f.get("score") or {}).get("fulltime") or {}
    home_score = fulltime_score.get("home")
    away_score = fulltime_score.get("away")
    if home_score is not None and away_score is not None:
        return {"home": home_score, "away": away_score}
    return {
        "home": (f.get("goals") or {}).get("home"),
        "away": (f.get("goals") or {}).get("away"),
    }


def map_api_sports_status(status_api):
    if status_api in ["FT", "AET", "PEN"]:
        return "Finished"
    if status_api in ["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"]:
        return "Live"
    return "Scheduled"


def infer_match_status(mapped_status, home_score, away_score, qualified_team=""):
    """Keep provider schedule/live states, but finish rows that explicitly have a winner/qualifier."""
    if mapped_status == "Finished":
        return "Finished"
    # Some providers can expose knockout qualifiers before the status text is normalized.
    # Do not infer Finished from scores alone because scheduled fixtures may carry 0-0 placeholders.
    if qualified_team:
        return "Finished"
    return mapped_status


def parse_football_data_match(match):
    home_team = (match.get("homeTeam") or {}).get("name") or ""
    away_team = (match.get("awayTeam") or {}).get("name") or ""
    if not home_team or not away_team:
        return None
    regular_time_score = get_football_data_regular_time_score(match)
    goals_home = regular_time_score.get("home")
    goals_away = regular_time_score.get("away")
    match_status = map_football_data_status(match.get("status"))

    winner = match.get("score", {}).get("winner")
    qualified_team = ""
    if winner == "HOME_TEAM":
        qualified_team = home_team
    elif winner == "AWAY_TEAM":
        qualified_team = away_team

    match_status = infer_match_status(match_status, goals_home, goals_away, qualified_team)
    if match_status == "Scheduled":
        goals_home = None
        goals_away = None
        qualified_team = ""

    return {
        "matchId": match["id"],
        "homeTeam": home_team,
        "awayTeam": away_team,
        "kickoffTime": match.get("utcDate", ""),
        "stage": normalize_stage_name(match.get("stage", "")),
        "homeScore": goals_home,
        "awayScore": goals_away,
        "status": match_status,
        "qualifiedTeam": qualified_team,
    }


def get_football_data_regular_time_score(match):
    # football-data may expose a `regularTime` object for knockout matches.
    # Prefer it so draw predictions are scored on the 90-minute result.
    score = match.get("score", {}) or {}
    regular_time_score = score.get("regularTime") or {}
    home_score = regular_time_score.get("home")
    away_score = regular_time_score.get("away")
    if home_score is not None and away_score is not None:
        return {"home": home_score, "away": away_score}
    return score.get("fullTime", {}) or {}


def map_football_data_status(status):
    if status in ["FINISHED", "AWARDED"]:
        return "Finished"
    if status in ["IN_PLAY", "PAUSED"]:
        return "Live"
    return "Scheduled"


def normalize_stage_name(stage):
    return str(stage or "").replace("_", " ").title()


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


def get_provider_matches():
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

    provider_matches = []
    skipped_tbd_count = 0
    for match in api_matches:
        parsed = parser(match)
        if parsed:
            provider_matches.append(parsed)
        else:
            skipped_tbd_count += 1

    if skipped_tbd_count:
        print(f"Skipped {skipped_tbd_count} provider matches because teams are not decided yet.")

    return provider_matches


def chunked(items, size):
    for start_idx in range(0, len(items), size):
        yield start_idx, items[start_idx:start_idx + size]


def build_apps_script_url(action):
    """Append action to the Apps Script URL without breaking existing query params."""
    parsed_url = urllib.parse.urlparse(API_BASE_URL)
    query_params = urllib.parse.parse_qsl(parsed_url.query, keep_blank_values=True)
    query_params = [(key, value) for key, value in query_params if key != "action"]
    query_params.append(("action", action))
    updated_query = urllib.parse.urlencode(query_params)
    return urllib.parse.urlunparse(parsed_url._replace(query=updated_query))


def post_match_batch(batch_matches, recalculate_leaderboard):
    url = build_apps_script_url("adminSyncMatches")
    payload = {
        "action": "adminSyncMatches",
        "apiKey": ADMIN_API_KEY,
        "matches": batch_matches,
        "recalculateLeaderboard": recalculate_leaderboard,
    }

    try:
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "text/plain;charset=utf-8"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
    except Exception as e:
        print("Failed to post updates to Apps Script Web App:", e)
        print("Tip: lower SYNC_BATCH_SIZE if Apps Script still times out, for example SYNC_BATCH_SIZE=10.")
        return None

    if result.get("success"):
        return result

    error = result.get("error")
    print("Apps Script rejected sync:", error)
    if error == "Invalid POST action":
        print("Hint: redeploy the latest backend/api.js to Apps Script so doPost can read action from the JSON body.")
        print("Hint: verify API_BASE_URL is the Web App /exec URL, not the Apps Script editor or /dev URL.")
    return None


def print_sync_diagnostics(result):
    if result.get("createdCount"):
        print("New matches created in the Matches sheet:")
        for match in result.get("createdMatches", []):
            print(f"- {match.get('matchId')}: {match.get('homeTeam')} vs {match.get('awayTeam')}")
    if result.get("unmatchedCount"):
        print("Unmatched matches returned by Apps Script. Check these provider names against the Matches sheet:")
        for match in result.get("unmatchedMatches", []):
            print(f"- {match.get('matchId')}: {match.get('homeTeam')} vs {match.get('awayTeam')}")
    if result.get("skippedOverriddenCount"):
        print("Skipped matches with admin overrides:")
        for match in result.get("skippedOverriddenMatches", []):
            print(f"- {match.get('matchId')}: {match.get('homeTeam')} vs {match.get('awayTeam')}")


def main():
    print("Starting Match Synchronization Job...")
    print(f"Football API provider: {FOOTBALL_API_PROVIDER}")

    provider_matches = get_provider_matches()

    if not provider_matches:
        print("No provider matches found to synchronize.")
        return

    status_counts = {}
    for match in provider_matches:
        status_counts[match.get("status") or "Unknown"] = status_counts.get(match.get("status") or "Unknown", 0) + 1
    print("Provider status summary:", ", ".join(f"{status}={count}" for status, count in sorted(status_counts.items())))

    print("Matches detected from provider:")
    for match in provider_matches[:10]:
        print(f"- {match['matchId']}: {match['homeTeam']} vs {match['awayTeam']} ({match.get('homeScore')}-{match.get('awayScore')}) [{match['status']}]")
    if len(provider_matches) > 10:
        print(f"...and {len(provider_matches) - 10} more provider matches")

    # POST updates to Apps Script API in chunks to avoid Apps Script timeouts.
    print(f"Submitting {len(provider_matches)} match updates to Apps Script API in batches of {SYNC_BATCH_SIZE}...")

    total_updated = 0
    total_created = 0
    total_unmatched = 0
    total_skipped = 0
    total_batches = (len(provider_matches) + SYNC_BATCH_SIZE - 1) // SYNC_BATCH_SIZE

    for batch_index, (start_idx, batch_matches) in enumerate(chunked(provider_matches, SYNC_BATCH_SIZE), start=1):
        is_last_batch = batch_index == total_batches
        result = post_match_batch(batch_matches, recalculate_leaderboard=is_last_batch)
        if not result:
            return

        total_updated += int(result.get("updatedCount") or 0)
        total_created += int(result.get("createdCount") or 0)
        total_unmatched += int(result.get("unmatchedCount") or 0)
        total_skipped += int(result.get("skippedOverriddenCount") or 0)

        print(f"Batch {batch_index}/{total_batches} response:", result.get("message"))
        print_sync_diagnostics(result)

    print(
        "Sync summary:",
        f"updated={total_updated},",
        f"created={total_created},",
        f"unmatched={total_unmatched},",
        f"skippedOverridden={total_skipped}",
    )


if __name__ == "__main__":
    main()
