# CFB Dynasty: Design Spec

**Date:** 2026-11-16
**Status:** Approved in brainstorming, awaiting spec review

## Summary

CFB Dynasty is a browser-based college football franchise game, similar to a franchise mode in Madden. You are the head coach of a real college program. You manage a roster of fictional, randomly generated players, set the depth chart and weekly game plan, recruit high school prospects, work the transfer portal with an NIL budget, and develop players across many seasons.

Games are simulated. For each game you choose one of two modes:
- **Sim to end:** an instant result.
- **Coach key moments:** a live play-by-play feed that pauses on important snaps so you can call the play.

## Goals

- A replayable, multi-season franchise loop: season, postseason, offseason, next season.
- Coaching decisions (depth chart, game plan, play calls, recruiting, portal) visibly change outcomes. Roster strength still matters most.
- Runs in any modern browser with nothing to install, and can be published on GitHub Pages.

## Non-goals (first version)

- No logos, trademarked mascots, or real player names. Players are always fictional.
- No full playbook of named formations and plays.
- No graphics beyond a simple field-position bar.
- No multiplayer, online leagues or accounts.
- No conferences outside the Power 4, and no FCS schools.

## Platform and technology

- Plain HTML, CSS and JavaScript ES modules. No framework, build step or dependencies, because Node.js is not installed and isn't required.
- The game logic (`src/engine/`) is pure JavaScript with no access to the page, and is tested separately from the screens (`src/ui/`).
- The game saves in the browser's `localStorage`. It saves automatically after every action, and export/import to a JSON file lets you back up a save.
- Published as the public GitHub repository `cfb-dynasty`, with GitHub Pages serving the `main` branch root. Publishing happens only when the user says so.

## 1. League and players

### Teams
There are 68 schools, using real names and conferences, with no logos or mascots:

- **SEC (16):** Alabama, Arkansas, Auburn, Florida, Georgia, Kentucky, LSU, Ole Miss, Mississippi State, Missouri, Oklahoma, South Carolina, Tennessee, Texas, Texas A&M, Vanderbilt
- **Big Ten (18):** Illinois, Indiana, Iowa, Maryland, Michigan, Michigan State, Minnesota, Nebraska, Northwestern, Ohio State, Oregon, Penn State, Purdue, Rutgers, UCLA, USC, Washington, Wisconsin
- **Big 12 (16):** Arizona, Arizona State, Baylor, BYU, Cincinnati, Colorado, Houston, Iowa State, Kansas, Kansas State, Oklahoma State, TCU, Texas Tech, UCF, Utah, West Virginia
- **ACC (17):** Boston College, California, Clemson, Duke, Florida State, Georgia Tech, Louisville, Miami, NC State, North Carolina, Pittsburgh, SMU, Stanford, Syracuse, Virginia, Virginia Tech, Wake Forest
- **Independent (1):** Notre Dame

Each team has:
- `id`, `name`, `short` (an abbreviation, e.g. "OSU"), `conference`
- `colors`: primary and secondary hex values, used only as interface accents
- `state`: used for recruiting distance
- `prestige`: 1–5, seeded from real program reputation. It drifts each offseason, up or down by at most 1, based on wins against expectations and postseason results.

### Players
Every player is fictional and generated from a seeded random number generator.

- `id`, `firstName`, `lastName`, `position`, `classYear` (FR/SO/JR/SR), `redshirted` (true or false), `homeState`
- `overall` (40–99) and `potential` (40–99, at least `overall`)
- Position attributes, each 40–99:
  - **QB:** accuracy, arm, decision-making
  - **RB:** speed, power, vision
  - **WR and TE:** speed, hands, route running (plus blocking for TE)
  - **OL:** pass blocking, run blocking
  - **DL:** pass rush, run stop
  - **LB:** run stop, coverage, pass rush
  - **CB and S:** coverage, speed, tackling
  - **K and P:** power, accuracy
- `overall` is calculated from the position attributes.
- `injury`: weeks remaining (0 means healthy)
- `morale`: 0–100, which affects the chance of entering the transfer portal
- `nil`: the current yearly NIL deal amount
- Season and career stats

