from datetime import datetime

from pydantic import BaseModel, Field


class MarketSnapshot(BaseModel):
    as_of: datetime
    spot_usdmxn: float = Field(..., gt=0)
    forward_points_by_month: dict[str, float]
    provider_metadata: dict = Field(default_factory=dict)
