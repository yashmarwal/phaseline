/**
 * Phase AI: finds a stored answer for what the visitor typed (English and Hinglish), with no AI call.
 * An entry matches when every word of one of its rules is in the message. A word ending in * matches any word
 * that starts with it (pric* matches price and pricing). The entry with the most specific rule wins; ties go to
 * the higher priority. A long message that only matches on one word goes to the AI instead.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PhaseAIMatch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const normalize = (s) => ' ' + String(s).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9ऀ-ॿ ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';

  function find(text, entries) {
    const norm = normalize(text);
    const tokens = norm.trim().split(' ').filter(Boolean);
    if (!tokens.length) return null;
    const has = (term) => {
      if (term.endsWith('*')) { const p = term.slice(0, -1); return tokens.some((t) => t.startsWith(p)); }
      if (term.includes(' ')) return norm.includes(' ' + term + ' ');
      return tokens.includes(term);
    };

    let best = null;
    for (const e of entries) {
      if (e.choiceOnly) continue;
      if (e.maxTokens && tokens.length > e.maxTokens) continue;
      if ((e.not || []).some(has)) continue;
      let score = 0;
      for (const rule of e.rules) if (rule.every(has)) score = Math.max(score, rule.length);
      if (!score) continue;
      if (!best || score > best.score || (score === best.score && (e.priority || 0) > (best.entry.priority || 0))) best = { entry: e, score };
    }
    if (!best) return null;
    if (best.score === 1 && tokens.length > 9) return null; // a long, open question: better answered by the AI
    return best.entry;
  }

  // Roman-letter Hindi words that are not also common English words; one of them is enough to answer in Hinglish
  const HINGLISH = new Set(["kya", "kitna", "kitne", "kitni", "hai", "hain", "hoga", "hogi", "karna", "karni", "karte", "karta", "chahiye", "chahie", "mujhe", "mera", "meri", "mere", "aap", "aapka", "aapke", "tum", "tumhara", "kaise", "kab", "kahan", "kahaan", "nahi", "nahin", "haan", "wapas", "paise", "paisa", "baat", "kaam", "dikhao", "dikha", "lagega", "lagegi", "milega", "milegi", "banate", "banata", "banana", "banwa", "banwana", "banwani", "banwani", "batao", "bataiye", "chahta", "chahti", "liye", "mein", "kaun", "konsa", "kaunsa", "sahi", "jaldi", "hafte", "mahine", "shuru", "tayyar", "zaroor", "accha", "theek", "thik", "shukriya", "dhanyavad", "namaste", "kaha", "kiska", "kiske", "kab", "baad", "pehle", "bhej", "samajh", "malik", "kharcha"]);
  const isHinglish = (text) => normalize(text).trim().split(" ").some((w) => HINGLISH.has(w));

  return { normalize, find, isHinglish };
});
