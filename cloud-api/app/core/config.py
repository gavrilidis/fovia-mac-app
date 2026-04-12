from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "FaceFlow Cloud API"
    api_v1_prefix: str = "/api/v1"
    max_batch_size: int = 50_000
    face_detection_threshold: float = 0.5
    model_name: str = "buffalo_l"

    model_config = {"env_prefix": "FOVIA_"}


settings = Settings()
