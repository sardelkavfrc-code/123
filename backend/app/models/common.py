from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class APIModel(BaseModel):
    """Base model with a config that ignores unknown VK fields."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)
