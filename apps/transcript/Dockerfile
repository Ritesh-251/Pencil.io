FROM python:3.12-slim

WORKDIR /app

COPY apps/transcript/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY apps/transcript /app

ENV PYTHONUNBUFFERED=1

CMD ["python", "agent.py", "start"]
