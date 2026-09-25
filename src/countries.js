// src/countries.js — the world's countries (ISO 3166 short English names) and
// common spellings people type, so "UAE", "KSA" or "U.K." all match one name.
// Shared with the browser via /js/countries.js (same list).
const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria',
  'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan',
  'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia',
  'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica',
  "Côte d'Ivoire", 'Croatia', 'Cuba', 'Cyprus', 'Czechia', 'Democratic Republic of the Congo', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland',
  'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea',
  'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran',
  'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati',
  'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein',
  'Lithuania', 'Luxembourg', 'Macau', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands',
  'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique',
  'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea',
  'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru',
  'Philippines', 'Poland', 'Portugal', 'Puerto Rico', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia',
  'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'São Tomé and Príncipe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore',
  'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan',
  'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo',
  'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom',
  'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe'
];

// Other names/spellings → the name above (lower-case keys, dots/extra spaces ignored).
const ALIASES = {
  'uae': 'United Arab Emirates', 'u a e': 'United Arab Emirates', 'emirates': 'United Arab Emirates', 'dubai': 'United Arab Emirates', 'abu dhabi': 'United Arab Emirates',
  'ksa': 'Saudi Arabia', 'saudi': 'Saudi Arabia', 'kingdom of saudi arabia': 'Saudi Arabia',
  'uk': 'United Kingdom', 'u k': 'United Kingdom', 'great britain': 'United Kingdom', 'britain': 'United Kingdom', 'england': 'United Kingdom', 'scotland': 'United Kingdom', 'wales': 'United Kingdom', 'northern ireland': 'United Kingdom',
  'usa': 'United States', 'us': 'United States', 'u s': 'United States', 'u s a': 'United States', 'america': 'United States', 'united states of america': 'United States', 'usa / canada': 'United States',
  'south korea': 'South Korea', 'korea': 'South Korea', 'republic of korea': 'South Korea', 'north korea': 'North Korea',
  'russian federation': 'Russia', 'viet nam': 'Vietnam', 'lao': 'Laos', 'czech republic': 'Czechia', 'holland': 'Netherlands', 'the netherlands': 'Netherlands',
  'turkiye': 'Turkey', 'türkiye': 'Turkey', 'swaziland': 'Eswatini', 'cape verde': 'Cabo Verde', 'ivory coast': "Côte d'Ivoire", 'cote divoire': "Côte d'Ivoire",
  'burma': 'Myanmar', 'east timor': 'Timor-Leste', 'macedonia': 'North Macedonia', 'drc': 'Democratic Republic of the Congo', 'dr congo': 'Democratic Republic of the Congo',
  'republic of the congo': 'Congo', 'palestinian territories': 'Palestine', 'state of palestine': 'Palestine', 'vatican': 'Vatican City', 'holy see': 'Vatican City',
  'sao tome and principe': 'São Tomé and Príncipe', 'bosnia': 'Bosnia and Herzegovina', 'trinidad': 'Trinidad and Tobago', 'the gambia': 'Gambia', 'the bahamas': 'Bahamas',
  'hongkong': 'Hong Kong', 'macao': 'Macau', 'brunei darussalam': 'Brunei', 'syrian arab republic': 'Syria', 'iran islamic republic of': 'Iran', 'persia': 'Iran'
};

const key = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.'’]/g, '').replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const BY_KEY = new Map(COUNTRIES.map(c => [key(c), c]));
for (const [a, c] of Object.entries(ALIASES)) BY_KEY.set(key(a), c);

// Best-known country name for what someone typed; unknown text is kept (tidied) as-is.
function canonicalCountry(input) {
  const raw = String(input == null ? '' : input).replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!raw) return '';
  return BY_KEY.get(key(raw)) || raw;
}

module.exports = { COUNTRIES, ALIASES, canonicalCountry };
