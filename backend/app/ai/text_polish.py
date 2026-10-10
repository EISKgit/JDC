import re
from functools import lru_cache

from spellchecker import SpellChecker

# Openers that only made sense mid-paragraph ("...basketball. And also played...")
# and read oddly once a sentence stands alone as an event.
_LEADING_FILLER_RE = re.compile(r"^(?:and also|and then|but also|and|also|then|so)\b[\s,]*", re.IGNORECASE)

# Shorthand -> full word, applied only after a number ("2 hr" -> "2 hours").
_UNIT_EXPANSIONS = {"hr": "hour", "hrs": "hour", "min": "minute", "mins": "minute"}
_UNIT_RE = re.compile(r"\b(\d+(?:\.\d+)?)\s*(hrs?|mins?)\b", re.IGNORECASE)

_WORD_EXPANSIONS = {"approx": "approximately", "tmrw": "tomorrow", "pls": "please", "w/": "with"}

# Names people commonly type in lower case.
_PROPER_CASE = {
    "python": "Python", "java": "Java", "javascript": "JavaScript", "typescript": "TypeScript",
    "sql": "SQL", "dsa": "DSA", "html": "HTML", "css": "CSS", "c++": "C++", "github": "GitHub",
    "linkedin": "LinkedIn", "youtube": "YouTube", "i": "I", "i'm": "I'm", "i've": "I've", "i'll": "I'll",
    "i'd": "I'd",
}

# Plain lower-case words only; anything with digits, symbols, apostrophes or inner
# capitals (DSA, C++, iPhone, I'm) is left exactly as typed.
_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z'+/]*")

# Short words are mostly abbreviations the dictionary doesn't know ("hr", "dsa").
_MIN_SPELLCHECK_LENGTH = 4


@lru_cache
def _spellchecker() -> SpellChecker:
    # distance=1 only fixes single-letter slips ("durning", "lanuguage"); larger
    # edits start "correcting" real-but-rare words into different ones.
    return SpellChecker(distance=1)


def _fix_word(word: str, *, sentence_start: bool) -> str:
    lower = word.lower()
    if lower in _WORD_EXPANSIONS:
        return _WORD_EXPANSIONS[lower]
    if lower in _PROPER_CASE:
        return _PROPER_CASE[lower]
    # A capitalised word mid-sentence is likely a name; acronyms/mixed case are deliberate.
    if not word.isalpha() or (word != lower and not (sentence_start and word[1:].islower())):
        return word
    if len(word) < _MIN_SPELLCHECK_LENGTH:
        return word
    checker = _spellchecker()
    if lower in checker:
        return word
    fixed = checker.correction(lower)
    if not fixed:
        return word
    return fixed.capitalize() if word[0].isupper() else fixed


def _expand_unit(match: re.Match[str]) -> str:
    number, unit = match.group(1), _UNIT_EXPANSIONS[match.group(2).lower()]
    return f"{number} {unit}" if number in ("1", "1.0") else f"{number} {unit}s"


def polish_sentence(sentence: str) -> str:
    """Tidy one extracted event description for display.

    Fixes obvious typos, casing of common names, shorthand units and leftover
    paragraph connectors, and makes it a proper sentence. The user's original
    update text is never touched — this only shapes the per-event statement.
    """
    text = " ".join(sentence.split())
    text = _LEADING_FILLER_RE.sub("", text)
    if not text:
        return sentence.strip()

    text = _UNIT_RE.sub(_expand_unit, text)

    pieces: list[str] = []
    last = 0
    for i, match in enumerate(_TOKEN_RE.finditer(text)):
        pieces.append(text[last:match.start()])
        pieces.append(_fix_word(match.group(0), sentence_start=i == 0))
        last = match.end()
    pieces.append(text[last:])
    text = "".join(pieces)

    text = text[0].upper() + text[1:]
    if text[-1] not in ".!?":
        text += "."
    return text
