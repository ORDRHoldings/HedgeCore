from ..core.celery_app import celery

@celery.task(name="example.add", queue="calc_queue")
def add(a: int, b: int) -> int:
    return a + b
