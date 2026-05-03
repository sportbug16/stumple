export const IPL_TEAMS = {
  CSK: {
    name: "Chennai Super Kings",
    logo: "https://documents.iplt20.com/ipl/CSK/logos/Logooutline/CSKoutline.png"
  },
  DC: {
    name: "Delhi Capitals",
    logo: "https://documents.iplt20.com/ipl/DC/Logos/LogoOutline/DCoutline.png"
  },
  GT: {
    name: "Gujarat Titans",
    logo: "https://documents.iplt20.com/ipl/GT/Logos/Logooutline/GToutline.png"
  },
  KKR: {
    name: "Kolkata Knight Riders",
    logo: "https://documents.iplt20.com/ipl/KKR/Logos/Logooutline/KKRoutline.png"
  },
  LSG: {
    name: "Lucknow Super Giants",
    logo: "https://documents.iplt20.com/ipl/LSG/Logos/Logooutline/LSGoutline.png"
  },
  MI: {
    name: "Mumbai Indians",
    logo: "https://documents.iplt20.com/ipl/MI/Logos/Logooutline/MIoutline.png"
  },
  PBKS: {
    name: "Punjab Kings",
    logo: "https://documents.iplt20.com/ipl/PBKS/Logos/Logooutline/PBKSoutline.png"
  },
  RR: {
    name: "Rajasthan Royals",
    logo: "https://documents.iplt20.com/ipl/RR/Logos/Logooutline/RRoutline.png"
  },
  RCB: {
    name: "Royal Challengers Bengaluru",
    logo: "https://documents.iplt20.com/ipl/RCB/Logos/Logooutline/RCBoutline.png"
  },
  SRH: {
    name: "Sunrisers Hyderabad",
    logo: "https://documents.iplt20.com/ipl/SRH/Logos/Logooutline/SRHoutline.png"
  }
};

export function getIplTeamMeta(team) {
  if (!team || team === "None" || team === "Unknown") {
    return {
      name: "None",
      logo: null
    };
  }

  return IPL_TEAMS[team] ?? {
    name: team,
    logo: null
  };
}
