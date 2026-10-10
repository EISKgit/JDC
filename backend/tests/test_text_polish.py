import pytest

from app.ai.text_polish import polish_sentence


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Completed my daily workout durning evening time", "Completed my daily workout during evening time."),
        ("And also played 2 hr basketball", "Played 2 hours basketball."),
        ("Spent approx 100 rupees while I'm with friends outside",
         "Spent approximately 100 rupees while I'm with friends outside."),
        ("job preparaion include python, DSA, and also communication skills",
         "Job preparation include Python, DSA, and also communication skills."),
        ("and also making good progress on learning C++ lanuguage", "Making good progress on learning C++ language."),
        ("currently working on the project for resume", "Currently working on the project for resume."),
        # names, acronyms and short abbreviations are left as typed
        ("met Ravi for 1 hr at the gym", "Met Ravi for 1 hour at the gym."),
        ("Finished the course!", "Finished the course!"),
    ],
)
def test_polish_sentence(raw, expected):
    assert polish_sentence(raw) == expected


def test_filler_only_sentence_is_not_emptied():
    assert polish_sentence("and also") == "and also"
