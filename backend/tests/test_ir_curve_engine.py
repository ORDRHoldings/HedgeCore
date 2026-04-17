"""Pure-function tests for the IR yield curve bootstrapper."""
from datetime import date
import math


def test_single_node_discount_factor():
    """Single 1Y rate produces correct discount factor: df = 1/(1+r)."""
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote
    quotes = [RateQuote(tenor="1Y", rate=0.05, instrument="OIS", index="SOFR")]
    curve = bootstrap_curve(quotes, as_of=date(2026, 1, 1))
    assert len(curve.nodes) >= 1
    node_1y = next(n for n in curve.nodes if n.tenor == "1Y")
    expected_df = 1.0 / (1.0 + 0.05)
    assert abs(node_1y.discount_factor - expected_df) < 1e-6


def test_forward_rate_non_negative_for_normal_curve():
    """Upward-sloping curve produces positive forward rates."""
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote
    quotes = [
        RateQuote(tenor="1Y", rate=0.04, instrument="OIS", index="SOFR"),
        RateQuote(tenor="2Y", rate=0.05, instrument="OIS", index="SOFR"),
    ]
    curve = bootstrap_curve(quotes, as_of=date(2026, 1, 1))
    node_2y = next(n for n in curve.nodes if n.tenor == "2Y")
    assert node_2y.forward_rate > 0.0


def test_zero_rate_consistency():
    """Zero rate derived from discount factor is self-consistent."""
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote
    quotes = [RateQuote(tenor="2Y", rate=0.06, instrument="OIS", index="EURIBOR")]
    curve = bootstrap_curve(quotes, as_of=date(2026, 1, 1))
    node = next(n for n in curve.nodes if n.tenor == "2Y")
    # df = exp(-zero_rate * t); for t=2: zero_rate = -ln(df)/2
    implied_zero = -math.log(node.discount_factor) / 2.0
    assert abs(implied_zero - node.zero_rate) < 1e-6


def test_multi_index_curves_are_independent():
    """SOFR and EURIBOR quotes produce separate curves."""
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote
    quotes = [
        RateQuote(tenor="1Y", rate=0.05, instrument="OIS", index="SOFR"),
        RateQuote(tenor="1Y", rate=0.03, instrument="OIS", index="EURIBOR"),
    ]
    sofr_curve = bootstrap_curve([q for q in quotes if q.index == "SOFR"], as_of=date(2026, 1, 1))
    eur_curve = bootstrap_curve([q for q in quotes if q.index == "EURIBOR"], as_of=date(2026, 1, 1))
    sofr_df = next(n for n in sofr_curve.nodes if n.tenor == "1Y").discount_factor
    eur_df = next(n for n in eur_curve.nodes if n.tenor == "1Y").discount_factor
    assert sofr_df < eur_df  # higher rate → lower discount factor
