const ua = "Mozilla/5.0";

async function main() {
  const wcLeagues = ["wm26", "wm_mueller", "wm2026", "wm2026_xlife"];
  
  for (const league of wcLeagues) {
    const url = "https://api.openligadb.de/getmatchdata/" + league + "/2026";
    const res = await fetch(url, { headers: { "User-Agent": ua } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        console.log("\n=== " + league + " (" + data.length + " matches) ===");
        const m = data[0];
        console.log("Match 1: " + m.team1?.teamName + " vs " + m.team2?.teamName);
        console.log("  Date: " + m.matchDateTimeUTC);
        console.log("  Score: " + JSON.stringify(m.matchResults));
        console.log("  Goals: " + (m.goals?.length || 0));
        if (m.goals?.length) {
          m.goals.forEach(function(g) {
            console.log("    " + g.matchMinute + "': " + g.goalGetterName + " (" + g.scoreTeam1 + "-" + g.scoreTeam2 + ") " + (g.comment || ""));
          });
        }
        
        // Mexico vs South Africa
        const mxsa = data.find(function(m) {
          const t1 = (m.team1?.teamName || "").toLowerCase();
          const t2 = (m.team2?.teamName || "").toLowerCase();
          return (t1.includes("mex") && t2.includes("south")) || (t2.includes("mex") && t1.includes("south")) ||
                 (t1.includes("mex") && t2.includes("afrika")) || (t2.includes("mex") && t1.includes("afrika"));
        });
        if (mxsa) {
          console.log("\n  MX vs SA: " + mxsa.team1?.teamName + " " + 
            (mxsa.matchResults?.[1]?.pointsTeam1 || mxsa.matchResults?.[0]?.pointsTeam1 || "?") + "-" + 
            (mxsa.matchResults?.[1]?.pointsTeam2 || mxsa.matchResults?.[0]?.pointsTeam2 || "?") + " " + mxsa.team2?.teamName);
          if (mxsa.goals?.length) {
            mxsa.goals.forEach(function(g) {
              console.log("    " + g.matchMinute + "': " + g.goalGetterName + " (" + g.scoreTeam1 + "-" + g.scoreTeam2 + ")");
            });
          }
        }
      } else {
        console.log(league + ": " + (Array.isArray(data) ? data.length + " matches" : "not array"));
      }
    } else {
      console.log(league + ": " + res.status);
    }
  }
}
main().catch(function(e) { console.error("Error:", e.message); });
