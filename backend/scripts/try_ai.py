"""Send one report text to the configured AI provider and print the parsed result.

Run: make ai-check text="น้ำท่วมถึงเข่า ซอย 12 ลาดพร้าว ยายต้องการยา"
"""

import asyncio
import sys
import time

from app.integrations.ai.connector import AIConnectorError
from app.integrations.ai.factory import get_ai_connector
from app.modules.reports.service import parse_report_text

DEFAULT_TEXT = "Вода по пояс на Сой 7 в Хат Яй, двое пожилых не могут выйти, нужна лодка"


async def main(text: str) -> int:
    connector = get_ai_connector()
    print(f"Provider: {connector.provider_name} / {connector.model_name}\nText: {text}\n")
    started = time.perf_counter()
    try:
        parsed = await parse_report_text(connector, text)
    except AIConnectorError as exc:
        print(f"AI error: {exc}")
        return 1
    print(parsed.model_dump_json(indent=2))
    print(f"\n{time.perf_counter() - started:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(" ".join(sys.argv[1:]) or DEFAULT_TEXT)))
