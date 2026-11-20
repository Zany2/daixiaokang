"""Version 1 guest-campus WebSocket messages; no client-supplied identity."""

import unicodedata
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class Join(Message):
    type: Literal["join"]
    room: str = Field(default="bjut", pattern=r"^[a-z0-9][a-z0-9-]{0,31}$")
    nickname: str = Field(min_length=1, max_length=24)

    @field_validator("nickname")
    @classmethod
    def printable_name(cls, value: str) -> str:
        if any(unicodedata.category(c).startswith("C") for c in value):
            raise ValueError("Nickname contains control characters")
        return value


class Position(Message):
    x: float = Field(ge=-600, le=640, allow_inf_nan=False)
    y: float = Field(ge=0, le=160, allow_inf_nan=False)
    z: float = Field(ge=-480, le=480, allow_inf_nan=False)


class State(Message):
    type: Literal["state"]
    seq: int = Field(ge=1, le=2**53 - 1)
    position: Position
    heading: float = Field(ge=-100000, le=100000, allow_inf_nan=False)
    action: Literal["idle", "walk", "run", "jump", "fly"] = "idle"


class Chat(Message):
    type: Literal["chat"]
    text: str = Field(min_length=1, max_length=200)

    @field_validator("text")
    @classmethod
    def printable_text(cls, value: str) -> str:
        if any(unicodedata.category(c).startswith("C") and c != "\n" for c in value):
            raise ValueError("Chat contains control characters")
        return value


class Pong(Message):
    type: Literal["pong"]


class Leave(Message):
    type: Literal["leave"]


ClientMessage = Annotated[Join | State | Chat | Pong | Leave, Field(discriminator="type")]
CLIENT_MESSAGE = TypeAdapter(ClientMessage)