**Roster size:** 70–85 players per team, never more than 85. The minimum count at each position is:

| Position | Minimum |
|---|---|
| QB | 3 |
| RB | 4 |
| WR | 6 |
| TE | 3 |
| OL | 9 |
| DL | 8 |
| LB | 6 |
| CB | 5 |
| S | 4 |
| K | 1 |
| P | 1 |

A starting roster's average overall scales with prestige: a 5-star program averages about 78 among its starters, and a 1-star program about 62.

### Coach
- `name`, `teamId`
- `jobSecurity`: 0–100, starting at 60
- Career record and history of seasons coached

**Expectations:** each season the program expects a number of wins based on its prestige:

| Prestige | Expected wins |
|---|---|
| 1 | 4 |
| 2 | 5 |
| 3 | 7 |
| 4 | 9 |
| 5 | 10 |

Beating expectations, conference titles and playoff appearances raise job security; falling short lowers it.

**Firing:** if job security reaches 0 at the end of a season, the coach is fired. You then get 2–3 job offers from schools whose prestige is the same or lower and continue with whichever you choose.

### New franchise
1. Enter a coach name.
2. Pick a school, from a list showing each school's prestige.
3. Optionally enter a seed (otherwise one is chosen at random).
4. The game generates the league, all rosters, the schedule and the first recruit class.

The same seed with the same choices produces the same league.

## 2. Season and game simulation

### Schedule
- 12 regular-season games per team, all within the 68-team league:
  - SEC, Big Ten and Big 12 teams play 9 conference games and 3 non-conference games.
  - The ACC has 17 teams, so 9 conference games each is mathematically impossible. ACC teams play 8 conference games and 4 non-conference games, as the real ACC does.
  - Notre Dame plays 12 non-conference games.
- Every team plays exactly 12 games, and nobody plays the same opponent twice in the regular season.
- Each game is assigned home and away, balanced to 5–7 home games per team.
- The regular season spans 14–15 weeks, so each team gets 2–3 bye weeks. This is needed to fit every team's 12 games without anyone playing twice in a week.
- Non-conference games are scheduled first, so they mostly fall early in the season.
- A new schedule is generated each season.

### Rankings
- A Top 25 is calculated each week from a power score combining win percentage, strength of schedule and average scoring margin (capped at 28 per game).
- The same formula sets the end-of-season ranking used for playoff seeding.

### Postseason
1. **Conference championships:** the two teams with the best conference record in each of the four conferences play each other. Ties are broken by head-to-head result, then power score.
2. **12-team playoff:**
   - All four conference champions qualify automatically.
   - The other 8 spots go to the highest-ranked remaining teams, including Notre Dame.
   - The four conference champions are seeds 1–4, ordered by ranking, and get first-round byes. The other 8 teams are seeded 5–12 by ranking.
   - In the first round, 5 plays 12, 6 plays 11, 7 plays 10 and 8 plays 9, with the higher seed at home.
   - The quarterfinals, semifinals and final are played at neutral sites.
3. **Bowls:** teams that don't make the playoff and finish 6–6 or better are paired by ranking into bowl games at neutral sites. Bowl names are generic, e.g. "Sunshine Bowl".

### Game engine (`sim.js`)
One play-by-play engine drives both game modes.

**Game state:**
- Quarter (4 quarters of 15 minutes) and game clock
- Possession, ball position (1–99), down and distance
- Score, timeouts (3 per half), and a log of plays

Overtime uses the college format: each team gets the ball at the opponent's 25. From the third overtime, teams alternate two-point attempts.

**Each play:**
1. The offense and defense each choose a call. The computer chooses for computer-run teams. It also chooses for your team in Sim to end mode, and on non-key snaps in Coach key moments.
2. The engine works out matchup strengths from the starters on the depth chart:
   - **Pass protection:** offensive line pass blocking against the defensive line and linebackers' pass rush
   - **Coverage:** receivers against cornerbacks and safeties
   - **Run game:** offensive line run blocking plus the running back against the defensive line and linebackers' run stop
   - **Quarterback:** affects completions and interceptions
