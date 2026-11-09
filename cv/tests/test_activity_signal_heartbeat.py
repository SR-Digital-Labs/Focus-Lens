"""Regression coverage for unchanged-observation freshness heartbeats."""

from unittest.mock import patch

from models.cv_results import PersonState, PostureState, ScreenFacingState
from services.activity_signal_aggregator import ActivitySignalAggregator


def update_away(aggregator: ActivitySignalAggregator):
    return aggregator.update_direct(
        PersonState.AWAY,
        ScreenFacingState.UNKNOWN,
        PostureState.UNKNOWN,
    )


def test_unchanged_away_emits_bounded_heartbeats_for_fifteen_minutes():
    aggregator = ActivitySignalAggregator(heartbeat_interval_seconds=5)
    with patch("services.activity_signal_aggregator.time.time") as now:
        now.return_value = 1_000.0
        first = update_away(aggregator)
        assert first is not None
        assert first["observation_heartbeat"] is False

        heartbeat_count = 0
        for seconds in range(1, 15 * 60 + 1):
            now.return_value = 1_000.0 + seconds
            signal = update_away(aggregator)
            if seconds % 5 == 0:
                assert signal is not None
                assert signal["observation_heartbeat"] is True
                heartbeat_count += 1
            else:
                assert signal is None
        assert heartbeat_count == 180


def test_reset_requires_fresh_observation_before_any_heartbeat():
    aggregator = ActivitySignalAggregator(heartbeat_interval_seconds=5)
    with patch("services.activity_signal_aggregator.time.time", return_value=2_000.0):
        assert update_away(aggregator) is not None
        aggregator.reset()
        state = aggregator.get_current_state()
        assert state["person_presence"] == PersonState.UNKNOWN
        assert state["timestamp"] == 0.0
