import hashlib
import ipaddress
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

from sqlalchemy import select, func, distinct
from sqlalchemy.dialects.postgresql import insert

from models.site_visit import SiteVisit

CST = timezone(timedelta(hours=8))
SOURCES = ("直接访问 / 未知", "搜索引擎", "外部链接", "推广渠道")
PROVINCES = "北京 天津 上海 重庆 河北 山西 辽宁 吉林 黑龙江 江苏 浙江 安徽 福建 江西 山东 河南 湖北 湖南 广东 海南 四川 贵州 云南 陕西 甘肃 青海 台湾 内蒙古 广西 西藏 宁夏 新疆 香港 澳门".split()
BOT = re.compile(r"bot|spider|crawler|headless|preview|curl|wget|python|httpx", re.I)


def source_category(referrer, utm, allowed_origins):
    if utm.strip():
        return SOURCES[3]
    try:
        parsed = urlsplit(referrer)
        host = (parsed.hostname or "").lower()
        own = {urlsplit(origin).hostname for origin in allowed_origins}
        if parsed.scheme not in {"http", "https"} or not host or host in own:
            return SOURCES[0]
        engines = ("baidu.com", "bing.com", "google.com", "google.com.hk", "google.co.jp", "sogou.com", "so.com", "duckduckgo.com", "search.yahoo.com", "yandex.com", "yandex.ru")
        if any(host == domain or host.endswith("." + domain) for domain in engines):
            return SOURCES[1]
        return SOURCES[2]
    except ValueError:
        return SOURCES[0]


class GeoLookup:
    def __init__(self, directory):
        self.searchers = {}
        from core.logging import get_logger
        logger = get_logger(__name__)
        for version in (4, 6):
            path = Path(directory) / f"ip2region_v{version}.xdb"
            if not path.is_file():
                continue
            try:
                from ip2region import util, searcher
                util.verify_from_file(str(path))
                self.searchers[version] = searcher.new_with_buffer(
                    util.IPv4 if version == 4 else util.IPv6,
                    util.load_content_from_file(str(path)),
                )
            except Exception as exc:
                logger.warning("analytics.geo_unavailable", extra={"version": version, "error_code": type(exc).__name__})

    def province(self, client_ip):
        try:
            ip = ipaddress.ip_address(client_ip)
            if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
                ip = ip.ipv4_mapped
            if not ip.is_global or ip.version not in self.searchers:
                return "未知"
            parts = self.searchers[ip.version].search(str(ip)).split("|")
            # v3 database format: country|province|city|ISP|country_code.
            if len(parts) < 2 or parts[0] not in {"中国", "China"}:
                return "海外" if parts and parts[0] not in {"", "0"} else "未知"
            for name in PROVINCES:
                if parts[1].startswith(name):
                    return name
        except (ValueError, TypeError, IndexError):
            pass
        return "未知"


async def record_visit(db, payload, settings, geo, client_ip, now=None):
    now = now or datetime.now(timezone.utc)
    statement = insert(SiteVisit).values(
        event_id=payload.event_id,
        visitor=hashlib.sha256(str(payload.visitor_id).encode()).hexdigest(),
        path=payload.path,
        source=source_category(payload.referrer, payload.utm_source, settings.cors_origins),
        province=geo.province(client_ip), created_at=now,
    ).on_conflict_do_nothing(index_elements=[SiteVisit.event_id])
    await db.execute(statement)
    await db.commit()


async def summary(db, geo, now=None):
    now = (now or datetime.now(timezone.utc)).astimezone(CST)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)
    tomorrow = today + timedelta(days=1)
    month = today.replace(day=1)
    stamp = SiteVisit.created_at
    count = func.count()
    overview_query = select(
        count.label('total_pv'),
        count.filter(stamp >= month, stamp < tomorrow).label('month_pv'),
        func.count(distinct(SiteVisit.visitor)).filter(stamp >= today, stamp < tomorrow).label('today_uv'),
        count.filter(stamp >= today, stamp < tomorrow).label('today_pv'),
        func.count(distinct(SiteVisit.visitor)).filter(stamp >= yesterday, stamp < today).label('yesterday_uv'),
        count.filter(stamp >= yesterday, stamp < today).label('yesterday_pv'),
    ).subquery()
    months = []
    for offset in range(11, -1, -1):
        year, m = divmod(now.year * 12 + now.month - 1 - offset, 12)
        months.append(f"{year:04d}-{m+1:02d}")
    start = datetime.fromisoformat(months[0] + "-01").replace(tzinfo=CST)
    month_key = func.to_char(func.timezone("Asia/Shanghai", stamp), "YYYY-MM")
    def grouped_json(key, *conditions):
        rows = select(key.label('name'), count.label('value')).where(*conditions).group_by(key).subquery()
        return select(func.coalesce(func.json_agg(func.json_build_array(rows.c.name, rows.c.value)),
                                    func.json_build_array())).select_from(rows).scalar_subquery()

    # A single PostgreSQL statement shares one MVCC snapshot across all counters.
    result = (await db.execute(select(
        overview_query,
        grouped_json(month_key, stamp >= start, stamp < tomorrow).label('trends'),
        grouped_json(SiteVisit.province).label('regions'),
        grouped_json(SiteVisit.source).label('sources'),
    ))).mappings().one()
    trend, regions, sources = (dict(result[key]) for key in ('trends', 'regions', 'sources'))
    return {"overview": {key: result[key] for key in overview_query.c.keys()},
            "regions": [{"name": name, "value": regions.get(name, 0)} for name in PROVINCES],
            "region_unknown": sum(value for name, value in regions.items() if name not in PROVINCES),
            "geo_available": bool(geo.searchers),
            "trends": [{"name": name, "value": trend.get(name, 0)} for name in months],
            "sources": [{"name": name, "value": sources.get(name, 0)} for name in SOURCES],
            "updated_at": now.isoformat()}
