import joblib
from pathlib import Path

from preprocessing import clean_tweet


class CrisisPredictor:
    def __init__(self, model_path):
        model_path = Path(model_path)
        if not model_path.exists():
            raise FileNotFoundError(f"Model artifact not found: {model_path}")

        artifact = joblib.load(model_path)
        self.model = artifact["model"]
        self.threshold = artifact["threshold"]
        self.model_name = artifact["model_name"]
        self.model_version = artifact["model_version"]

    def predict(self, tweet):
        if not isinstance(tweet, str):
            raise TypeError("Tweet must be a string.")
        if not tweet.strip():
            raise ValueError("Tweet cannot be empty.")

        cleaned_tweet = clean_tweet(tweet)
        decision_score = self.model.decision_function([cleaned_tweet])[0]
        prediction = int(decision_score >= self.threshold)
        return {
            "original_tweet": tweet,
            "cleaned_tweet": cleaned_tweet,
            "prediction": prediction,
            "classification": "Disaster-related" if prediction == 1 else "Non-disaster",
            "decision_score": round(float(decision_score), 4),
            "threshold": self.threshold,
            "model_version": self.model_version,
        }
