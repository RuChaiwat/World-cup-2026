import os
import json
import requests
import gspread
from google.oauth2.service_account import Credentials

# Configuration
SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID", "YOUR_SPREADSHEET_ID_HERE")
LINE_CHANNEL_ACCESS_TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "")
LINE_LIFF_URL = os.environ.get("LINE_LIFF_URL", "https://liff.line.me/YOUR_LIFF_ID")

# Google Sheets Scopes
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

def get_gspread_client():
    creds_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if creds_json:
        creds_data = json.loads(creds_json)
        creds = Credentials.from_service_account_info(creds_data, scopes=SCOPES)
    else:
        creds = Credentials.from_service_account_file("credentials.json", scopes=SCOPES)
    return gspread.authorize(creds)

def build_flex_message(top10):
    """
    Builds the LINE Flex Message bubble JSON payload for the Top 10 leaderboard.
    """
    rows = []
    for player in top10:
        rank = player["Rank"]
        name = player["Full_Name"]
        pts = player["Total_Points"]
        
        # Award medal emojis for top 3
        if rank == 1:
            rank_display = "🥇"
            weight = "bold"
            color = "#F59E0B"
        elif rank == 2:
            rank_display = "🥈"
            weight = "bold"
            color = "#9CA3AF"
        elif rank == 3:
            rank_display = "🥉"
            weight = "bold"
            color = "#B45309"
        else:
            rank_display = f" {rank} "
            weight = "regular"
            color = "#FFFFFF"

        # Create row box
        rows.append({
            "type": "box",
            "layout": "horizontal",
            "margin": "sm",
            "contents": [
                {
                    "type": "text",
                    "text": rank_display,
                    "size": "md",
                    "align": "start",
                    "flex": 2,
                    "color": color
                },
                {
                    "type": "text",
                    "text": name,
                    "size": "sm",
                    "align": "start",
                    "flex": 6,
                    "weight": weight,
                    "color": "#E2E8F0"
                },
                {
                    "type": "text",
                    "text": f"{pts} แต้ม",
                    "size": "sm",
                    "align": "end",
                    "flex": 4,
                    "weight": "bold",
                    "color": "#F59E0B"
                }
            ]
        })
        
        # Append divider between items except the last one
        if player != top10[-1]:
            rows.append({
                "type": "separator",
                "margin": "md",
                "color": "#334155"
            })

    # Return the full bubble structure
    bubble = {
        "type": "bubble",
        "size": "giga",
        "styles": {
            "header": { "backgroundColor": "#0F172A" },
            "body": { "backgroundColor": "#1E293B" },
            "footer": { "backgroundColor": "#0F172A" }
        },
        "header": {
            "type": "box",
            "layout": "vertical",
            "align": "center",
            "contents": [
                {
                    "type": "text",
                    "text": "🏆 LEADERBOARD TOP 10",
                    "weight": "bold",
                    "size": "xl",
                    "color": "#F59E0B"
                },
                {
                    "type": "text",
                    "text": "อันดับทายผลบอลโลก 2026 ประจำวัน",
                    "size": "xs",
                    "color": "#94A3B8",
                    "margin": "xs"
                }
            ]
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": rows
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "button",
                    "action": {
                        "type": "uri",
                        "label": "ทายผล / ดูอันดับตัวเอง",
                        "uri": LINE_LIFF_URL
                    },
                    "style": "primary",
                    "color": "#F59E0B"
                }
            ]
        }
    }
    return bubble

def broadcast_leaderboard():
    print("Reading leaderboard data...")
    gc = get_gspread_client()
    sh = gc.open_by_key(SPREADSHEET_ID)
    lead_sheet = sh.worksheet("Leaderboard")
    
    # Read rows
    data = lead_sheet.get_all_records()
    if not data:
        print("Leaderboard is empty. Skipping broadcast.")
        return
        
    # Get top 10 (sorted by Rank ascending)
    sorted_board = sorted(data, key=lambda x: int(x["Rank"]))
    top10 = sorted_board[:10]
    
    # Assemble LINE payload
    flex_bubble = build_flex_message(top10)
    payload = {
        "messages": [
            {
                "type": "flex",
                "altText": "🏆 ประกาศอันดับทายผลบอลโลก Top 10 ประจำวันนี้!",
                "contents": flex_bubble
            }
        ]
    }
    
    # Send Broadcast
    if not LINE_CHANNEL_ACCESS_TOKEN:
        print("LINE_CHANNEL_ACCESS_TOKEN is not set. Outputting Flex Message payload locally:")
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return
        
    url = "https://api.line.me/v2/bot/message/broadcast"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LINE_CHANNEL_ACCESS_TOKEN}"
    }
    
    print("Broadcasting LINE Flex message to OA followers...")
    response = requests.post(url, headers=headers, json=payload, timeout=15)
    
    if response.status_code == 200:
        print("Leaderboard broadcasted successfully!")
    else:
        print(f"Broadcast failed ({response.status_code}):", response.text)

if __name__ == "__main__":
    try:
        broadcast_leaderboard()
    except Exception as e:
        print("Broadcast execution failed:", e)
        exit(1)