3. The result is drawn from probability distributions shaped by the play call, matchups, game plan and tempo. Possible results include yards gained, completion, sack, interception, fumble, touchdown and injury.
4. The clock runs off based on the result and tempo.

**Play calls:**
- **Offense:** Inside Run, Outside Run, Quick Pass, Deep Pass, Play Action, Screen, QB Sneak, Punt, Field Goal (plus extra point or two-point try after a touchdown)
- **Defense:** Base, Run Stop, Blitz, Cover 2, Man Press, Prevent

**Call matchup table:** a fixed table gives a modifier for each offensive call against each defensive call, between about −15% and +15% on success odds. Examples:
- Screen against Blitz: bonus for the offense
- Deep Pass against Prevent: penalty for the offense
- Inside Run against Run Stop: penalty for the offense
- Play Action against Run Stop: bonus for the offense

**Balance targets:** call modifiers are deliberately smaller than the effect of a large gap in player ratings.

**Computer play-calling:** chosen by down, distance, field position, score, time remaining and the team's game plan style. This includes 4th-down decisions, with realistic choices to go for it, kick a field goal or punt.

**Realism targets** (checked by tests over 1,000 games between evenly matched teams):

| Measure | Target |
|---|---|
| Points per team | 20–35 on average |
| Total yards per team | 320–480 on average |
| Turnovers per game | 1.5–4 on average |
| Home team win rate | 52–60% |

A team that is about 15 overall points better wins 80–95% of games.

**Output of a finished game:**
- Final score and scoring by quarter
- Team stats: yards, first downs, turnovers, time of possession, third-down conversions
- Player stat lines
- 5–8 highlights, chosen from touchdowns, turnovers, long plays and key 4th downs

### Game modes
- **Sim to end:** runs the whole game instantly and goes straight to the results screen.
- **Coach key moments:**
  - The play feed scrolls, with a short delay between plays and a speed control (1x, 2x, 4x, or skip to the next decision).
  - The game pauses for your call when your team is on offense or defense and any of these is true:
    - It is 4th down.
    - The ball is inside the opponent's 20 (on offense) or your own 20 (on defense).
    - It is 3rd down with 7 or more yards to go.
    - It is a two-point try.
    - It is the last 2:00 of the 2nd or 4th quarter, or overtime, in a one-score game (8 points or fewer).
  - Each pause shows the down and distance, field position, score and clock, the opponent's tendency for this situation, and the call buttons.
  - Every other snap is called by the computer using your game plan.
  - A **Sim rest of game** button is always available.
- **Other games:** every game not involving your team uses Sim to end. They run in a batch when you advance the week.

## 3. Weekly coaching

### Depth chart
- One list per position group. You reorder players with up/down buttons (and drag-and-drop where the browser supports it).
- **Starters per position:**

| Position | Starters |
|---|---|
| QB | 1 |
| RB | 1 |
| WR | 3 |
| TE | 1 |
| OL | 5 |
| DL | 4 |
| LB | 3 |
| CB | 2 |
| S | 2 |
| K | 1 |
| P | 1 |

- **Rotation:** one extra RB, WR and DL get some snaps.
- **Auto-fill best:** sorts each position by overall rating, skipping injured players.
- **Injuries:** injured players can't start. If a starter is injured, the engine uses the next healthy player and adds a news item.
- Computer-run teams auto-fill their depth chart every week.

### Game plan
- **Offensive style:** Balanced, Run Heavy, Pass Heavy or Air Raid. It sets the computer's mix of run and pass calls, and gives about a +3% success bonus to the favored plays.
- **Defensive style:** Balanced, Stop the Run, Aggressive Blitz or Bend Don't Break. It sets the computer's mix of defensive calls, with a similar small bonus.
- **Tempo:** Normal or Hurry-Up. Hurry-Up takes less time off the clock per play (about 15–20% more plays) and slightly raises fumble risk.
- **Scouting card:** shows the opponent's record, ranking, top 3 players, average overall, and preferred styles.

### Injuries
- Each play has a small chance of injury, scaled by play type.
- Injuries last 1–6 weeks, with shorter injuries much more common.
- Injuries heal by 1 week after each game.

