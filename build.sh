docker build -t oncledave/verisure2mqtt .
docker-compose up -d
docker logs verisure2mqtt -f
