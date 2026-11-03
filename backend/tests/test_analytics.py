import unittest
from datetime import datetime, timezone
from uuid import uuid4
from unittest.mock import AsyncMock

import httpx
from fastapi import FastAPI
from sqlalchemy import text, event
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from core.config import Settings
from db.base import Base
from db.session import get_db
from models.site_visit import SiteVisit
from schemas.analytics import VisitCreate
from services import analytics
from services.feedback_runtime import get_feedback_runtime


class ClassificationTests(unittest.TestCase):
    def test_sources_are_classified_without_trusting_similar_domain_names(self):
        own = ['https://daixiaokang.com']
        cases = [('', '', 0), ('https://daixiaokang.com/foo', '', 0),
                 ('https://www.baidu.com/s', '', 1), ('https://baidu.com.evil.example', '', 2),
                 ('https://other.example/x', '', 2), ('', 'wechat', 3)]
        for ref, utm, index in cases:
            self.assertEqual(analytics.source_category(ref, utm, own), analytics.SOURCES[index])

    def test_geo_maps_provinces_and_keeps_unknown_separate(self):
        geo = analytics.GeoLookup('nonexistent-test-directory')
        searcher = unittest.mock.Mock()
        searcher.search.return_value = '中国|内蒙古自治区|呼和浩特|电信|CN'
        geo.searchers[4] = searcher
        self.assertEqual(geo.province('1.2.3.4'), '内蒙古')
        self.assertEqual(geo.province('::ffff:1.2.3.4'), '内蒙古')
        self.assertEqual(geo.province('127.0.0.1'), '未知')
        self.assertEqual(geo.province('::1'), '未知')
        searcher.search.return_value = 'United States|California|0|0|US'
        self.assertEqual(geo.province('1.2.3.4'), '海外')


class AnalyticsDatabaseTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.settings = Settings()
        self.schema = 'test_analytics_' + uuid4().hex
        self.admin = create_async_engine(self.settings.database_url)
        async with self.admin.begin() as conn:
            await conn.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        self.addAsyncCleanup(self.cleanup)
        self.engine = create_async_engine(self.settings.database_url, connect_args={
            'server_settings': {'search_path': self.schema + ',public'}})
        async with self.engine.begin() as conn:
            await conn.run_sync(lambda sync: Base.metadata.create_all(sync, tables=[SiteVisit.__table__]))
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.geo = analytics.GeoLookup('nonexistent-test-directory')

    async def cleanup(self):
        await self.engine.dispose()
        async with self.admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        await self.admin.dispose()

    async def test_event_idempotency_uv_and_shanghai_day_boundaries(self):
        visitor = uuid4()
        async with self.sessions() as db:
            for instant, repeat in [('2026-11-01T15:59:59+00:00', False),
                                    ('2026-11-01T16:00:00+00:00', True),
                                    ('2026-11-02T01:00:00+00:00', False)]:
                payload = VisitCreate(event_id=uuid4(), visitor_id=visitor, path='/')
                await analytics.record_visit(db, payload, self.settings, self.geo, '127.0.0.1', datetime.fromisoformat(instant))
                if repeat:
                    await analytics.record_visit(db, payload, self.settings, self.geo, '127.0.0.1')
            result = await analytics.summary(db, self.geo, datetime(2026, 11, 2, 12, tzinfo=timezone.utc))
            self.assertEqual(result['overview'], dict(total_pv=3, month_pv=3, today_uv=1, today_pv=2, yesterday_uv=1, yesterday_pv=1))
            self.assertEqual(result['trends'][-1], {'name': '2026-11', 'value': 3})
            self.assertEqual(len(result['trends']), 12)
            self.assertEqual(result['region_unknown'], 3)
            self.assertEqual(sum(r['value'] for r in result['sources']), 3)

    async def test_empty_year_rollover_and_summary_uses_one_database_snapshot(self):
        statements = []
        def capture(conn, cursor, statement, parameters, context, executemany):
            statements.append(statement)
        event.listen(self.engine.sync_engine, 'before_cursor_execute', capture)
        async with self.sessions() as db:
            result = await analytics.summary(db, self.geo, datetime(2027, 1, 1, tzinfo=timezone.utc))
        self.assertEqual(len(statements), 1)
        self.assertEqual(result['overview']['total_pv'], 0)
        self.assertEqual(result['trends'][0]['name'], '2026-02')
        self.assertEqual(result['trends'][-1]['name'], '2027-01')
        self.assertEqual(sum(row['value'] for row in result['sources']), 0)

    async def test_http_origin_bot_filter_and_public_summary(self):
        from controller.analytics import router
        app = FastAPI()
        app.include_router(router)
        app.state.analytics_geo = self.geo
        runtime = AsyncMock()
        app.dependency_overrides[get_feedback_runtime] = lambda: runtime
        async def database():
            async with self.sessions() as db:
                yield db
        app.dependency_overrides[get_db] = database
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://localhost') as client:
            body = dict(event_id=str(uuid4()), visitor_id=str(uuid4()), path='/')
            response = await client.post('/api/analytics/visits', json=body)
            self.assertEqual(response.status_code, 403)
            headers = {'Origin': self.settings.cors_origins[0], 'User-Agent': 'ExampleBot'}
            self.assertEqual((await client.post('/api/analytics/visits', json=body, headers=headers)).status_code, 204)
            headers['User-Agent'] = 'Mozilla/5.0'
            for _ in range(2):
                self.assertEqual((await client.post('/api/analytics/visits', json=body, headers=headers)).status_code, 204)
            response = await client.get('/api/analytics/summary')
            self.assertEqual(response.headers['cache-control'], 'no-store')
            self.assertEqual(response.json()['overview']['total_pv'], 1)
            self.assertNotIn('visitor', response.text)
            body['path'] = '//evil.example/'
            self.assertEqual((await client.post('/api/analytics/visits', json=body, headers=headers)).status_code, 422)