### Weekly loop
1. Review your team, the scouting card, depth chart and game plan.
2. Spend recruiting points.
3. Play your game, choosing Sim to end or Coach key moments.
4. Advance the week. All other games simulate, rankings update, recruiting resolves, injuries heal, and the news feed updates.

## 4. Recruiting, progression, transfer portal and NIL

### Recruiting
- **Recruit class:** about 1,500 prospects generated each year.
- **Star ratings and true potential:**

| Stars | Share of class | Potential |
|---|---|---|
| 5 | 2% | 85–99 |
| 4 | 10% | 75–90 |
| 3 | 40% | 65–82 |
| 2 | 30% | 55–72 |
| 1 | 18% | 45–62 |

  About 5% of 2-star and 3-star prospects are hidden gems with potential above their range.
- **Prospect details:** each prospect has a position, home state, a starting overall of about 45–75, and 2–3 priorities chosen from:
  - **Playing time:** fewer players ahead of them at their position
  - **Prestige:** the school's prestige
  - **Proximity:** the school is in or near their home state
  - **Contender:** the school is ranked
  - **NIL:** an NIL promise
- **Recruiting board:** up to 30 prospects.
- **Weekly points:** 50 + 10 × prestige.
- **Actions:**

| Action | Cost | Interest gained | Limit |
|---|---|---|---|
| Phone call | 5 points | +3 | — |
| Campus visit | 20 points | +12 | 3 per week, home weeks only |
| Scholarship offer | free | +5 once, and allows a commitment | 25 offers open at a time |

- **Interest:** interest gained is multiplied by how well your school fits the prospect's priorities, from 0.7 to 1.4.
- **Computer schools:** they recruit with the same rules and point budgets, aiming for prospects at the positions they need and at their prestige level.
- **Commitment:** a prospect commits when their interest in one school is at least 100, the school has offered them, and that interest leads the next school by at least 20.
  - A committed prospect can decommit (a 5% chance per week) if another school gets within 10.
- **Signing Day** (offseason): committed prospects join their rosters as freshmen. Uncommitted prospects go to the school with the highest interest that has an offer and roster room, or go unsigned.
- **Scouting:** your view of a prospect's star rating and potential starts as a range, and narrows as you spend points on them. Full accuracy comes after 40 points spent on that prospect.

### Progression (offseason)
- **Rating change per year:** a base by class year (FR +4, SO +3, JR +2, SR +1), plus a playing-time bonus of up to +3, plus random variation of −2 to +3. Ratings can't go above potential.
- **Redshirts:** a player who appeared in 4 or fewer games can be redshirted, which keeps their class year for another season. This happens automatically for unused freshmen, and you can toggle it.
- **Graduation:** seniors who aren't redshirted graduate.
- **NFL draft:** juniors and redshirt sophomores rated 85 or higher may declare early. The chance rises from about 30% at 85 to about 90% at 95+.

### Transfer portal and NIL
- **NIL budget:** each school gets a yearly budget of 1,000,000 × prestige, plus 250,000 × playoff wins, in in-game dollars.
- **Morale:**
  - **Goes down:** not starting, few snaps, losing seasons
  - **Goes up:** starting, winning, an NIL deal
- **Portal entry:** players with morale under 40 have a 25–60% chance of entering the portal, and backups are more likely.
- **Your players:**
  - Before the portal opens, your at-risk players show a warning.
  - **Keep them:** offer an NIL deal (which raises morale by the amount offered compared to their value) or promise them a starting role. A broken promise causes a large morale drop the next season.
- **Portal rounds:** there are 3 rounds.
  - Each round, you place NIL and playing-time offers on portal players, and computer-run schools do the same.
  - Each player picks the best offer when compared against their priorities, or waits for the next round.
  - Players left unsigned after round 3 stay at their old school with low morale.
- **Roster cap:** before the new season starts, every roster must be 85 or under. You release players through a "Cut" action. Computer-run teams cut their lowest-rated players automatically.

