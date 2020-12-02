SHORT_LATEST_COMMIT=`git rev-parse --short HEAD`
LOG_LATEST_COMMIT=`git log -1 | cat`

docker build --tag=lion:latest --build-arg SHORT_LATEST_COMMIT="$SHORT_LATEST_COMMIT" --build-arg LOG_LATEST_COMMIT="$LOG_LATEST_COMMIT" .
docker run --tmpfs /tmp -d lion:latest
