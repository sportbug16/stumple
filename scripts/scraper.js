import fs from 'fs';
import puppeteer from 'puppeteer';
import path from 'path';

// List of all active IPL franchises
const ACTIVE_IPL_TEAMS = new Set([
  "Chennai Super Kings", "Delhi Capitals", "Gujarat Titans", 
  "Kolkata Knight Riders", "Lucknow Super Giants", "Mumbai Indians", 
  "Punjab Kings", "Rajasthan Royals", "Royal Challengers Bengaluru", 
  "Sunrisers Hyderabad"
]);

// Mapping of older/alternative IPL team names
const IPL_TEAM_MAPPING = {
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
  "Deccan Chargers": "DC", // Often merged conceptually, but let's map to past
  "Pune Warriors": "PWI",
  "Kochi Tuskers Kerala": "KTK",
  "Rising Pune Supergiant": "RPS",
  "Rising Pune Supergiants": "RPS",
  "Gujarat Lions": "GL"
};

async function getPlayerUrls(page, recordUrl, maxPlayers) {
  await page.goto(recordUrl, { waitUntil: 'domcontentloaded' });
  
  return await page.evaluate((max) => {
    // Look for all links going to /cricketers/
    const links = Array.from(document.querySelectorAll('a[href^="/cricketers/"]'));
    // Ensure we capture unique URLs
    const uniqueLinks = [...new Set(links.map(a => a.href))];
    return uniqueLinks.slice(0, max);
  }, maxPlayers);
}

async function scrapePlayer(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    
    const data = await page.evaluate(() => {
      const script = document.querySelector('script#__NEXT_DATA__');
      if (!script) return null;
      return JSON.parse(script.textContent);
    });
    
    if (!data) return null;
    
    const playerInfo = data.props.pageProps.data.player;
    
    const name = playerInfo.fullName || '';
    const country = playerInfo.country?.name || '';
    
    // Age
    let age = 0;
    if (playerInfo.age) {
      const match = playerInfo.age.match(/(\d+)y/);
      if (match) age = parseInt(match[1]);
    }
    
    // Batting Hand
    const battingStyles = playerInfo.battingStyles || [];
    const battingHand = battingStyles.some(s => s.toLowerCase().includes('right')) ? "Right" : "Left";
    
    // Role
    const rolesList = playerInfo.playingRoles || [];
    const rawRole = rolesList.length > 0 ? rolesList[0].toLowerCase() : "unknown";
    let role = "Unknown";
    
    if (rawRole.includes("wicketkeeper")) role = "Wicketkeeper batter";
    else if (rawRole.includes("top-order") || rawRole.includes("opening")) role = "Top order batter";
    else if (rawRole.includes("middle-order")) role = "Middle order batter";
    else if (rawRole.includes("batting allrounder")) role = "Batting allrounder";
    else if (rawRole.includes("bowling allrounder")) role = "Bowling allrounder";
    else if (rawRole.includes("allrounder")) role = "Batting allrounder";
    else if (rawRole.includes("bowler")) {
      const bowlingStyles = playerInfo.bowlingStyles || [];
      const isSpin = bowlingStyles.some(s => {
        const lower = s.toLowerCase();
        return lower.includes("spin") || lower.includes("break") || lower.includes("orthodox");
      });
      role = isSpin ? "Spin bowler" : "Fast bowler";
    } else if (rawRole.includes("batter")) {
      role = "Middle order batter";
    }
    
    // Image
    let imageUrl = playerInfo.headshotImage?.url || playerInfo.image?.url || '';
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_320,q_50/lsci" + imageUrl;
    }
    
    // Retired
    const isRetired = playerInfo.isRetired || false;
    const retired = isRetired ? "Yes" : "No";
    
    // Teams
    let currentIplTeam = "None";
    const pastIplTeams = [];
    const teams = playerInfo.teams || [];
    
    for (const t of teams) {
      const teamName = t.team?.name || '';
      const isActive = t.isActive || false;
      
      if (IPL_TEAM_MAPPING[teamName]) {
        const mappedName = IPL_TEAM_MAPPING[teamName];
        if (isActive && ACTIVE_IPL_TEAMS.has(teamName)) {
          currentIplTeam = mappedName;
        } else {
          if (!pastIplTeams.includes(mappedName) && mappedName !== currentIplTeam) {
            pastIplTeams.push(mappedName);
          }
        }
      }
    }
    
    // Clean up past teams
    const filteredPastTeams = pastIplTeams.filter(t => t !== currentIplTeam);
    
    return {
      name, country, currentIplTeam, pastIplTeams: filteredPastTeams, age, retired, battingHand, role, image: imageUrl
    };
  } catch (err) {
    console.error(`Error processing ${url}:`, err.message);
    return null;
  }
}

async function main() {
  const BATTING_RECORDS = "https://www.espncricinfo.com/records/tournament/batting-most-runs-career/indian-premier-league-117";
  const BOWLING_RECORDS = "https://www.espncricinfo.com/records/tournament/bowling-most-wickets-career/indian-premier-league-117";
  
  console.log("Launching headless browser to bypass 403 blocks...");
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  console.log("Fetching top batters from IPL Statsguru...");
  const batterUrls = await getPlayerUrls(page, BATTING_RECORDS, 15);
  
  console.log("Fetching top bowlers from IPL Statsguru...");
  const bowlerUrls = await getPlayerUrls(page, BOWLING_RECORDS, 15);
  
  const allUrls = [...new Set([...batterUrls, ...bowlerUrls])];
  console.log(`Found ${allUrls.length} unique top IPL players. Starting extraction...`);

  // Load existing
  const playersPath = path.resolve('src/data/players.json');
  let existingPlayers = [];
  let startId = 1;
  
  try {
    const raw = fs.readFileSync(playersPath, 'utf8');
    existingPlayers = JSON.parse(raw);
    const ids = existingPlayers.map(p => parseInt(p.id)).filter(id => !isNaN(id));
    if (ids.length > 0) startId = Math.max(...ids) + 1;
  } catch {
    console.log("Could not read existing players.json, creating new.");
  }

  const existingNames = new Set(existingPlayers.map(p => p.name.toLowerCase()));
  const newPlayers = [];

  for (const url of allUrls) {
    const data = await scrapePlayer(page, url);
    if (data) {
      if (existingNames.has(data.name.toLowerCase())) {
        console.log(`Skipping ${data.name} (already in DB)`);
        continue;
      }
      data.id = String(startId++);
      // Reorder keys
      const ordered = { id: data.id, ...data };
      newPlayers.push(ordered);
      existingNames.add(data.name.toLowerCase());
      console.log(`Added: ${data.name}`);
    }
  }

  if (newPlayers.length > 0) {
    existingPlayers.push(...newPlayers);
    fs.writeFileSync(playersPath, JSON.stringify(existingPlayers, null, 2));
    console.log(`Successfully added ${newPlayers.length} new players to src/data/players.json!`);
  } else {
    console.log("No new players added.");
  }

  await browser.close();
}

main().catch(console.error);
