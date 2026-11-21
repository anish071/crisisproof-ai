import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from preprocessing import clean_tweet


def test_clean_tweet_lowercases_text():
    assert clean_tweet("HELLO WORLD") == "hello world"


def test_clean_tweet_removes_hashtag_symbol():
    assert clean_tweet("#FloodAlert") == "floodalert"


def test_clean_tweet_removes_user_mention():
    assert "@anish" not in clean_tweet("Help @anish now")


def test_clean_tweet_removes_url():
    assert "https://example.com" not in clean_tweet("Updates at https://example.com")


def test_clean_tweet_normalizes_whitespace():
    assert clean_tweet("  heavy   rain  ") == "heavy rain"


def test_clean_tweet_handles_empty_string():
    assert clean_tweet("") == ""
