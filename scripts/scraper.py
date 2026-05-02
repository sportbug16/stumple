import json
import re
import urllib.request
from html.parser import HTMLParser

# List of all active IPL franchises
ACTIVE_IPL_TEAMS = {
    "Chennai Super Kings", "Delhi Capitals", "Gujarat Titans", 
    "Kolkata Knight Riders", "Lucknow Super Giants", "Mumbai Indians", 
    "Punjab Kings", "Rajasthan Royals", "Royal Challengers Bengaluru", 
    "Sunrisers Hyderabad"
}

# Mapping of older/alternative IPL team names
IPL_TEAM_MAPPING = {
    "Royal Challengers Bangalore": "RCB",
    "Royal Challengers Bengaluru": "RCB",
    "Chennai Super Kings": "CSK",
    "Delhi Capitals": "DC",
    "Delhi Daredevils": "DC",
    "Gujarat Titans": "GT",
    "Kolkata Knight Riders": "KKR",
    "Lucknow Super Giants": "LSG",
    "Mumbai Indians": "MI",
    "Punjab Kings": "PBKS",
    "Kings XI Punjab": "PBKS",
    "Rajasthan Royals": "RR",
    "Sunrisers Hyderabad": "SRH",
    "Deccan Chargers": "DCG", # Historical
    "Pune Warriors": "PWI",
    "Kochi Tuskers Kerala": "KTK",
    "Rising Pune Supergiant": "RPS",
    "Rising Pune Supergiants": "RPS",
    "Gujarat Lions": "GL"
}

def extract_json_from_html(html_content):
    """
    ESPNcricinfo stores most of the page data in a __NEXT_DATA__ JSON script tag.
    This function uses a simple regex to extract and parse that JSON.
    """
    match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html_content)
    if match:
        return json.loads(match.group(1))
    return None

def parse_player_data(url):
    print(f"Fetching {url} ...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        response = urllib.request.urlopen(req)
        html = response.read().decode('utf-8')
    except Exception as e:
        print(f"Error fetching URL: {e}")
        return None

    data = extract_json_from_html(html)
    if not data:
        print("Could not find __NEXT_DATA__ block. The page structure might have changed.")
        return None

    # The JSON structure usually contains the page props.
    # Digging into the __NEXT_DATA__ structure
    try:
        player_info = data['props']['pageProps']['data']['player']
        
        name = player_info.get('fullName', '')
        country = player_info.get('country', {}).get('name', '')
        
        # Calculate Age
        age_str = player_info.get('age', '')
        # age usually comes as "35y 180d"
        age = 0
        if age_str:
            age_match = re.search(r'(\d+)y', age_str)
            if age_match:
                age = int(age_match.group(1))

        # Batting Hand
        batting_styles = player_info.get('battingStyles', [])
        batting_hand = "Right" if any('right' in style.lower() for style in batting_styles) else "Left"

        # Role Mapping
        roles = player_info.get('playingRoles', [])
        raw_role = roles[0].lower() if roles else "unknown"
        role = "Unknown"
        
        if "wicketkeeper" in raw_role:
            role = "Wicketkeeper batter"
        elif "top-order" in raw_role or "opening" in raw_role:
            role = "Top order batter"
        elif "middle-order" in raw_role:
            role = "Middle order batter"
        elif "batting allrounder" in raw_role:
            role = "Batting allrounder"
        elif "bowling allrounder" in raw_role:
            role = "Bowling allrounder"
        elif "allrounder" in raw_role:
            role = "Batting allrounder" # Default to batting if unspecified
        elif "bowler" in raw_role:
            # Check bowling style to determine spin vs fast
            bowling_styles = player_info.get('bowlingStyles', [])
            is_spin = False
            for style in bowling_styles:
                style_lower = style.lower()
                if "spin" in style_lower or "break" in style_lower or "orthodox" in style_lower:
                    is_spin = True
                    break
            role = "Spin bowler" if is_spin else "Fast bowler"
        elif "batter" in raw_role:
            role = "Middle order batter" # default fallback

        # Teams
        teams = player_info.get('teams', [])
        current_ipl_team = "None"
        past_ipl_teams = []
        
        for t in teams:
            team_name = t.get('team', {}).get('name', '')
            is_active = t.get('isActive', False)
            
            # Check if this team is an IPL team
            if team_name in IPL_TEAM_MAPPING:
                mapped_name = IPL_TEAM_MAPPING[team_name]
                if is_active and team_name in ACTIVE_IPL_TEAMS:
                    current_ipl_team = mapped_name
                else:
                    if mapped_name not in past_ipl_teams and mapped_name != current_ipl_team:
                        past_ipl_teams.append(mapped_name)

        # In case current_ipl_team was wrongly set or a past team is currently active but player is not in it
        if current_ipl_team in past_ipl_teams:
            past_ipl_teams.remove(current_ipl_team)

        # Image
        image_url = player_info.get('headshotImage', {}).get('url', '')
        if not image_url:
            image_url = player_info.get('image', {}).get('url', '')

        # Retired
        # Inferring retirement: if not active in international teams, or over 38... (ESPNcricinfo has isRetired but might not be explicitly top-level)
        is_retired = player_info.get('isRetired', False)
        retired = "Yes" if is_retired else "No"

        return {
            "name": name,
            "country": country,
            "currentIplTeam": current_ipl_team,
            "pastIplTeams": past_ipl_teams,
            "age": age,
            "retired": retired,
            "battingHand": batting_hand,
            "role": role,
            "image": "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_320,q_50/lsci" + image_url if image_url and not image_url.startswith("http") else image_url
        }

    except KeyError as e:
        print(f"Error extracting data from JSON: {e}")
        return None

def main():
    # Provide the ESPNCricinfo profile URLs of the players you want to scrape here:
    player_urls = [
        "https://www.espncricinfo.com/cricketers/shubman-gill-1070173",
        "https://www.espncricinfo.com/cricketers/travis-head-530011",
        "https://www.espncricinfo.com/cricketers/heinrich-klaasen-436757"
    ]

    new_players = []
    
    # Optional: Load existing players to auto-increment ID
    existing_players = []
    try:
        with open('src/data/players.json', 'r') as f:
            existing_players = json.load(f)
            start_id = max([int(p['id']) for p in existing_players]) + 1 if existing_players else 1
    except FileNotFoundError:
        start_id = 1

    for idx, url in enumerate(player_urls):
        data = parse_player_data(url)
        if data:
            data['id'] = str(start_id + idx)
            # Reorder keys to put ID first
            ordered_data = {'id': data['id'], **data}
            new_players.append(ordered_data)

    if new_players:
        print(json.dumps(new_players, indent=2))
        
        # Automatically append to players.json
        existing_players.extend(new_players)
        with open('src/data/players.json', 'w') as f:
            json.dump(existing_players, f, indent=2)

if __name__ == "__main__":
    main()
