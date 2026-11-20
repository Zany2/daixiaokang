from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
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

    analytics_enabled: bool = True
    analytics_geo_dir: Path = Path("data/geo")

    campus_enabled: bool = True
    campus_rooms: list[str] = Field(default_factory=lambda: ["bjut"])
    campus_allowed_origins: list[str] = Field(default_factory=lambda: [
        "https://daixiaokang.com", "https://www.daixiaokang.com",
        "http://localhost:4175", "http://127.0.0.1:4175",
    ])
    campus_room_capacity: int = Field(default=1024, ge=2, le=1024)
    campus_connections_per_ip: int = Field(default=4, ge=1, le=100)
    campus_heartbeat_seconds: float = Field(default=15, ge=1, le=30)
    campus_idle_seconds: float = Field(default=45, ge=5, le=120)
    campus_lease_seconds: int = Field(default=90, ge=30, le=300)

    @model_validator(mode="after")
    def validate_campus_timing(self):
        if self.campus_idle_seconds < self.campus_heartbeat_seconds * 2:
            raise ValueError("Campus idle timeout must cover at least two heartbeats")
        if self.campus_lease_seconds <= self.campus_idle_seconds + self.campus_heartbeat_seconds:
            raise ValueError("Campus presence lease must exceed idle timeout plus heartbeat")
        return self

    @field_validator("campus_rooms")
    @classmethod
    def validate_campus_rooms(cls, value: list[str]) -> list[str]:
        import re
        if not 1 <= len(value) <= 16 or len(set(value)) != len(value):
            raise ValueError("Campus must have 1 to 16 unique rooms")
        if any(not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,31}", room) for room in value):
            raise ValueError("Invalid campus room name")
        return value

    @field_validator("campus_allowed_origins")
    @classmethod
    def validate_campus_origins(cls, value: list[str]) -> list[str]:
        from urllib.parse import urlsplit
        if not value:
            raise ValueError("Campus requires explicit allowed origins")
        for origin in value:
            parsed = urlsplit(origin)
            if (parsed.scheme not in {"http", "https"} or not parsed.hostname
                    or parsed.username or parsed.password or parsed.path
                    or parsed.query or parsed.fragment or "*" in origin):
                raise ValueError("Campus origins must be exact http(s) origins")
        return value

    feedback_rate_limit_enabled: bool = True
    feedback_write_interval_seconds: int = Field(default=10, ge=1, le=3600)
    feedback_read_requests_per_minute: int = Field(default=120, ge=1, le=10000)

    ai_enabled: bool = True
    ai_api_base: str = "https://api.deepseek.com"
    ai_api_key: SecretStr = SecretStr("")
    ai_model: str = "deepseek-chat"
    ai_system_prompt: str = (
        "你是一位通用 AI 助手，帮助用户解答问题、学习知识、编写代码、整理文字和规划任务。"
        "默认用中文自然、清晰地回答，根据问题调整详略，必要时使用 Markdown。"
        "信息不足时先澄清，不确定的内容如实说明，不编造事实或声称执行了未执行的操作。"
    )
    ai_system_prompt_version: str = "v1"
    ai_temperature: float = Field(default=0.7, ge=0, le=2)
    ai_max_input_chars: int = Field(default=1000, ge=1, le=10000)
    ai_max_tokens: int = Field(default=1024, ge=1, le=8192)
    ai_max_history_turns: int = Field(default=6, ge=0, le=50)
    ai_rate_limit_enabled: bool = True
    ai_requests_per_hour: int = Field(default=30, ge=1, le=10000)
    ai_conversations_per_hour: int = Field(default=10, ge=1, le=1000)
    ai_conversation_ttl_hours: int = Field(default=24, ge=1, le=720)
    ai_conversation_lock_seconds: int = Field(default=120, ge=10, le=600)
    ai_request_timeout_seconds: float = Field(default=60, ge=5, le=300)

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

    @field_validator("ai_api_base")
    @classmethod
    def normalize_ai_api_base(cls, value: str) -> str:
        base = value.strip().rstrip("/")
        if not base.startswith(("http://", "https://")):
            raise ValueError("AI API base must use http or https")
        return base

    @field_validator("ai_model", "ai_system_prompt", "ai_system_prompt_version")
    @classmethod
    def reject_blank_ai_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("AI configuration must not be blank")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
