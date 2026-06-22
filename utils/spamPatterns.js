/**
 * Spam pattern definitions for bot detection
 */

const SPAM_PATTERNS = {
  // Discord scams and phishing
  discord_scam: [
    /discord\.gift/i,
    /discord\.com\/gifts/i,
    /free.*nitro/i,
    /steam.*nitro/i,
    /get.*nitro.*free/i,
    /claim.*nitro/i,
    /nitro.*gift/i
  ],

  // General phishing attempts
  phishing: [
    /claim.*prize/i,
    /verify.*account/i,
    /(click|tap).*here.*verify/i,
    /dm.*for.*(boost|free|gift)/i,
    /congrat.*won/i,
    /selected.*winner/i
  ],

  // Crypto and financial scams
  crypto_scam: [
    /airdrop/i,
    /free.*crypto/i,
    /double.*your/i,
    /invest.*guarantee/i,
    /100%.*profit/i,
    /get.*rich/i
  ],

  // Server promotion spam
  promotion_spam: [
    /check.*out.*server/i,
    /join.*my.*server/i,
    /dm.*for.*collab/i,
    /discord\.gg\/[\w-]+.*join/i
  ],

  // OnlyFans and adult content spam
  adult_spam: [
    /onlyfans/i,
    /adult.*content/i,
    /18\+.*link/i,
    /dm.*for.*pics/i
  ]
};

/**
 * Trusted domains that are safe to link
 */
const TRUSTED_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'twitter.com',
  'x.com',
  'twitch.tv',
  'robertsspaceindustries.com',
  'rsi.com',
  'starcitizen.tools',
  'erkul.games',
  'github.com',
  'reddit.com',
  'imgur.com',
  'gyazo.com',
  'streamable.com',
  'clips.twitch.tv',
  'spectrum.roberts'
];

/**
 * Suspicious URL patterns
 */
const SUSPICIOUS_URL_PATTERNS = [
  /discord.*nitro/i,
  /steam.*gift/i,
  /click.*verify/i,
  /bit\.ly/i,  // URL shorteners often used in spam
  /tinyurl/i,
  /goo\.gl/i,
  /shorte\.st/i
];

module.exports = {
  SPAM_PATTERNS,
  TRUSTED_DOMAINS,
  SUSPICIOUS_URL_PATTERNS
};
