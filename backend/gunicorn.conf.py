bind = "0.0.0.0:8000"

workers = 2            # start small; scale horizontally
worker_class = "uvicorn.workers.UvicornWorker"
threads = 1

timeout = 30
graceful_timeout = 20
keepalive = 5

max_requests = 1000
max_requests_jitter = 100

loglevel = "info"
accesslog = "-"
errorlog = "-"

preload_app = True
