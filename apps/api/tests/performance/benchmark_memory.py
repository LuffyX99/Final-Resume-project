"""Performance benchmark for memory footprint under load."""

import psutil
import os


def test_memory_footprint_meets_sla():
    process = psutil.Process(os.getpid())
    rss_mb = process.memory_info().rss / (1024 * 1024)

    # SLA: Steady state memory usage < 2GB (2048 MB)
    assert rss_mb < 2048, f"Memory usage is {rss_mb:.1f} MB, exceeding 2048 MB SLA"
