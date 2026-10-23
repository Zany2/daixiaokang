from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Zany API"
    app_version: str = "0.1.0"
    environment: Literal["development", "testing", "staging", "production"] = "development"
    debug: bool = False
    docs_enabled: bool = True

    host: str = "0.0.0.0"
    port: int = Field(default=8000, ge=1, le=65535)
    startup_check_dependencies: bool = False

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/zany"
    database_echo: bool = False
    database_pool_size: int = Field(default=10, ge=1)
    database_max_overflow: int = Field(default=20, ge=0)
    database_auto_create: bool = True

    redis_url: str = "redis://localhost:6379/0"
    redis_operation_timeout_seconds: float = Field(default=0.5, ge=0.05, le=5)

    feedback_rate_limit_enabled: bool = True
    feedback_write_interval_seconds: int = Field(default=10, ge=1, le=3600)
    feedback_read_requests_per_minute: int = Field(default=120, ge=1, le=10000)

    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:4000",
            "http://127.0.0.1:4000",
            "https://daixiaokang.com",
            "https://www.daixiaokang.com",
        ]
    )
    cors_allow_credentials: bool = True
    cors_allow_methods: list[str] = Field(default_factory=lambda: ["*"])
    cors_allow_headers: list[str] = Field(default_factory=lambda: ["*"])
    trusted_hosts: list[str] = Field(
        default_factory=lambda: [
            "localhost", "127.0.0.1", "daixiaokang.com", "www.daixiaokang.com"
        ]
    )

    log_level: str = "INFO"
    log_json: bool = False
    log_file_enabled: bool = True
    log_dir: Path = Path("logs")
    log_backup_count: int = Field(default=15, ge=1)
    log_max_size_mb: int = Field(default=20, ge=1)

    @field_validator("log_level")
    @classmethod
    def normalize_log_level(cls, value: str) -> str:
        level = value.strip().upper()
        if level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("Invalid log level")
        return level


@lru_cache
def get_settings() -> Settings:
    return Settings()
