"""Reusable annotated field types for request schemas."""

from typing import Annotated

from pydantic import StringConstraints

PhoneNumber = Annotated[
    str,
    StringConstraints(strip_whitespace=True, pattern=r"^\+?[0-9][0-9 ()\-]{5,19}$"),
]