### Offseason order
1. Bowls and playoff finish, prestige updates, and job security is evaluated (with firing and job offers if needed).
2. Graduation and NFL draft declarations.
3. Retention warnings, then the 3 transfer portal rounds.
4. Signing Day.
5. Progression and redshirt decisions.
6. Roster cuts down to 85.
7. New NIL budgets, new recruit class, new schedule, and the new season begins.

## 5. Screens, code structure and testing

### Screens
- **Navigation:** Home, Roster, Depth Chart, Game Plan, Schedule, Rankings, Recruiting, Portal (offseason only), Settings.
- **Home:** your record and ranking, job security meter, next opponent with scouting card, the **Play Game** button (with a choice of mode), an **Advance** button, and a news feed.
- **Roster:** a sortable table with position, name, class, overall, potential, injury, morale and NIL. Clicking a player shows their full ratings and stats.
- **Game screen:** a scoreboard, a field bar showing the ball's position, the play feed, a speed control, and the call panel during pauses.
- **Results screen:** the box score and highlights.
- **Schedule:** your schedule and results, plus a week-by-week view of the whole league.
- **Rankings:** the Top 25 and conference standings.
- **Recruiting:** your board, a prospect search with filters by position, stars and state, actions, and commitments.
- **Portal:** the retention panel and the portal player list with offers.
- **Settings:** export save, import save, new franchise, and delete save (with confirmation).
- **Look:** a dark sports-dashboard style, with your school's colors as accents. The layout is responsive and works on phones.

### Code structure
```
cfb-dynasty/
  index.html
  styles.css
  src/
    main.js            # startup, router, autosave
    save.js            # localStorage save/load, export/import, version check
    data/teams.js      # 68 teams: conference, colors, state, prestige
    data/names.js      # first and last name lists, bowl names
    engine/rng.js      # seeded random number generator (mulberry32) and helpers
    engine/players.js  # player and prospect generation, overall formula
    engine/league.js   # new league, rosters, depth chart auto-fill
    engine/schedule.js # season schedule generation
    engine/sim.js      # play-by-play game engine and AI play-calling
    engine/season.js   # week advance, standings, rankings, postseason
    engine/recruiting.js
    engine/offseason.js # progression, draft, portal and NIL, prestige, coach evaluation
    ui/*.js            # one module per screen, plus shared components
  tests/
    tests.html         # browser test runner
    *.test.js          # engine tests
  docs/superpowers/specs/
```

The engine modules never touch the page or browser storage. All game state lives in one plain, JSON-serializable `state` object, and engine functions take the state and return or modify it.

### Save handling
- Saves include a `version` number.
- To keep saves under the browser's storage limit (about 5 MB), only your team's games keep the full box score. Every other game stores just the score and whether it went to overtime.
- If a save fails to parse, is missing required fields, or has an unknown version, the game doesn't crash. It shows a message offering to import a backup or start a new franchise.
- The broken save is kept under a backup key rather than deleted.
- If browser storage is unavailable (for example in a private window), the game runs without saving and shows a banner.

### Testing
- Engine tests live in `tests/*.test.js` and run in `tests/tests.html`, using a tiny built-in assertion runner. They are written before the code they test (TDD).
- **Required tests:**
  - **RNG:** the same seed gives the same sequence.
  - **League:** 68 teams, every roster meets the position minimums and has 85 or fewer players, and prestige scales roster strength.
  - **Schedule:** every team has 12 games with no repeats, 9 conference games (except Notre Dame), and balanced home/away.
  - **Simulation:** results are deterministic for a given seed, the realism targets above are met, the much-better team wins 80–95% of the time, and call matchups shift success rates in the expected direction.
  - **Postseason:** conference champions are correct, playoff qualifiers and seeding follow the rules, and the bracket is played through to a single champion.
  - **Recruiting:** the commitment rule works, Signing Day respects roster room, and scouting ranges narrow as points are spent.
  - **Offseason:** progression respects potential, graduation and redshirt rules work, portal offers resolve, and rosters end at 85 or fewer.
  - **Save:** a save round-trips through JSON and back, and a broken save is detected.
- The screens are checked by hand in Chrome.
