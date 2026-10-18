FROM python:3.12-slim
WORKDIR /app
COPY server.py ./
COPY public ./public
ENV DATA_DIR=/data PORT=8080
EXPOSE 8080
CMD ["python3", "-u", "server.py"]
