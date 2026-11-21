import html
import re


def clean_tweet(text: str) -> str:
    """Normalize tweet text before model inference."""
    text = html.unescape(str(text))
    text = re.sub(r"_x0089_Ûª(?=(s|t|re|ve|ll|d|m)\b)", "'", text)
    text = re.sub(r"_x[0-9A-Fa-f]{4}_", " ", text)
    text = re.sub(r"Û.", " ", text)
    text = re.sub(r"https?://\S+|www\.\S+", " ", text)

    corrections = {
        "åÊ": " ", "å£": "£", "donå«t": "don't",
        "SuruÌ¤": "Suruç", "IRONMANå¨": "IRONMAN®",
        "JapÌ_n": "Japan", "vÌ_deo": "vídeo", "RÌ©": "Ré",
        "Ì©": "é", "Ì¼": "ú", "å©Daniel": "©Daniel",
    }
    for old, new in corrections.items():
        text = text.replace(old, new)

    text = re.sub(r"(\d+)å¡([FC])", r"\1°\2", text)
    text = text.replace("#", "")
    text = re.sub(r"@\w+", " ", text)
    return re.sub(r"\s+", " ", text).strip().lower()
