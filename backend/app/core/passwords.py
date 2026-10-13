"""Password strength rules beyond the 8-72 character length check.

Length alone allows "password1" or "12345678", which are among the first guesses
in any attack. These checks reject the most common passwords, ones built from the
user's own email, and single-character repeats. They're deliberately short and
explainable rather than a full strength meter.
"""

# The most common passwords of 8+ characters from public breach-frequency lists.
_COMMON = {
    "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword",
    "12345678", "123456789", "1234567890", "12345678910", "123123123", "11111111", "00000000", "88888888",
    "87654321", "11223344", "12341234", "12121212", "qwertyui", "qwerty123", "qwerty12", "qwertyuiop",
    "1q2w3e4r", "1q2w3e4r5t", "1qaz2wsx", "zaq12wsx", "asdfghjk", "asdfghjkl", "zxcvbnm1", "abcd1234",
    "abc12345", "abcdefgh", "iloveyou", "iloveyou1", "sunshine", "princess", "football", "baseball",
    "welcome1", "welcome123", "letmein1", "trustno1", "superman", "starwars", "whatever", "computer",
    "michelle", "jennifer", "corvette", "mercedes", "danielle", "internet", "chocolate", "butterfly",
    "liverpool", "pokemon1", "dragon12", "master12", "monkey12", "shadow12", "changeme", "changeme1",
    "secret123", "admin123", "administrator", "default1", "qazwsxedc", "aaaaaaaa", "q1w2e3r4",
    "q1w2e3r4t5", "passpass", "test1234", "testtest", "india123", "123456789a", "a1234567", "1234qwer",
}


def password_problem(password: str, email: str | None = None) -> str | None:
    """Why `password` is too weak, or None if it's acceptable."""
    lowered = password.lower()
    if lowered in _COMMON:
        return "This password is too common. Choose something less guessable."
    if len(set(password)) <= 2:
        return "This password repeats too few characters. Choose something less guessable."
    if email:
        name = email.split("@")[0].lower()
        if len(name) >= 4 and name in lowered:
            return "Your password shouldn't contain your email address."
    return None
