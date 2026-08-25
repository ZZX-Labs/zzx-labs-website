from datetime import datetime, timezone
from sqlalchemy import String, Float, Integer, Text, DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

def utcnow():
    return datetime.now(timezone.utc)

class Base(DeclarativeBase):
    pass

class OrderIntent(Base):
    __tablename__ = "order_intents"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    owner: Mapped[str] = mapped_column(String(128))
    side: Mapped[str] = mapped_column(String(8))
    pair: Mapped[str] = mapped_column(String(16))
    price: Mapped[float] = mapped_column(Float)
    btc_qty: Mapped[float] = mapped_column(Float)
    remaining: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(24), default="open")
    intent_hash: Mapped[str] = mapped_column(String(64))

class PeerOffer(Base):
    __tablename__ = "peer_offers"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    maker: Mapped[str] = mapped_column(String(128))
    side: Mapped[str] = mapped_column(String(8))
    pair: Mapped[str] = mapped_column(String(16))
    price: Mapped[float] = mapped_column(Float)
    btc_qty: Mapped[float] = mapped_column(Float)
    remaining: Mapped[float] = mapped_column(Float)
    rail: Mapped[str] = mapped_column(String(32))
    relay: Mapped[str] = mapped_column(String(128))
    offer_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(24), default="open")

class Trade(Base):
    __tablename__ = "trades"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    pair: Mapped[str] = mapped_column(String(16))
    price: Mapped[float] = mapped_column(Float)
    btc_qty: Mapped[float] = mapped_column(Float)
    buyer: Mapped[str] = mapped_column(String(128))
    seller: Mapped[str] = mapped_column(String(128))
    settlement_state: Mapped[str] = mapped_column(String(48), default="noncustodial-pending")

class SettlementCommitment(Base):
    __tablename__ = "settlement_commitments"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    trade_id: Mapped[str] = mapped_column(String(64))
    state: Mapped[str] = mapped_column(String(48))
    commitment_json: Mapped[str] = mapped_column(Text)
    commitment_hash: Mapped[str] = mapped_column(String(64))

class AuditEvent(Base):
    __tablename__ = "audit_events"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    event_type: Mapped[str] = mapped_column(String(64))
    body_json: Mapped[str] = mapped_column(Text)
    body_hash: Mapped[str] = mapped_column(String(64))
