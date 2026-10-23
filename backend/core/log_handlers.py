import os
import re
from datetime import datetime
from logging import LogRecord
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path


class DailySizeRotatingFileHandler(TimedRotatingFileHandler):
    """按本地日期或文件大小滚动，按总数量保留备份（适用于单进程）。"""

    def __init__(self, filename: str, max_bytes: int, backup_count: int) -> None:
        super().__init__(
            filename,
            when="midnight",
            interval=1,
            backupCount=backup_count,
            encoding="utf-8",
            delay=True,
            utc=False,
            errors="backslashreplace",
        )
        self.max_bytes = max_bytes

    def shouldRollover(self, record: LogRecord) -> bool:
        if super().shouldRollover(record):
            return True
        if self.stream is None:
            self.stream = self._open()
        self.stream.seek(0, os.SEEK_END)
        current_size = self.stream.tell()
        if current_size == 0:
            # 单条日志不拆开，避免超大日志导致空文件反复滚动。
            return False
        message = self.format(record) + self.terminator
        # 按 UTF-8 字节数计算，并计入 Windows 文本模式的换行转换。
        encoded = message.replace("\n", os.linesep).encode(
            self.encoding, errors=self.errors or "strict"
        )
        return current_size + len(encoded) >= self.max_bytes

    def rotation_filename(self, default_name: str) -> str:
        # 使用切分时间命名，同一天可产生多份备份；跨日与大小切分均不会覆盖旧备份。
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f")
        name = f"{self.baseFilename}.{timestamp}"
        index = 1
        while Path(name).exists():
            name = f"{self.baseFilename}.{timestamp}.{index}"
            index += 1
        return name

    def getFilesToDelete(self) -> list[str]:
        base_path = Path(self.baseFilename)
        # 同时识别原来的纯日期备份，只清理当前 app.log 对应的备份文件。
        pattern = re.compile(
            rf"{re.escape(base_path.name)}\.\d{{4}}-\d{{2}}-\d{{2}}"
            r"(?:_\d{2}-\d{2}-\d{2}_\d{6}(?:\.\d+)?)?"
        )
        backups = sorted(
            path
            for path in base_path.parent.iterdir()
            if path.is_file() and pattern.fullmatch(path.name)
        )
        excess = max(0, len(backups) - self.backupCount)
        return [str(path) for path in backups[:excess]]
