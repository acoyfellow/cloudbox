FROM golang:1.24 AS artifact-fs-build
COPY vendor/certs/cloudflare-warp-ca.pem /usr/local/share/ca-certificates/cloudflare-warp-ca.crt
RUN update-ca-certificates
WORKDIR /src
COPY vendor/artifact-fs/go.mod vendor/artifact-fs/go.sum ./
RUN go mod download
COPY vendor/artifact-fs/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o /artifact-fs ./cmd/artifact-fs

FROM docker.io/cloudflare/sandbox:0.10.1
COPY vendor/certs/cloudflare-warp-ca.pem /usr/local/share/ca-certificates/cloudflare-warp-ca.crt
RUN update-ca-certificates

RUN apt-get update -qq \
  && apt-get install -y -qq --no-install-recommends ca-certificates curl fuse3 git jq openssh-client python3 ripgrep \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY --from=artifact-fs-build /artifact-fs /usr/local/bin/artifact-fs
COPY scripts/mount-artifact-fs-repo.sh /usr/local/bin/cloudbox-mount-repo
RUN chmod +x /usr/local/bin/artifact-fs /usr/local/bin/cloudbox-mount-repo

RUN rm -rf /home/user && mkdir -p /home/user/.config /home/user/src

ENV XDG_CONFIG_HOME=/home/user/.config \
    HOME=/home/user

WORKDIR /home/user
