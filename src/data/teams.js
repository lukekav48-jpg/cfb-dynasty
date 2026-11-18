// The 68 schools in the league. Colors are used only as interface accents.
// prestige: 1-5, seeded from program reputation.
export const CONFERENCES = ['SEC', 'Big Ten', 'Big 12', 'ACC', 'Independent'];

// [id, name, short, conference, state, prestige, primary, secondary]
const ROWS = [
  ['alabama', 'Alabama', 'BAMA', 'SEC', 'AL', 5, '#9E1B32', '#FFFFFF'],
  ['arkansas', 'Arkansas', 'ARK', 'SEC', 'AR', 2, '#9D2235', '#FFFFFF'],
  ['auburn', 'Auburn', 'AUB', 'SEC', 'AL', 3, '#0C2340', '#E87722'],
  ['florida', 'Florida', 'UF', 'SEC', 'FL', 4, '#0021A5', '#FA4616'],
  ['georgia', 'Georgia', 'UGA', 'SEC', 'GA', 5, '#BA0C2F', '#000000'],
  ['kentucky', 'Kentucky', 'UK', 'SEC', 'KY', 2, '#0033A0', '#FFFFFF'],
  ['lsu', 'LSU', 'LSU', 'SEC', 'LA', 4, '#461D7C', '#FDD023'],
  ['olemiss', 'Ole Miss', 'MISS', 'SEC', 'MS', 4, '#CE1126', '#14213D'],
  ['missst', 'Mississippi State', 'MSST', 'SEC', 'MS', 2, '#660000', '#FFFFFF'],
  ['missouri', 'Missouri', 'MIZ', 'SEC', 'MO', 3, '#F1B82D', '#000000'],
  ['oklahoma', 'Oklahoma', 'OU', 'SEC', 'OK', 4, '#841617', '#FDF9D8'],
  ['southcarolina', 'South Carolina', 'SC', 'SEC', 'SC', 3, '#73000A', '#000000'],
  ['tennessee', 'Tennessee', 'TENN', 'SEC', 'TN', 4, '#FF8200', '#FFFFFF'],
  ['texas', 'Texas', 'TEX', 'SEC', 'TX', 5, '#BF5700', '#FFFFFF'],
  ['texasam', 'Texas A&M', 'TAMU', 'SEC', 'TX', 4, '#500000', '#FFFFFF'],
  ['vanderbilt', 'Vanderbilt', 'VAN', 'SEC', 'TN', 2, '#866D4B', '#000000'],

  ['illinois', 'Illinois', 'ILL', 'Big Ten', 'IL', 3, '#E84A27', '#13294B'],
  ['indiana', 'Indiana', 'IU', 'Big Ten', 'IN', 3, '#990000', '#EEEDEB'],
  ['iowa', 'Iowa', 'IOWA', 'Big Ten', 'IA', 3, '#FFCD00', '#000000'],
  ['maryland', 'Maryland', 'MD', 'Big Ten', 'MD', 2, '#E03A3E', '#FFD520'],
  ['michigan', 'Michigan', 'MICH', 'Big Ten', 'MI', 5, '#00274C', '#FFCB05'],
  ['michiganst', 'Michigan State', 'MSU', 'Big Ten', 'MI', 3, '#18453B', '#FFFFFF'],
  ['minnesota', 'Minnesota', 'MINN', 'Big Ten', 'MN', 2, '#7A0019', '#FFCC33'],
  ['nebraska', 'Nebraska', 'NEB', 'Big Ten', 'NE', 3, '#E41C38', '#FDF2D9'],
  ['northwestern', 'Northwestern', 'NU', 'Big Ten', 'IL', 2, '#4E2A84', '#FFFFFF'],
  ['ohiostate', 'Ohio State', 'OSU', 'Big Ten', 'OH', 5, '#BB0000', '#666666'],
  ['oregon', 'Oregon', 'ORE', 'Big Ten', 'OR', 5, '#154733', '#FEE123'],
  ['pennstate', 'Penn State', 'PSU', 'Big Ten', 'PA', 4, '#041E42', '#FFFFFF'],
  ['purdue', 'Purdue', 'PUR', 'Big Ten', 'IN', 2, '#CEB888', '#000000'],
  ['rutgers', 'Rutgers', 'RUTG', 'Big Ten', 'NJ', 2, '#CC0033', '#5F6A72'],
  ['ucla', 'UCLA', 'UCLA', 'Big Ten', 'CA', 3, '#2D68C4', '#F2A900'],
  ['usc', 'USC', 'USC', 'Big Ten', 'CA', 4, '#990000', '#FFC72C'],
  ['washington', 'Washington', 'UW', 'Big Ten', 'WA', 4, '#4B2E83', '#B7A57A'],
  ['wisconsin', 'Wisconsin', 'WIS', 'Big Ten', 'WI', 3, '#C5050C', '#FFFFFF'],

  ['arizona', 'Arizona', 'ARIZ', 'Big 12', 'AZ', 2, '#CC0033', '#003366'],
  ['arizonast', 'Arizona State', 'ASU', 'Big 12', 'AZ', 3, '#8C1D40', '#FFC627'],
  ['baylor', 'Baylor', 'BAY', 'Big 12', 'TX', 3, '#154734', '#FFB81C'],
  ['byu', 'BYU', 'BYU', 'Big 12', 'UT', 3, '#002E5D', '#FFFFFF'],
  ['cincinnati', 'Cincinnati', 'CIN', 'Big 12', 'OH', 2, '#E00122', '#000000'],
  ['colorado', 'Colorado', 'COLO', 'Big 12', 'CO', 3, '#CFB87C', '#000000'],
  ['houston', 'Houston', 'HOU', 'Big 12', 'TX', 2, '#C8102E', '#FFFFFF'],
  ['iowast', 'Iowa State', 'ISU', 'Big 12', 'IA', 3, '#C8102E', '#F1BE48'],
  ['kansas', 'Kansas', 'KU', 'Big 12', 'KS', 2, '#0051BA', '#E8000D'],
  ['kansasst', 'Kansas State', 'KSU', 'Big 12', 'KS', 3, '#512888', '#FFFFFF'],
  ['oklahomast', 'Oklahoma State', 'OKST', 'Big 12', 'OK', 3, '#FF7300', '#000000'],
  ['tcu', 'TCU', 'TCU', 'Big 12', 'TX', 3, '#4D1979', '#FFFFFF'],
  ['texastech', 'Texas Tech', 'TTU', 'Big 12', 'TX', 3, '#CC0000', '#000000'],
  ['ucf', 'UCF', 'UCF', 'Big 12', 'FL', 2, '#BA9B37', '#000000'],
  ['utah', 'Utah', 'UTAH', 'Big 12', 'UT', 3, '#CC0000', '#FFFFFF'],
  ['westvirginia', 'West Virginia', 'WVU', 'Big 12', 'WV', 2, '#002855', '#EAAA00'],

  ['bostoncollege', 'Boston College', 'BC', 'ACC', 'MA', 2, '#8A100B', '#BC9B6A'],
  ['california', 'California', 'CAL', 'ACC', 'CA', 2, '#003262', '#FDB515'],
  ['clemson', 'Clemson', 'CLEM', 'ACC', 'SC', 4, '#F56600', '#522D80'],
  ['duke', 'Duke', 'DUKE', 'ACC', 'NC', 2, '#003087', '#FFFFFF'],
  ['floridast', 'Florida State', 'FSU', 'ACC', 'FL', 4, '#782F40', '#CEB888'],
  ['georgiatech', 'Georgia Tech', 'GT', 'ACC', 'GA', 2, '#B3A369', '#003057'],
  ['louisville', 'Louisville', 'LOU', 'ACC', 'KY', 3, '#AD0000', '#000000'],
  ['miami', 'Miami', 'MIA', 'ACC', 'FL', 4, '#F47321', '#005030'],
  ['ncstate', 'NC State', 'NCST', 'ACC', 'NC', 2, '#CC0000', '#FFFFFF'],
  ['northcarolina', 'North Carolina', 'UNC', 'ACC', 'NC', 3, '#7BAFD4', '#13294B'],
  ['pittsburgh', 'Pittsburgh', 'PITT', 'ACC', 'PA', 2, '#003594', '#FFB81C'],
  ['smu', 'SMU', 'SMU', 'ACC', 'TX', 3, '#C8102E', '#354CA1'],
  ['stanford', 'Stanford', 'STAN', 'ACC', 'CA', 2, '#8C1515', '#FFFFFF'],
  ['syracuse', 'Syracuse', 'SYR', 'ACC', 'NY', 2, '#F76900', '#000E54'],
  ['virginia', 'Virginia', 'UVA', 'ACC', 'VA', 2, '#232D4B', '#F84C1E'],
  ['virginiatech', 'Virginia Tech', 'VT', 'ACC', 'VA', 3, '#630031', '#CF4420'],
  ['wakeforest', 'Wake Forest', 'WAKE', 'ACC', 'NC', 2, '#9E7E38', '#000000'],

  ['notredame', 'Notre Dame', 'ND', 'Independent', 'IN', 5, '#0C2340', '#C99700'],
];

export const TEAMS = ROWS.map(([id, name, short, conference, state, prestige, primary, secondary]) => ({
  id, name, short, conference, state, prestige, colors: { primary, secondary },
}));

// Conference games per team. The ACC has 17 teams, so it plays 8 (as the real ACC does).
export const CONF_GAMES = { SEC: 9, 'Big Ten': 9, 'Big 12': 9, ACC: 8, Independent: 0 };
