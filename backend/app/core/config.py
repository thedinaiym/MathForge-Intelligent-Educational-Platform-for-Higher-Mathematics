from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_rest_url: str = ""
    supabase_db_url: str = ""
    supabase_service_role_key: str = ""
    groq_api_key: str = ""
    gemini_api_key: str = ""
    google_cloud_vision_key: str = ""

    @field_validator(
        "groq_api_key", "gemini_api_key", "google_cloud_vision_key",
        "supabase_rest_url", "supabase_db_url", "supabase_service_role_key",
        "qdrant_url", "qdrant_api_key",
        mode="before",
    )
    @classmethod
    def strip_whitespace(cls, v: object) -> object:
        """Strip accidental newlines/spaces from env var values (common copy-paste error)."""
        if isinstance(v, str):
            return v.strip()
        return v

    # Accept both QDRANT_URL (conventional) and QDRANT_ENDPOINT (our .env naming).
    # AliasChoices tries each name in order; first non-empty value wins.
    qdrant_url: str = Field(
        default="",
        validation_alias=AliasChoices("qdrant_url", "qdrant_endpoint"),
    )
    qdrant_api_key: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
