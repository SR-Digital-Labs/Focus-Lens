"""
FocusLens — Logger Utility
===========================
Provides a consistently configured logger for the entire CV layer.

Usage
-----
    from cv.utils.logger import get_logger
    log = get_logger(__name__)
    log.info("Camera opened successfully.")
"""

import logging
import sys

from config import LOG_LEVEL


def get_logger(name: str) -> logging.Logger:
    """
    Return a named logger that writes to stdout.

    All CV modules call this function with ``__name__`` to get their
    module-specific logger. The log level is controlled centrally
    via ``config.settings.LOG_LEVEL``.

    Args:
        name: Logger name, typically the module's ``__name__``.

    Returns:
        A configured :class:`logging.Logger` instance.
    """
    logger = logging.getLogger(name)

    # Only add a handler if none exist yet (avoids duplicate output).
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            fmt="%(asctime)s  [%(levelname)-8s]  %(name)s — %(message)s",
            datefmt="%H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    numeric_level = getattr(logging, LOG_LEVEL.upper(), logging.INFO)
    logger.setLevel(numeric_level)

    return logger
