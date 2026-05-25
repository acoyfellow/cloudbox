FROM docker.io/cloudflare/sandbox:0.10.1

RUN apt-get update -qq \
  && apt-get install -y -qq --no-install-recommends ca-certificates curl git jq openssh-client python3 ripgrep \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

RUN rm -rf /home/user && mkdir -p /home/user/.config /home/user/src

ENV XDG_CONFIG_HOME=/home/user/.config \
    HOME=/home/user

WORKDIR /home/user
