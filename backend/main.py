from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.cache.redis import close_redis, init_redis, redis_is_ready
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.db.session import close_database, database_is_ready, init_database
from app.middleware.request_context import RequestContextMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware

settings = get_settings()
configure_logging(settings)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("application.starting", extra={"environment": settings.environment})
    await init_redis(app)
    try:
        if settings.database_auto_create:
            await init_database()

        if settings.startup_check_dependencies:
            database_ready = await database_is_ready()
            redis_ready = await redis_is_ready(app.state.redis)
            if not database_ready or not redis_ready:
                raise RuntimeError(
                    "Dependency startup check failed "
                    f"(database={database_ready}, redis={redis_ready})"
                )

        logger.info("application.started")
        yield
    finally:
        logger.info("application.stopping")
        await close_redis(app)
        await close_database()
        logger.info("application.stopped")


def create_app() -> FastAPI:
    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        debug=settings.debug,
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        lifespan=lifespan,
    )

    application.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.trusted_hosts,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=settings.cors_allow_methods,
        allow_headers=settings.cors_allow_headers,
    )
    application.add_middleware(SecurityHeadersMiddleware)
    application.add_middleware(RequestContextMiddleware)

    return application


app = create_app()
