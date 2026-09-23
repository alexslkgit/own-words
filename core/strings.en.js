// The English table, and the fallback for every other language: a key missing from the chosen
// table is read from here before it is given up on.
(function (root) {
  var table = {

    // one / other, and nothing else to decide.
    _plural: function (n) { return Math.abs(n) === 1 ? "one" : "other"; },

    // ---- counted nouns ----
    cards_n: { one: "card", other: "cards" },
    hidden_n: { one: "hidden", other: "hidden" },
    records_n: { one: "record", other: "records" },
    answers_n: { one: "answer", other: "answers" },
    questions_n: { one: "question", other: "questions" },
    new_n: { one: "new", other: "new" },

    // ---- shared ----
    round_n: "round %1",
    act_close: "close",
    deck_block_n: "block %1",

    // ---- header ----
    head_first_move: "First move",
    head_your_move: "Your move",
    head_not_saving: "not saving",
    head_deck_round: "%1 · round %2",

    // ---- the three stops that cut the deck down to the time he has ----
    // Tooltips only: nothing here is ever drawn on the header line.
    w_hint: "how much of the deck to show",
    w_stop_all: "the whole deck",
    w_stop_mid: "what matters",
    w_stop_top: "only what matters most",

    // ---- the band a broken deck file earns ----
    band_title: "something is wrong in the deck file",
    band_skipped: "%1 %2 skipped",
    band_loaded: "%1 loaded",
    band_open_file: "open data.js",
    broken_title: "there is nothing to show",
    broken_lead: "This deck has no card in it that can be shown.",
    broken_note: "Below is everything the engine could not read in data.js. " +
      "Your earlier answers are untouched: they live in the browser, apart from the deck file.",

    // ---- rail ----
    rail_start: "Start",
    rail_next: "Next",
    rail_in_queue: "in the queue",
    rail_search_ph: "Search the deck",
    filter_queue: "in the queue",
    filter_aside: "set aside",
    filter_new: "new",
    rail_filter_on: "filter · %1",
    rail_filter_off: "no filter set",
    rail_filter_hide: "hide",
    rail_filter_change: "change",
    rail_filter_set: "set",
    rail_found: "found",
    rail_topics: "topics",
    rail_nothing_found: "Nothing found.",
    rail_whole_deck_n: "the whole deck · %1",
    rail_clear_filter: "clear",
    rail_block_n: "Block %1",
    rail_block_title: "%1 %2 in the queue out of %3",
    rail_deck_open: "look",
    tools_show_form: "Show the filled-in form",
    tools_form_hint: "the form builds itself as soon as there is a first answer",
    tools_undo: "undo %1",
    tools_keys: "keys",
    tools_settings: "settings",
    review_all: "repeat everything",
    review_hint: "bring back the cards set aside under «%1»",
    foot_empty: "empty so far",
    foot_empty_note: "The cells fill in as you answer. Earlier rounds fold in here.",

    // ---- what the one step of undo undoes ----
    undo_answer: "the answer",
    undo_skip: "the skip",
    undo_dont_know: "«don't know»",

    // ---- the card ----
    card_history: "history",
    card_clar_title: "Notes",
    card_gate_veil: "the answer opens once you have answered",
    card_answer_ph: "In your own words, or a question",
    first_next_q: "next up, question %1",
    first_last_q: "this is the last question",
    first_nowhere: "nothing leaves here until you copy the form",
    round_note_head: "from Claude · round %1",
    round_rewritten: "rewritten %1",
    round_commented: "with a comment %1",
    card_none: "There is not a single card in this deck.",
    card_q_n: "question %1",
    badge_rewritten: "rewritten",
    badge_rewritten_note: "the wording of round %1",
    badge_first: "first",
    badge_first_note: "the deck was opened just now",
    badge_new: "new",
    badge_new_note: "the answer was rewritten",
    card_again_title: "%1: put the card back in the queue · R",
    card_done_title: "%1: close the card for good · X",
    card_was_round: "was · round %1",
    card_dont_know: "Don't know, show me",
    card_skip: "Skip",
    card_skip_title: "no mark, the card comes back · S",
    card_go_open: "answered, open it",
    card_go_record: "record and move on",
    card_go_title: "%1 · ⌘↵",
    card_go_open_aria: "Answered, open it",
    card_go_record_aria: "Record and move on",
    card_back_to: "← back to %1",
    tog_aside: "set aside",
    tog_aside_hint: "take it out of the queue for later",
    tog_hard: "hard",
    tog_hard_hint: "mark it hard, the card stays in the queue",
    dia_ghost: "the same node as the line above",

    // ---- the fold with every earlier round ----
    past_both: "your answer and Claude's",
    past_mine: "your answer",
    past_theirs: "Claude's answer",
    past_title: "%1 · %2",
    past_author: "Claude",
    fold_collapse: "collapse",

    // ---- the keyboard panel ----
    key_record_next: "record and move on",
    key_close_forever: "close the card for good",
    key_undo: "undo the last thing you did",
    key_escape: "leave the box, close the panel or the overview",
    key_reread: "reread: the card comes back",
    key_skip: "skip, with no mark",
    key_walk: "the next and the previous card",
    key_search: "search the deck",
    keys_bare_head: "when the cursor is not in a box",
    keys_esc_note: "Esc takes the cursor out of the box; after that the single letters work.",

    // ---- settings ----
    set_theme: "theme",
    theme_auto: "as in the system",
    theme_light: "light",
    theme_dark: "dark",
    set_answers: "your answers",
    set_answers_note: "Everything you wrote lives in this browser only. The file is the one copy there is.",
    set_export: "Save to a file",
    file_answers: "%1-answers.json",
    set_saved: "the file is in your downloads",
    set_import: "Load from a file",
    set_merged: "%1 added, %2 updated",
    set_failed: "no luck: %1",
    set_wipe: "Erase everything",
    set_wipe_confirm: "A file with every answer downloads first, then they are erased here. Erase?",
    file_before_wipe: "%1-before-erasing.json",
    set_wiped: "erased, the file is in your downloads",
    set_read: "what you have read",
    set_read_note: "The paragraphs you have already seen stand indented and dimmed. A reset puts every card " +
      "back to «read nothing». It does not touch your answers.",
    set_forget: "Reset what you have read",
    set_forgot: "every card is unread again",
    set_footer: "%1 · round %2 · %3 %4 · format %5",

    // ---- the whole deck at once ----
    deck_all: "the whole deck",
    deck_shown: "%1 of %2 on screen",
    deck_fallback_title: "Deck",
    deck_no_match: "Nothing matches this filter.",

    // ---- the send form on screen ----
    send_preview: "what will be sent",
    send_nothing_yet: "nothing leaves until you press",
    send_lead: "This is what goes to the chat",
    send_extra_head: "anything else · round %1",
    send_extra_ph: "Anything else to say",
    send_counts: "%1 %2 · %3 new · %4 %5 for Claude · %6 untouched",
    send_close: "Close",
    send_copy: "Copy",
    send_copied: "copied · %1 characters",

    // ---- the text the form itself is built out of ----
    send_draft_mark: "(draft, not sent) %1",
    send_new_tag: "[new]",
    send_question: "question: %1",
    send_fresh: "%1 %2 since the last send",
    send_opened: "%1 with no answer",
    send_h_answers: "ANSWERS",
    send_h_opened: "OPENED, NOT ANSWERED",
    send_h_untouched: "UNTOUCHED",
    send_h_extra: "ANYTHING ELSE",

    // ---- what the store says when a file will not load ----
    store_bad_file: "the file will not parse",
    store_no_records: "there are no records in the file",

    // ---- what the deck file itself got wrong ----
    err_scale_two: "a scale must declare at least two marks",
    err_mark_no_id: "the mark has no id",
    err_mark_dup_id: "the mark id is repeated",
    err_mark_no_label: "the mark has no label",
    err_mark_side: "side must be mine or done",
    err_reply_mode: "the reply mode «%1» is not one of the four: %2",
    err_scale_missing: "the scale «%1» is not declared in this deck",
    err_choice_empty: "a choice with no options",
    err_where_card: "%1 · card %2",
    err_card_no_id: "no id, the answer has nowhere to go: the card is skipped",
    err_card_no_q: "no question, nothing to show: the card is skipped",
    err_deck_no_key: "the deck has no key, the records have nowhere to go",
    err_deck_round: "round must be a whole number greater than zero",
    err_card_dup_id: "this id is already taken: the first card is kept, this one is skipped",
    err_deck_empty: "the deck has no cards at all",

    // ---- a deck the reader brought himself ----
    own_bad_text: "the deck text will not parse: %1",
    own_not_a_deck: "this is not a deck: the text has neither key nor blocks",
    own_no_storage: "the browser would not store the deck"
  };

  root.DECK_STRINGS = root.DECK_STRINGS || {};
  root.DECK_STRINGS.en = table;
  if (typeof module === "object" && module.exports) module.exports = table;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
