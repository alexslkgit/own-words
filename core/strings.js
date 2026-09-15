// The one accessor every core file reads its text through. The tables themselves live in
// core/strings.<lang>.js and register onto DECK_STRINGS, so the code carries no user-visible
// string of its own and the public mirror of core/ can ship with the English table alone.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    require("./strings.en.js");
    // English is the fallback and has to be there; every other table is optional, because the
    // public mirror of core/ ships without one. So the rest are taken off the disk beside this
    // file rather than named here: a table that is not there is simply not a language, and the
    // accessor already falls back to English for every key.
    try {
      require("fs").readdirSync(__dirname).forEach(function (f) {
        if (/^strings\.[a-z]{2,3}\.js$/.test(f) && f !== "strings.en.js") require("./" + f);
      });
    } catch (e) { /* English alone */ }
    module.exports = api;
  } else root.DeckStrings = api;
})(typeof self !== "undefined" ? self : this, function () {

  // The tables register onto the global object, which is `window` in a page and `global` under
  // node; read it at lookup time so a table loaded after this file is still found.
  function host() {
    if (typeof window !== "undefined") return window;
    if (typeof global !== "undefined") return global;
    return {};
  }
  function bag() { return host().DECK_STRINGS || {}; }

  var forced = null;

  // DECK.lang, else the page's own lang, else English. A table that is not loaded is not a
  // language: a page that ships only strings.en.js reads English whatever the html says.
  function lang() {
    if (forced && bag()[forced]) return forced;
    var want = "";
    var h = host();
    if (h.DECK && h.DECK.lang) want = String(h.DECK.lang);
    else if (typeof document !== "undefined" && document.documentElement) {
      want = String(document.documentElement.lang || "");
    }
    want = want.split("-")[0].toLowerCase();
    return bag()[want] ? want : "en";
  }

  function table(which) { return bag()[which || lang()] || {}; }

  function find(key) {
    var v = table()[key];
    if (v === undefined && lang() !== "en") v = table("en")[key];
    return v;
  }

  // %1..%9 in the order they were passed. An argument that itself contains a %n is not rescanned.
  function fill(text, args, from) {
    if (args.length <= from) return text;
    return text.replace(/%(\d)/g, function (whole, d) {
      var at = from + Number(d) - 1;
      return at < args.length ? String(args[at]) : whole;
    });
  }

  function S(key) {
    var v = find(key);
    if (typeof v !== "string") return String(key);
    return fill(v, arguments, 1);
  }

  // The counted noun alone, never the number: every call site already prints the number itself.
  // Which form is which is the table's own business - English answers one/other, another table
  // may answer one/few/many - so this asks the table's pluraliser and never counts here.
  S.n = function (count, key) {
    var forms = table()[key];
    if (!forms || typeof forms !== "object") forms = table("en")[key];
    if (!forms || typeof forms !== "object") return String(key);
    var pick = table()._plural || table("en")._plural;
    var form = typeof pick === "function" ? pick(count) : (Math.abs(count) === 1 ? "one" : "other");
    if (forms[form] !== undefined) return forms[form];
    if (forms.other !== undefined) return forms.other;
    return forms.many !== undefined ? forms.many : String(key);
  };

  S.lang = lang;
  S.has = function (key) { return find(key) !== undefined; };
  S.table = table;
  // Every language whose table is loaded. The answer parser reads its extra markup tokens out of
  // all of them, so a deck parses the same whatever language the page is reading in.
  S.langs = function () { return Object.keys(bag()); };
  // The public landing sets this when it opens a deck in a language the page is not written in.
  S.use = function (which) { forced = which ? String(which) : null; return lang(); };

  return S;
});
