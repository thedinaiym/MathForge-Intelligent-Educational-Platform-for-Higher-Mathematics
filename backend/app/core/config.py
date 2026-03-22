from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_rest_url: str = ""
    supabase_db_url: str = ""
    supabase_service_role_key: str = ""
    groq_api_key: str = ""
    gemini_api_key: str = ""
    google_cloud_vision_key: str = ""
    qdrant_url: str = ""
    qdrant_api_key: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
